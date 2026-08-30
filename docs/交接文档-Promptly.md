# Promptly 项目交接文档

> 生成于 2026-08-30。目标：新 AI 粘贴本文档即可无缝接手。配合阅读：`SPEC.md`（产品规格 v1.2）、`docs/CONTRIBUTING.md`（提交规范）、`docs/bragi精读笔记.md`、`docs/grok分析-工具条三态与定位规范.md`。

## 1. 项目基本信息

- **项目名称**：Promptly（曾用代号 ai_desk）
- **项目目标**：Windows 上最好用的 Local-first BYOK 划词 AI——任意应用选中文字 → 工具条 → 用自己的 API key 调用任意模型
- **解决的问题**：官方桌面 AI 锁模型锁账号；Raycast 等请求过服务器中继；浏览器插件覆盖不了本地应用
- **当前阶段**：M0-M4 里程碑全部完成（功能完整原型），进入发布前打磨（签名/图标/更新/验收）
- **技术栈**：Electron 44 + electron-vite 5 + TypeScript(strict) + Vue3 + Pinia + better-sqlite3 + vue-i18n(6语种) + 原生 C# 辅助进程（.NET Framework 4.8 内置 csc 编译，C#5 语法）
- **运行环境**：Windows 10/11 x64（开发机 Win10 19045，**用户名含撇号 `bang'dao`**，多个坑见 §7）
- **主要依赖**：见 package.json；注意 electron@44 无自动 postinstall、npm≥11.19 拦截 install scripts（见 §6）
- **项目目录**：`E:\learn\ai_desk`（git 仓库 main 分支）
- **远程仓库**：https://github.com/onesun2012/promptly.git（已推送；**本地 e4243bb 因网络未推送**）
- **线上部署**：无（桌面应用，计划 GitHub Releases + electron-updater，未接）
- **数据库**：SQLite `%APPDATA%/promptly/promptly.db`（WAL）；另有 `providers.json`（DPAPI 加密 key）、`settings.json`（语言/自启/球位置）
- **第三方 API**：用户自配（OpenAI 兼容/Anthropic/Gemini 三适配器），API 直连零中继
- **敏感配置**：用户真实 API key 在 `%APPDATA%/promptly/providers.json`（safeStorage/DPAPI 加密）。**任何文档/提交不得含真实 key**，一律 `[REDACTED]`

## 2. 当前项目进度（按模块）

### 模块 A：原生取词辅助进程 —— ✅ 已完成并真机验证
- **文件**：`src/helper/promptly-helper.cs`、`scripts/build-helper.mjs`（产物 `build/helper/PromptlyHelper.exe` 19KB，gitignore）
- **核心逻辑**：LL 鼠标钩子 → MOUSE_DOWN 锁定选区会话（窗口/PID/坐标）→ 位移阈值 6px → MOUSE_UP → UIA TextPattern 取词（Chrome/Edge/记事本）→ 失败且 SAFE 时剪贴板回退（marker 哨兵 + 轮询 seq + 竞态规则 + 多格式备份还原 + 修饰键先释放）→ JSON over stdio 上报
- **关键约束**：csc 只支持 C#5（无 `$""`/`?.`）；stdout 必须 UTF-8（否则中文乱码）；剪贴板必须用原生 Win32（WinForms Clipboard 的 OLE 延迟渲染会阻塞全系统剪贴板——已踩坑）；敏感三态 UNKNOWN=BLOCKED 绝不回退；自有窗口(electron pid)抑制；心跳 5s + stdin 命令 captureNow/shutdown
- **下一步**：返回选区包络矩形（MouseDown-Up 包络），供工具条附录 X 定位

### 模块 B：选区管线主进程侧 —— ✅ 已完成
- **文件**：`src/main/selection/helper-client.ts`（spawn/心跳看门狗 15s/崩溃指数退避重启/DEGRADED）、`state-machine.ts`（主进程侧 VALIDATE→POSITION→VISIBLE）、`toolbar.ts`（320×132 定位/防抖/三态模式/失焦隐藏）
- **已验证**：notepad/Edge 走 UIA；VSCode 走剪贴板回退（15ms）；自有窗口抑制；8s 自动隐藏（loading/result 态挂起）

