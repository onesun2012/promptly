# Promptly — Product SPEC v1.1

> **Windows 上最好用的 Local-first BYOK 划词 AI**
>
> | | |
> |---|---|
> | 项目名 | Promptly（曾用代号 ai_desk） |
> | 仓库 | https://github.com/onesun2012/promptly.git |
> | 版本 | SPEC v1.1（2026-08-29） |
> | 状态 | 已评审（ChatGPT 外部评审 82/100，意见已吸收） |
> | 平台 | v1.0 Windows 10/11 x64 → macOS（达标后）→ Linux（待评估） |
> | 形态 | Electron 桌面应用 + 原生取词辅助进程 |

---

## 0. 决策记录（Requirement Q&A Log）

| # | 问题 | 决策 | 依据 |
|---|---|---|---|
| Q1 | 核心痛点是什么 | **接入所有 AI API（BYOK）**，自由配置 key/模型/端点 | 用户确认 |
| Q2 | 商业形态 | **免费 + 未来 Pro 订阅**（海外市场） | 用户确认 |
| Q3 | 免费/Pro 边界 | **先全功能免费（捐赠制）→ 有用户量后转"云同步型 Pro"**；存量功能永不收费 | 用户确认（精益路径） |
| Q4 | UI 语言 | **英文（源语言）+ 法/德/西/日/韩**，共 6 语种 | 用户确认（纯海外定位） |
| Q5 | 划词触发方式 | **双模式可切**：默认"选中即弹"，可切"快捷键触发" | 用户确认 |
| Q6 | 技术背景 | 前端/Node 与后端之间，预留 1-2 周 Vue3/TS 爬坡 | 用户确认 |
| 补充 | 平台范围 | macOS 以后必须支持；Linux(Ubuntu) 希望支持 → 评估结论：**进路线图不进 v1**（Wayland/GNOME 上悬浮球与全局钩子受限，单人维护矩阵过重） | 用户提问 + 评估 |
| 补充 | 命名/仓库 | Promptly，`github.com/onesun2012/promptly`，Conventional Commits | 用户确认 |

### 参考来源评估

