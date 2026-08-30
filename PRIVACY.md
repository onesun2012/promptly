# Promptly 隐私说明

> 最后更新：2026-08-30 · 适用版本 v1.0.0+

一句话：**你的选中内容、对话和 API key 只存在你自己的电脑上，经过我们的服务器为零。**

## 我们不做什么

- ❌ 不收集、不上传、不分析你的任何选中文字、对话内容、粘贴的图片
- ❌ 不要求注册账号，没有我们的账号体系
- ❌ 不做内容遥测（你问 AI 什么、AI 答什么，我们永远不知道）
- ❌ 不含广告、不打包分发第三方跟踪 SDK

## 数据存放位置（全部在本机）

| 数据 | 位置 | 保护 |
|------|------|------|
| 模型 API key | `%APPDATA%/promptly/providers.json` | Windows DPAPI（safeStorage）加密，仅本机当前用户可解密 |
| 对话记录 / SQLite | `%APPDATA%/promptly/promptly.db` | 明文本地文件，随应用卸载保留（可在设置删除会话） |
| 设置 | `%APPDATA%/promptly/settings.json` | 明文本地文件 |

卸载应用不会删除以上数据（`deleteAppDataOnUninstall: false`）；需要彻底清除请手动删除 `%APPDATA%/promptly` 文件夹。

## API 请求走向

你在 Promptly 里发起的每一次 AI 请求，都由**你的设备直接发送到你配置的模型服务商**（如智谱、Anthropic、Google）。请求不经过我们的任何服务器——我们没有中继、没有代理、没有日志。你对服务商的隐私约束以该服务商的政策为准。

## 唯一的一次匿名上报（可关闭）

为了统计总安装量，应用在**每个新版本首次启动时**发送一个 HTTP GET 请求，参数只有：

- 应用版本号（如 `v=1.0.0`）
- 操作系统（`os=win`）

**不包含**：任何选中/对话内容、硬件信息、机器标识、IP 关联分析、使用时长、崩溃信息。除此之外应用不再发起任何对我们服务器的请求。

**关闭方法**：设置 → 取消勾选「匿名安装统计」。关闭后应用零外呼（除你主动发起的模型 API 请求与更新检查）。

## 更新检查

应用打包版会连接 GitHub Releases（`api.github.com` / `github.com`）检查新版本。这不涉及你的任何内容，仅拉取版本清单文件。

## 联系

隐私问题请联系：tonny2008@gmail.com

---

# Privacy Statement (English summary)

**Promptly is local-first.** Your selected text, conversations, screenshots, and API keys never leave your machine except in requests your device sends **directly to the AI provider you configured**. We have no servers in that path, no accounts, and no content telemetry.

**The single anonymous request**: on first launch of each new version, the app sends one GET with only the app version and OS (`?v=1.0.0&os=win`) to an install counter. No content, no identifiers, no fingerprinting. Disable it in Settings → uncheck "Anonymous install counter". The packaged app also checks GitHub Releases for updates.

**Data locations** (all local): API keys encrypted with Windows DPAPI in `%APPDATA%/promptly/providers.json`; conversations in `%APPDATA%/promptly/promptly.db`; settings in `settings.json`. Uninstalling keeps your data; delete the folder to wipe.

Contact: tonny2008@gmail.com
