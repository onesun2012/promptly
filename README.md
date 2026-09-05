# ✦ Promptly

**Select anything. Ask any AI.**

[![GitHub release](https://img.shields.io/github/v/release/onesun2012/promptly)](https://github.com/onesun2012/promptly/releases/latest)
[![GitHub Downloads](https://img.shields.io/github/downloads/onesun2012/promptly/total)](https://github.com/onesun2012/promptly/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-7C5CFF.svg)](LICENSE)
[![Sponsor](https://img.shields.io/badge/♥%20Sponsor-GitHub%20Sponsors-7C5CFF)](https://github.com/sponsors/onesun2012)

Windows 上最好用的 **Local-first BYOK 划词 AI**：在任意应用里选中文字 → 弹出工具条 → 用**你自己的 API key**（智谱 / OpenAI 兼容 / Anthropic / Gemini）直接询问 AI。无账号、无云端中继、零内容遥测。

<p align="center">
  <img alt="Promptly toolbar" src="site/img/toolbar.gif" width="560">
</p>

## ✨ 功能

- **划词三态工具条** — 选中即出条：提问 / 翻译 / 改写 / 总结 / 解释，流式结果就地展示，[Copy] 一键复制，「在聊天中打开」接着追问
- **悬浮球** — 常驻低存在感，可拖拽，点击开聊天
- **任意模型 BYOK** — OpenAI 兼容（智谱/DeepSeek/OpenRouter…）/ Anthropic / Gemini 三协议适配器，直连官方 API
- **粘贴截图识别** — 聊天窗 Ctrl+V 贴图，视觉模型看图说话
- **本地优先** — 对话存本地 SQLite；API key 经 Windows DPAPI 加密，仅本机可解
- **6+4 语种** — en / fr / de / es / ja / ko / 简体中文 / 繁體中文 / Русский / العربية(RTL)

## 📥 下载

前往 [**GitHub Releases（最新版）**](https://github.com/onesun2012/promptly/releases/latest) 下载 `Promptly-Setup-x64.exe`（免管理员，per-user 安装）。

> 未签名版本首次运行时 Windows SmartScreen 可能提示，点「更多信息 → 仍要运行」即可。

## 🚀 快速上手

1. 安装并启动，悬浮球出现在屏幕右缘
2. 打开设置（托盘右键 → Settings），在 **Provider lab** 填入你的 API Base URL + Key → **Test connection** → **Save**
3. 在任意应用选中文字 → 工具条弹出 → 点「翻译」看结果
4. `Alt+Space` 呼出聊天窗，`Ctrl+Shift+A` 划词

详见 [隐私说明](PRIVACY.md)（本地存什么、上报什么、怎么关）。

## 🖼 截图

| 划词工具条 | 聊天窗 | 设置 |
|---|---|---|
| ![](site/img/toolbar.png) | ![](site/img/chat.png) | ![](site/img/settings.png) |

## ♥ 赞助

Promptly 免费、开源（MIT）、无广告。如果它帮到了你：

- [GitHub Sponsors](https://github.com/sponsors/onesun2012)（海外推荐）
- [Ko-fi](https://ko-fi.com/)（请杯咖啡）
- [爱发电](https://afdian.com/)（国内月捐）
- 国内扫码：设置 →「♥ 支持 Promptly」（微信 / 支付宝）

## 🛠 开发

要求 Node.js ≥ 20、npm ≥ 10。

```bash
npm install
npm run dev        # 开发（自动先编译 C# 取词辅助进程）
npm run typecheck && npm run lint
npm run dist       # NSIS 安装包 → dist/
```

- Product spec: [SPEC.md](SPEC.md)
- CN 网络镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

## 📄 License

[MIT](LICENSE) © 2026 onesun2012