| 来源 | 结论 |
|---|---|
| 本机豆包逆向观察 | 自研 Chromium 壳（非 Electron）+ Web UI + **原生辅助进程群**（gwps.exe 等）。可借鉴**架构思想**（Web UI 与原生能力分离、辅助进程隔离），不可复制代码 |
| `docs/chatgpt分析.md` | 82/100 外部评审。吸收：Selection 状态机、Native 辅助进程 + IPC 协议、SensitiveFieldDetector（Unknown→不动作）、剪贴板完整性、Provider 能力模型、Test Connection、误触发率主指标、里程碑制路线图、定位收窄 |
| [bragi](https://github.com/isyuricunha/bragi)（开源） | 同类极简实现：Windows 全系统划词 + BYOK + DPAPI + 剪贴板回退还原 + 全局快捷键。**验证技术路线现实可行**；精读笔记见 `docs/bragi精读笔记.md` |
| `E:\learn\jdza_kk`（京东鲸小助） | **无参考价值，已排除**：Electron 内部工单自动化工具，无钩子/取词/UIA/剪贴板/AI 相关代码 |

---

## 1. Problem Statement（问题陈述）

海外开发者和知识工作者在任意应用（浏览器、办公软件、编辑器）中选中文字时需要立即求助 AI，但现有方案存在结构性缺口：

- **官方桌面 AI**（豆包类）：锁死自家模型与账号体系，无法使用用户自己的 API key、自选模型或本地模型；
- **Raycast 等 launcher 类**：已支持 BYOK + 划词，但 API 请求需经其服务器中继（信任与合规顾虑），且 Windows 端 AI 能力薄弱、产品重心不在划词；
- **浏览器插件**：只能覆盖浏览器单一环境，覆盖不了 WPS、VSCode 等本地应用。

用户需要一个 **key 自己管、请求直连、全桌面划词即问** 的本地 AI 入口。

### 定位与差异化

> **一句话定位：Windows 上最好用的 Local-first BYOK 划词 AI。**（不做另一个 Raycast / AskAny）

差异化栈：`Windows-first + Local-first + BYOK + 零账号 + API 直连零中继 + 划词原生体验`

- **API 直连零中继**是最锋利的一刀：Promptly 的请求从用户设备直接发往用户配置的 Provider 端点，不经过任何中间服务器（对比 Raycast 请求过它的服务器）；
- 宣传语使用 **"Bring Your Own AI Provider"**，不使用"所有 AI API 都能用"（期望管理 + 商标/法律风险）。

### 目标用户

海外（美/欧/日韩）开发者与技术写作者；隐私敏感、已有自己的 API key 或本地模型（Ollama/LM Studio）；对 Electron 类工具的内存占用有一定容忍，但反感账号墙与遥测。

---

## 2. Proposed Solution（方案描述）

Electron 应用，架构借鉴豆包的"Web UI + 原生辅助进程隔离"模式：

### A. Selection Detection Pipeline（产品之魂）

> 划词是入口，BYOK 是基础设施，AI Action 才是价值输出。悬浮球、聊天窗、数据库、i18n 均为外围。

**独立原生辅助进程**实现（崩溃不影响主程序），全程由**显式状态机**驱动：

```
IDLE → MOUSE_DOWN → SELECTING(位移阈值判定)
     → MOUSE_UP → CHECK_APPLICATION(黑名单/白名单)
     → CHECK_SENSITIVE(SensitiveFieldDetector)
     → CAPTURE_TEXT(UIA 优先)
        ├─ 成功 → VALIDATE(非空/去抖/长度) → SHOW_TOOLBAR
        └─ 失败 →(仅当字段确认非敏感) CLIPBOARD_FALLBACK → VALIDATE → SHOW_TOOLBAR
SHOW_TOOLBAR → USER_ACTION → SEND_TO_AI → STREAMING → DONE
任意环节失败/取消 → NO_ACTION → IDLE
```

- **SensitiveFieldDetector**：识别 Password / PIN / Security Code / Credit Card / SSN / Private Key / Token 类字段；核心安全原则——**"无法确定是否安全时，默认不动作"（Unknown → DO NOT COPY）**；
- **取词链**：UIA TextPattern 优先（Chromium 系浏览器、VSCode、记事本）；失败回退剪贴板方案（WPS/旧程序）：备份多格式剪贴板 → 模拟 Ctrl+C → 读取 → **完整还原原剪贴板**（剪贴板完整性有专项测试：文本/图片/HTML/文件多格式）；
- **辅助进程选型**：优先 Windows 内置 .NET/PowerShell UI Automation（零额外分发依赖），能力不足再升级 C# AOT 单文件；
- **正式 IPC 协议**（JSON over stdio，协议文档化，禁止"辅助进程自己搞一堆东西"）：见附录 C；
- **触发双模式**（Q5）：默认"拖选释放即弹"（全局鼠标钩子）；设置可切"快捷键触发"（默认 `Ctrl+Shift+A`，无钩子实现）；
- **干扰控制**：纯点击（无位移）不触发；应用黑名单；密码框绝不触发；工具条点击别处即消失；弹出位置避让屏幕边缘。

### B. Provider 抽象层（BYOK 核心卖点）

```ts
interface AIProvider {
  listModels(): Promise<Model[]>;
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;  // ChatChunk{type: text|reasoning|error|done}
  validateConfig(): Promise<ValidationResult>;
}
```

- **v1 内置三个适配器**（覆盖 95% 海外用户）：① OpenAI 兼容协议（OpenAI / OpenRouter / Groq / Mistral / Ollama / LM Studio / 任意中转站，自定义 base_url）；② Anthropic 原生；③ Gemini 原生；
- **能力模型（Capability Model）**：`{streaming, vision, reasoning, tools, jsonMode}` —— "OpenAI 兼容"端点之间在流式格式/错误格式/工具调用/推理字段上**并不真兼容**，逐端点探测，UI 按能力显隐功能，不假设一致；
- **Test Connection 向导**（BYOK 产品刚需）：填 Base URL / API Key → 拉取模型列表 → 选模型 → 发送测试请求 → 成功打勾；
- **Key 安全**：Electron 内置 `safeStorage` API 加密存储（Windows 底层即 DPAPI，Bragi 已验证该路线；零原生模块）；多套配置可命名、可一键切换。

### C. 外围组件

| 组件 | 规格 |
|---|---|
| **聊天窗** | 400×640 无边框卡片窗；多会话列表；流式输出 + Markdown + 代码高亮；底部输入框；可置顶；全局快捷键 `Alt+Space` 呼出/隐藏 |
| **悬浮球** | 48px 置顶无边框圆形小窗；默认屏幕右侧垂直居中；可拖动，位置持久化（重启/重启系统均保留）；左键展开聊天窗，右键菜单（置顶/设置/退出） |
| **Action 系统** | `Action {id, name, prompt, icon}`；内置：AI 提问 / 翻译 / 总结 / 解释 / 复制；**自定义动作不限量、永久免费**（Pro 只卖云同步——商业化矛盾消解） |
| **设置页** | Providers 管理（含 Test Connection）、划词开关/模式/黑名单、快捷键自定义、开机自启、界面语言、捐赠入口（GitHub Sponsors + Ko-fi） |

### D. 数据模型（better-sqlite3，sync-ready）

核心表：`providers` / `provider_models` / `conversations` / `messages` / `prompts`(自定义 Action) / `settings`。schema 干净、带导出/导入，为未来云同步预留（详见附录 B）。

### E. 技术栈与分发

- **技术栈**：Electron 30+ / TypeScript / Vue3 + Vite + Pinia / better-sqlite3 / uiohook-napi（全局鼠标钩子）/ electron-updater；
- **分发**：electron-builder + NSIS；安装页"开机自动启动"勾选框（**默认勾选**）→ 写 HKCU Run 键；GitHub Releases 分发 + 自动更新；
- **i18n**：英文为源语言，v1 同步上线 法/德/西/日/韩（vue-i18n，无硬编码文案）；
- **隐私**：零内容遥测（划词与对话内容不出用户设备、直连所配 Provider）；仅 opt-in 匿名崩溃上报（Sentry）；隐私政策页；
- **商业化预留**（v1 不实现，架构留位）：`isPro` feature flag（恒 true）+ sync-ready 数据模型 + 备忘（Supabase 账号 + LemonSqueezy 订阅，用户量达标后 2-4 周可接入）。

### F. 里程碑（不预承诺平台版本号）

```
M0  Windows 壳：脚手架 / 窗口管理 / 打包链路        （1 周）
M1  Selection Pipeline：钩子 + UIA + 剪贴板回退 + 敏感检测 + 状态机   （2-3 周，最难先行）
M2  Provider 层：3 适配器 + 能力模型 + Test Connection               （1-2 周）
M3  聊天窗 + 多会话 + 历史持久化                                     （1-2 周）
M4  悬浮球 + 快捷键 + i18n + 安装器/自启 + 自动更新                  （1 周）
v1.0 发布 → 验证需求（3000 下载 / 200 WAU）
    ├─ 达标 → 启动云同步 Pro + macOS
    └─ 不达标 → 迭代定位，不追加平台投入
```

Linux(Ubuntu) 挂起待评估：架构保留 `CaptureProvider` 平台抽象接口（Windows: UIA+剪贴板 → macOS: Accessibility → Linux/X11: PRIMARY selection），届时移植 = 新增模块而非重写。

---

## 3. Technical Constraints（技术约束）

1. v1 仅 **Windows 10/11 x64**；应用不申请管理员权限（管理员进程取不到词，FAQ 明示已知边界）；
2. "OpenAI 兼容"仅保证基础 Chat Completion + 流式；其余能力靠 Capability Model 探测显隐；
3. 取词明确不保证：受保护 PDF、DRM 内容、管理员权限进程；**敏感字段绝不回退剪贴板；Unknown 默认不动作**（安全红线）；
4. EV 代码签名证书为必买预算项（约 $200-500/年），否则 SmartScreen 拦截下载转化；
5. Electron 与辅助进程间 IPC 协议必须文档化并做版本兼容；
6. 单人开发 + 学习爬坡（Vue3/TS 约 1-2 周）：采用官方脚手架与成熟库，自研仅限取词辅助进程；
7. 资源约束：悬浮球空闲内存 < 150MB；7×24 挂机无泄漏。

---

## 4. Non-goals（明确不做的事 · v1.0）

- ❌ macOS / Linux 交付物（架构预留接口；验证达标后再启动）
- ❌ 账号系统 / 支付 / Pro 功能（捐赠制上线：GitHub Sponsors + Ko-fi；只留 isPro flag）
- ❌ **Replace-in-place（结果写回原应用选区）**——涉及跨进程焦点管理与模拟 Ctrl+V，复杂度高，列 v1.x 候选；v1.0 只做"复制结果"
- ❌ 截图/图片理解等多模态、语音输入、朗读
- ❌ Launcher / 自动化 / 剪贴板管理（Raycast 领域，不做）
- ❌ 内置浏览器、联网搜索、内容推荐流
- ❌ 移动端、团队协作/分享/社区功能
- ❌ 划选非文本对象（图片/表格）

---

## 5. Success Criteria（成功标准）

### 质量（可测试）

1. **误触发率 < 1%；密码框误触发 = 0；普通拖拽（窗口移动/游戏）误触发 < 0.5%**（主指标——用户感知不到 150ms 与 300ms 的差别，但感觉得到"烦"；"≤300ms 弹条"降级为内部性能预算）；
2. Chrome / Edge / VSCode / 记事本 / WPS 文字各 10 段划词，取词成功率 ≥ 90%，工具条弹出正确；
3. Test Connection 向导：任意 OpenAI 兼容端点 5 分钟内完成首次流式对话；划词 → 翻译 → 首字 ≤ 2s（视 API 首字延迟）；
4. 剪贴板多格式完整性测试通过（还原后与备份逐格式一致）；
5. NSIS 安装勾选自启 → 重启系统悬浮球自动出现；卸载可清理注册表 Run 键与用户数据；
6. 崩溃率 < 0.5% 会话；悬浮球挂机 24h 内存 < 150MB；6 语种切换无硬编码遗漏。

### 产品（发布后 3 个月）

7. GitHub ≥ 500 star；累计下载 ≥ 3000；周活 ≥ 200；次周留存 ≥ 30%；
8. 达标 → 启动"云同步 Pro"商业化评估；**不达标 → 不投 macOS/Linux**。

---

## 6. 工程规范

- **提交**：Conventional Commits 1.0（`feat: / fix: / docs: / refactor: / test: / chore: / build: / ci:`，可选 scope 如 `feat(selection): ...`）；每个提交可独立构建；详见 `docs/CONTRIBUTING.md`；
- **版本**：SemVer；`v*` tag 触发 GitHub Release 并由 electron-updater 分发；
- **分支**：单人主干开发（main 保持可构建）；实验性改动开短期分支；
- **目录**：`src/` 源码、`docs/` 设计文档（入库）、`references/` 第三方参考代码（gitignore，不入库）；
- **红线**：任何 API key / .env 不入库。

---

## 附录 A：Selection 状态机完整定义

| 状态 | 进入条件 | 退出动作 |
|---|---|---|
| IDLE | 初始 / 任何失败后 | mouse_down 且左键 |
| MOUSE_DOWN | 左键按下 | 移动超位移阈值 → SELECTING |
| SELECTING | 位移 > 6px | mouse_up → MOUSE_UP |
| MOUSE_UP | 左键释放 | 取前台窗口 → CHECK_APPLICATION |
| CHECK_APPLICATION | 查黑名单/窗口类 | 通过 → CHECK_SENSITIVE；命中黑名单 → IDLE |
| CHECK_SENSITIVE | SensitiveFieldDetector | 非敏感 → CAPTURE_TEXT；敏感/Unknown → IDLE（不弹条不回退） |
| CAPTURE_TEXT | UIA GetSelection | 成功 → VALIDATE；失败且非敏感 → CLIPBOARD_FALLBACK |
| CLIPBOARD_FALLBACK | 备份剪贴板→Ctrl+C→读取→还原 | 成功 → VALIDATE；失败 → NO_ACTION |
| VALIDATE | 文本非空/去抖/长度 ≤ 上限 | 通过 → SHOW_TOOLBAR；不通过 → IDLE |
| SHOW_TOOLBAR | 定位弹条（避屏幕边缘） | 用户点动作 → USER_ACTION；失焦/Esc → IDLE |
| USER_ACTION | 选择 Action | 组装 prompt → SEND_TO_AI |
| SEND_TO_AI | 直连 Provider | 首包 → STREAMING；错误 → 错误态 → IDLE |
| STREAMING | 流式渲染 | done → DONE |
| DONE | 展示结果（复制按钮） | 关闭 → IDLE |

快捷键模式：跳过 MOUSE_* 三态，由快捷键直接进入 CAPTURE_TEXT。

## 附录 B：数据模型（v1 核心表）

```sql
providers(id, name, protocol /* openai|anthropic|gemini */, base_url, api_key_enc,
          capabilities_json, created_at, updated_at)
provider_models(id, provider_id, model_id, display_name, enabled)
conversations(id, title, provider_id, model_id, created_at, updated_at)
messages(id, conversation_id, role, content, tokens_in, tokens_out, created_at)
prompts(id, name, icon, prompt_template, is_builtin, sort_order, enabled)
settings(key, value_json, updated_at)
-- AppState（窗口/划词配置，存 settings）：floating_ball_position, chat_window_rect,
-- selection{enabled, mode, hotkey, blacklist[]}, active_provider_id, language
```

## 附录 C：主进程 ↔ 取词辅助进程 IPC 协议（JSON over stdio）

```jsonc
// 辅助进程 → 主进程
{"type":"selectionCaptured","id":"...","text":"...","app":"chrome","windowTitle":"...","isSensitive":false,"method":"uia|clipboard"}
{"type":"captureFailed","id":"...","reason":"uia_unsupported|clipboard_failed|sensitive_blocked"}
{"type":"heartbeat","pid":1234,"version":"1.0.0"}

// 主进程 → 辅助进程
{"type":"config","mouseHook":true,"displacementThreshold":6,"blacklist":["game.exe"],"clipboardTimeoutMs":150}
{"type":"captureNow"}          // 快捷键模式触发
{"type":"shutdown"}
```

## 附录 D：待定项（Open Questions）

- [ ] 产品最终命名核查：Promptly 与现有商标/产品（如 Promptly AI 等）的冲突风险与应对（名称、logo、域名）；
- [ ] NSIS 默认勾选自启在海外市场的观感（部分用户视为流氓行为）——发布前 A/B 决定默认值；
- [ ] Sentry 崩溃上报的隐私政策措辞；
- [ ] 捐赠入口转化数据（决定捐赠制维持时长）；
- [ ] v1.x 候选：**"重复上次动作"快捷键**（借鉴 Bragi，高频用户效率倍增器）；
- [ ] v1.x 候选：**Replace 写回选区**（借鉴 Bragi 的 Ctrl+V 机制，注意修饰键释放与焦点时机）。
