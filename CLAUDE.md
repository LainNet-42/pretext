AGENTS.md

## Project: ASCII Video Art

ASCII动画 + 绫波丽语音 + BGM = 短视频。竖屏9:16。

### Dev Server
bun原生Windows路由bug，用 `bun serve.ts`（端口3000）。

### Key Files
- `pages/demos/lotus-fall.html/ts` - 莲花落字动画（当前主demo）
- `pages/demos/red-thread.html/ts` - ASCII树生长动画
- `serve.ts` - Windows dev server workaround
- `scripts/capture-and-encode.py` - Puppeteer截帧 + FFmpeg合成视频
- `scripts/stitch-voice.py` - 语音拼接（备用，当前直接用raw wav）
- `output/voice_stitched.wav` - 最终语音（含1.5s lead silence）
- `output/final/ascii_growth.mp4` - 最终视频

### Production Pipeline

```
1. VISUAL: 设计动画，浏览器反复调，确定每phase时长
2. SCRIPT: GT-style短句（名词,描述。不用ている等复杂活用形）
3. VOICE: 一次性生成整段，用……分隔segments，silencedetect找时间点
4. SYNC: 动画timing对齐语音自然时间点，per-line typeSpeed = text.length / voiceDur
5. COMPOSE: capture-and-encode.py --bgm path --bgm-vol 0.6
```

**核心：画面主体，声音配合。**

### Voice (mouth skill) - 踩坑总结

- 路径: `C:/Users/Administrator/.openclaw/workspace/skills/mouth/speak.py`
- 调用: `C:/ProgramData/miniconda3/envs/mm/python.exe speak.py --text "..." --lang Japanese`
- **GT-style断句最重要**：参考ref text "山,重い山。時間をかけて変わる物。" 用半角逗号`,`和句号`。`
- **不要用ている/ていた等活用形**，TTS念不准。用短名词句：`何か,動く物` 而不是 `何かが動いている`
- **长文本后段质量下降**（变快/变怪）：已知TTS问题。解决方案：
  - 整段一次生成（保持音色一致），如果后段不好就重新roll
  - 或者前段+后段分两批生成再拼接
- **段间用……分隔**（6个点），段内用`,`和`。`控制节奏
- **采样率40000Hz**：silence/adelay都要匹配这个sr
- **随机性大**：同样的text每次生成结果不同，不满意就重跑

### Capture Tech

- Puppeteer截帧，`.cjs`文件（项目ESM）
- override requestAnimationFrame控制时间轴
- **viewport要匹配内容**：540x960 DPR2 = 1080x1920输出。内容64行x45列 @ 13px/15px
- **60fps会生成大量帧**（22s = 1320帧），需要 `--max-old-space-size=4096`，timeout 600s
- FFmpeg: CRF 14（暗背景+细字需要高码率），libx264, aac 192k
- BGM: amix normalize=0, 自动检测leading silence跳过
- **adelay添加lead silence**：`ffmpeg -af "adelay=1500|1500"` 比concat可靠

### Animation Architecture (lotus-fall)

- 45x64 grid，WATER_ROW=28（44%）
- 字幕row 8，中文字幕row 9（括号包裹，dimmer）
- **CJK双宽度**：isCJK()检测，visualWidth()算列宽，charOffsets()定位
- 2D wave simulation：wave0/wave1 float32 交替步进，DAMPING 0.984
- 落字→splash粒子→波纹→ghost沉底→能量累积→莲茎→花瓣→光柱向上
- TV shutdown closing：二次方压缩→水面亮线→渐隐→黑
- 每行独立typeSpeed = text.length / voiceDur（精确同步语音）

### PERFORMANCE — 不要让用户的电脑卡死

**严格禁止**：任何会让浏览器Tab卡到抢鼠标的操作。用户的电脑被卡过一次，不能再有第二次。

### Hot loop (per-frame 60fps) 必须避免的模式：

1. **禁止per-frame allocation**：
   - ❌ `const tmp = new Float32Array(wave0)` 每帧分配N元素
   - ✅ 预分配一个全局swap buffer在init时，用`.set()`复制
   - 每帧allocation会触发GC pause，直接看得见的jank

2. **禁止setTimeout/setInterval在frame loop里排程**：
   - ❌ `setTimeout(() => waveBurst(...), 200)` 和frame loop异步，无法预测
   - ✅ `scheduleBurst(s + 0.2, ...)` + `processPendingBursts(s)` 在frame loop内按时间戳触发

3. **禁止多次同事**：
   - ❌ `waveStep(); waveStep()` 每帧两次全grid O(N²)遍历
   - ✅ 一次就够，想更平滑就降damping

4. **边界限制simulation area**：
   - ❌ 45×64 = 2880 cells全部跑wave sim
   - ✅ 定义SIM_TOP/SIM_BOT只在active区域运算（比如rows 10-58 = 48行）

5. **禁止mouse/text selection被DOM更新干扰**：
   - HTML必须有 `user-select:none; -webkit-user-select:none; pointer-events:none` 在 `#art` 和 `.r`
   - 每帧innerHTML重写会打断selection和focus，不加这俩属性会抢鼠标

6. **render loop cell访问cache**：
   - ❌ 每cell都 `wave0[y*SIM_W+x]`
   - ✅ 外层循环cache `const yi = y * SIM_W`，内层`wave0[yi + x]`

### Server health

- bun dev server会crash（windows port binding race等）。修性能问题前先确认server还在：
  `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/demos/xxx`
- 200 = OK；000/404 = server挂了需要重启：
  `cd F:/projects/pretext && bun serve.ts &`

### 改代码前的performance checklist

每次改frame loop前，先过一遍：
- [ ] 没有new X(...) 分配
- [ ] 没有setTimeout
- [ ] SIM范围最小化
- [ ] HTML有pointer-events:none
- [ ] waveStep只调一次
- [ ] Map/Set每帧new但是小 (<2k entries) — 可以接受但密切关注

### Pretext library真正用法（不是自己造simulation！）

**关键API**（看`F:/projects/bad-apple-pretext`的main.js for reference）：
- `prepareWithSegments(text, font)` → 预处理一段文本，返回`PreparedTextWithSegments`（glyph metrics都算好了）
- `layoutNextLine(prepared, cursor, maxWidth)` → 从cursor位置开始，返回能塞入maxWidth像素的下一行文本和新cursor
- 这是库的**本职**：让文字流过任意形状的width segments
- **Bad Apple approach**：视频帧→RLE binary segments → 每帧用`layoutNextLine`让歌词流过白色区域
- 我们的demo不应该用`spans`和手工cell rendering，应该用canvas + layoutNextLine API
- 这才是"pretext demo"，否则就是在用pretext项目的壳做无关动画