### 模块 C：工具条三态 —— ⚠ 代码完成，定位偏移待修
- **文件**：`src/renderer/toolbar.html`（暗色 token + 三态样式）、`src/renderer/src/toolbar/main.ts`（动作态/加载态/结果态状态机）、`src/main/index.ts` 的 runToolbarAction
- **状态**：动作态✅；点击动作→加载态→结果态流程已实现且单测过，但**真机点击按钮坐标对不上——工具条弹出位置有偏移（疑似 DPI 逻辑/物理像素换算），是当前第一优先 bug**（见 §7.1）
- **下一步**：修偏移 → 真机验证 加载态→结果态→Copy/Retry/在聊天中打开

### 模块 D：Provider 层 —— ✅ 已完成（mock+真实 key 验证）
- **文件**：`src/main/providers/*`（types re-export shared、sse、openai-compatible/anthropic/gemini 三适配器、factory、ipc）、`src/main/secure-store.ts`
- **核心**：SSE 流式 ChatChunk{type:text|reasoning|error|done}；三协议视觉格式（image_url/base64 block/inline_data）；能力模型字段已备（静态默认）；Test Connection = 拉模型+发测试请求
- **注意**："OpenAI 兼容"仅保证基础 chat+流式；DeepSeek 无视觉，粘贴截图需切视觉模型（glm-4v/gpt-4o/gemini）

### 模块 E：聊天窗 + 核心闭环 —— ✅ 已完成（真实 key 基本可用）
- **文件**：`src/main/chat-service.ts`（依赖注入可测；流式 upsert：assistant 行首 token 即插入、status streaming→completed/failed/cancelled；Retry=同 selectionSessionId+新 requestId；Active Action 互斥）、`chat-window.ts`、`src/renderer/chat.html` + `src/renderer/src/chat/*`（Markdown=marked+DOMPurify+hljs common、多会话、粘贴截图预览）
- **DB**：`src/main/db.ts`（Db 接口 + Sqlite 实现；messages 含 image_data/selection_session_id/action_id/status/request_id，迁移 try/catch ALTER）

### 模块 F：悬浮球 + 托盘 —— ✅ 已完成
- **文件**：`src/main/ball.ts`（品牌符号球、**手动拖拽=主进程 16ms 光标轮询**（app-region 已弃用：不触发 move 事件且注入事件拖不动）、位置钳制+3s 轮询持久化、右键菜单）、`src/main/tray.ts`（托盘安全网：找回球/聊天/设置/退出，6 语种）
- **已验证**：中心拖拽、位置持久化读写、点击 toggle 聊天

### 模块 G：i18n —— ✅ 已完成（en/fr/de/es/ja/ko）
- **文件**：`src/renderer/src/i18n/*`；locale 经 `?locale=` 窗口参数 + `app:locale` 广播贯通；德语整页验证

### 模块 H：打包 —— ✅ dist 构建通过
- `electron-builder.yml`：NSIS per-user 免管理员、npmRebuild:false（Electron 44 内嵌 Node 24 与 better-sqlite3 预编译 ABI 一致）、`build/installer.nsh` 卸载清理自启 Run 键

### 已放弃/不要重试
- ❌ WinForms Clipboard（OLE 阻塞系统剪贴板）→ 已改原生 Win32
- ❌ app-region 拖拽方案（事件不可靠）→ 已改手动拖拽
- ❌ electron-builder 默认 npmRebuild（node-gyp 失败，无 VS）
- ❌ jdza_kk（京东内部工具）作为参考——无相关技术
- ❌ 自研 Chromium 壳（豆包路线）——单人不可行

## 3. 文件结构说明

