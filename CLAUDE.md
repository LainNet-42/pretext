AGENTS.md

## Project: ASCII Growth Video Art

独立艺术作品。ASCII树生长动画 + 绫波丽独白语音。

### Dev Server
bun原生在Windows有路由bug，用 `bun serve.ts` 启动（端口3000）。

### Key Files
- `pages/demos/red-thread.html/ts` - ASCII树生长动画（主demo）
- `pages/demos/fluid-ascii.html/ts` - 流体烟雾ASCII demo
- `pages/demos/showcase.html/ts` - 双栏文字回流demo
- `serve.ts` - Windows dev server workaround
- `scripts/stitch-voice.py` - 拼接语音段 + 生成timeline.json
- `scripts/capture-and-encode.py` - Puppeteer截帧 + FFmpeg合成视频
- `output/timeline.json` - 语音时间轴（每段start_ms/end_ms）
- `output/voice_stitched.wav` - 拼接后的完整语音
- `output/final/ascii_growth.mp4` - 最终视频
- `worklog.md` - 实时工作日志

### Production Pipeline (IMPORTANT - 严格按顺序)

```
Step 1: VISUAL
  - 设计动画phases，每个phase独立可调
  - 在浏览器里反复看，调到每一帧满意
  - 确定每个phase的精确时长（秒）
  - 导出phase时间表

Step 2: SCRIPT
  - 看着动画写台词，每句话对应一个visual phase
  - 用丽的说话方式：短句、断裂、……省略号
  - 台词长度要match visual phase的时长

Step 3: VOICE
  - 每句话单独调 mouth skill 生成（短句最佳）
  - 拿回每段精确duration(ms)
  - 用 stitch-voice.py 拼接，固定200ms间隔
  - 输出 voice_stitched.wav + timeline.json

Step 4: SYNC
  - 把 timeline.json 导入动画代码
  - 动画phase的时长 = 对应语音段的时长（不是反过来！）
  - 如果不匹配就调语音（重新生成/加减间隔），不要动画面

Step 5: COMPOSE
  - bun serve.ts 启动dev server
  - python scripts/capture-and-encode.py [--bgm path] [--bgm-vol 0.3]
  - Puppeteer截帧(15fps, 1080x1920) + FFmpeg编码
  - 输出 output/final/ascii_growth.mp4
```

**核心原则：画面是主体，声音配合画面。绝不用声音驱动画面。**

### Voice Tech
- mouth skill: `C:/Users/Administrator/.openclaw/workspace/skills/mouth/speak.py`
- TTS: Qwen3-TTS + RVC (Rei Ayanami voice)
- 调用: `C:/ProgramData/miniconda3/envs/mm/python.exe speak.py --text "..." --lang Japanese`
- 最佳实践: 短句、日文标点控制停顿（、。……）、每句单独生成
- 原始wav采样率: 40000Hz（silence也要用40000Hz！）

### Capture Tech
- Puppeteer截帧，用.cjs文件（项目是ESM，require不能用.js）
- 通过override requestAnimationFrame控制时间轴
- 每帧advance固定ms然后screenshot
- FFmpeg: frames + voice [+ BGM] -> MP4 (libx264, crf 18, aac 192k)
- BGM混音: amix, normalize=0, 自动检测leading silence

### Animation Architecture
- red-thread.ts 从 timeline.json 读取segment时间
- 每个segment对应一个VIS状态 [growT, rainIntensity, brightness]
- segment之间用smoothstep插值
- 树形用offscreen canvas渲染(R=trunk, G=leaf, B=fruit)再采样到ASCII网格
- 字符集: trunk=#|!I, branch=/\~-, leaf=*oO@, fruit=@0OQ, rain=|:.'
- 背景散落噪点符号 &*$%^#@ 极淡闪烁