- `src/main/index.ts` — 主进程入口：窗口创建、全局快捷键(Alt+Space 聊天/Ctrl+Shift+A 取词)、**runToolbarAction 三态编排**、settings/ball/tray IPC。⚠ mainWin 引用、initToolbarIpc 回调都在此
- `src/main/selection/helper-client.ts` — 辅助进程生命周期（spawn 参数 --pid/--threshold/--poll/--timeout/--blacklist、JSON 解析、心跳、重启）。**改取词行为改 spawn args**
- `src/main/selection/toolbar.ts` — 工具条窗口 + 三态模式 + sendToToolbar + getLastSelection。auto-hide 只在 action 态生效
- `src/main/chat-service.ts` — 核心：send() 全流程（Provider→SSE→分片回调 onChunk(cid,chunk,surface)→DB upsert→status）。**surface 决定流向工具条还是聊天窗**
- `src/main/chat-window.ts` — 聊天窗 + openChatToConversation + forwardChatChunk
- `src/main/db.ts` — Db 接口 + Sqlite 实现（接口化是为了 Node 测试不加载原生模块）
- `src/main/secure-store.ts` — providers.json 读写（key 永不出主进程明文，渲染层只见 hasKey）
- `src/main/providers/*.ts` — 适配器（**Electron-free，Node 直跑可测**，import 用显式 `.ts` 扩展名）
- `src/helper/promptly-helper.cs` — 取词辅助进程（见模块 A）。**改完必须 `npm run build:helper`**
- `src/preload/index.ts + index.d.ts` — contextBridge 全部 API（renderer 无 node 权限）
- `src/renderer/src/` — index(App.vue 主窗) / chat(ChatApp.vue) / toolbar(main.ts) / ball(main.ts) / i18n / stores
- `scripts/` — build-helper.mjs（csc 编译）、test-chat-flow.ts、test-providers.ts、mock-provider.mjs(18081)、test-page.html、gen-tray-icon.mjs
- `electron-builder.yml` — appId `com.onesun2012.promptly` **永不可改**；npmRebuild:false；extraResources(helper+tray.png)；NSIS per-user+桌面图标不建
- `SPEC.md` — 产品规格 v1.2（附录 A 状态机/B 数据模型/C IPC 协议/D 待定项）

## 4. 核心逻辑（为什么这样设计）

**取词链**（产品之魂）：helper 独立进程隔离崩溃 → 主进程 SelectionMachine 校验 → 工具条三态。渲染层无任何原生能力，全走 contextBridge。
**三态**：动作态(按钮)→runToolbarAction→加载态(挂起 auto-hide)→SSE 分片经 onChunk(surface) 路由进工具条→结果态(Copy/Retry/在聊天中打开)。DB 是权威：流式 upsert 保证崩溃/断流不丢。聊天窗按需打开（openChatToConversation 按 conversationId 定位）。
**为什么结果进工具条**：Grok/ChatGPT 两轮评审一致认定这是"体验分水岭"——划词动作应在原地完成，聊天窗只承载追问。
**易出 bug 的地方**：①坐标体系（helper 物理px vs Electron DIP——当前 position 偏移 bug 就在这）②helper stdout 编码③剪贴板线程模型④自动隐藏计时器与流式的互斥（setToolbarMode 挂起）。

## 5. 环境变量与配置

- 无 .env。运行时配置全在 `%APPDATA%/promptly/*.json`
- **网络镜像**（CN 网络必须，环境变量方式不入库）：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`、`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`
- `PATH` 需含 `D:\Program Files\nodejs`（本机 node v24.20 位置；git 在 `C:\Program Files\Git\cmd`）

## 6. 启动、运行、测试

```
npm install                      # 首次：之后 npm install-scripts approve electron-winstaller esbuild；
                                 # 若 node_modules/electron/dist 缺失 → node node_modules/electron/install.js
npm run dev                      # 开发（自动先 build:helper）【已验证】
npm run typecheck && npm run lint && npm run build   # 【已验证】
npm run build:helper             # 重编译 C#【已验证】
node scripts/test-chat-flow.ts   # 闭环测试 → CHAT_FLOW_PASS【已验证】
node scripts/test-providers.ts   # 适配器测试 → ALL_PROVIDERS_PASS【已验证】
node scripts/mock-provider.mjs   # 127.0.0.1:18081 mock【已验证】
npm run dist                     # NSIS 安装包 → dist/【已验证】
```
启动成功标志：helper 日志 "mouse hook installed"、球出现右侧居中。

## 7. 已知问题与坑

### 7.1 工具条弹出位置偏移（当前第一优先 bug）
- **表现**：工具条不在光标附近，点击按钮坐标对不上
- **可能原因**：helper 物理像素 vs Electron DIP 换算（screenToDipPoint 假设与实际 DPI 不符）；Grok 附录 X.6 警告过
- **下一步**：helper 日志打印 cursor 原始值 vs main screenToDipPoint 结果对比；按附录 X 实现选区包络矩形定位
### 7.2 用户名撇号 `bang'dao`
- MSI 安装器 1603 失败；`%TEMP%` 下 mkdtemp 偶发 EPERM（测试脚本 SKIP 属正常）。node 脚本拼路径用正斜杠
### 7.3 GitHub 网络间歇不通
- push 失败等几分钟重试；大文件下载用 npmmirror 镜像（README 有命令）
### 7.4 npm≥11.19 install scripts 拦截
- `npm install-scripts approve <pkg>`；allowScripts 已写入 package.json
### 7.5 electron@44 二进制
- `npm i` 后 dist 可能缺失 → `node node_modules/electron/install.js`（配 ELECTRON_MIRROR）
### 7.6 WPS/真实视觉模型未验证
- WPS 走剪贴板回退的正命中未实测；粘贴识别需视觉模型（用户当前 DeepSeek 不支持图片）
### 7.7 已修复勿重蹈
- helper stdout GBK 乱码→UTF8；WinForms Clipboard 阻塞→原生 Win32；JSON envelope 双引号；心跳缺失→无限重启；工具条旧数据→每次 show 推送；getMessages 忘绑定参数；ball box-sizing 缺失裁切

## 8. 最近修改记录（时间线）

1. M0 脚手架（electron-vite+Vue3+TS，NSIS 链路验证）
2. M1 取词管线（钩子+UIA+回退+三态敏感+心跳修复+编码修复+原生剪贴板）
3. M2 三适配器+能力模型+Test Connection+safeStorage
4. M3 聊天窗+SQLite+核心闭环（划词→Translate→流式回复落库）
5. M4 悬浮球+托盘+i18n+安装器+设置页
6. UX v0.2（品牌球符号、全表面手动拖拽、暗色 token、工具条瘦身分级）
7. 粘贴截图识别（三协议视觉）
8. **最新（e4243bb 本地未推）**：工具条三态（动作/加载/结果）+流式 upsert+Retry 语义——定位偏移 bug 未修
9. 用户已确认：自启默认勾选；主口号 "Select anything. Ask any AI."；反馈邮箱 tonny2008@gmail.com（mailto 已实现）

## 9. 下一步开发计划

### 第一优先：修工具条定位偏移（阻塞三态验收）
- **文件**：`src/helper/promptly-helper.cs`（返回包络矩形）、`src/main/selection/toolbar.ts`（按附录 X 算法重写定位）、`src/main/index.ts`
- **步骤**：helper 日志对比物理/DIP 坐标定位根因 → 实现 positionToolbar（选区中心显示器/workArea/下方→上方/8px 边距/鼠标微调）→ 二次定位（结果态高度变化 ≤120ms 平滑）
- **验收**：SPEC 附录 X.10 五条全过；真机点 Translate 命中

### 第二优先：真实场景验收矩阵
- Chrome/Edge/VSCode/记事本/WPS 各 10 段划词 ≥90%；密码框 0 触发；剪贴板多格式还原；真实视觉模型粘贴识别
### 第三优先：发布工程
- 应用图标(ico)+EV 签名+electron-updater+GitHub Release；隐私说明页；README 产品化
### 不要现在做
- 账号/支付/Pro（先捐赠制）、语音/移动端、第四个适配器、悬浮球 hover 菜单（v1.1）
### 易过度开发警告
- 设置页美化、更多内置动作——先让"划词→结果"路径无 bug 再扩展

---

## 10. 2026-08-30 增补（最新状态）

- **7.1 定位偏移已修复（a25663e）**：根因=helper 上报物理像素、Electron setPosition 用 DIP，缩放显示下混用偏移。修复=定位改用 screen.getCursorScreenPoint()（DIP，与 setPosition 同坐标系），不再依赖 helper 坐标换算。helper 的 cursor 字段保留在事件里仅作参考。**真机复验尚未完成**：需划词确认工具条贴光标，然后跑附录 X.10 验收。
- **豆包对照首轮观察**：我们的球用 screen-saver 置顶层，在 ZCode 全屏之上仍可见；豆包的球同样全局置顶（2026-08-30 复测更正：之前"豆包球被全屏遮挡"的观察有误），层级对齐，无需改。工具条 blur 隐藏行为与豆包一致（点外部即隐藏），无需改。实测结论与修改清单见 `docs/豆包对照-实测结论.md`（要点：豆包工具条默认在选区上方；加载态回显选中文字值得借鉴；拖拽占位框范式不采纳）。
- **推送状态**：三态实现(e4243bb)、Grok 分析存档(b5b9a11)、交接文档(d4d2d07)、定位修复(a25663e)及本次增补——GitHub 网络曾中断，恢复后 git push 一次即可（本地 main 领先远程 5 笔）。
- **v1.0 剩余清单不变**：定位修复真机复验 → 全场景取词矩阵(含 WPS) → 应用图标+EV 签名+electron-updater → 隐私说明页 → README/落地页。