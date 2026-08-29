# Bragi 精读笔记（references/bragi）

> 结论先行：**Bragi 验证了 Promptly 的技术路线完全可行**，但它是一个"热键 + 剪贴板"的最小闭环，没有 UIA、没有自动弹条、没有流式——**Promptly 相对它是代差优势，不是同代竞争**。
>
> ⚠️ **法律红线：Bragi 采用 GPL-3.0**。只允许学习思路与验证方案，**任何代码片段都不得复制进 Promptly**（否则整个项目必须以 GPL 开源）。以下笔记仅记录机制与思想。

## 1. 项目概况

| | |
|---|---|
| 定位 | System-wide AI writing assistance for Windows（划词→AI 处理→**写回替换**） |
| 技术栈 | Python 3 + PySide6（Qt）+ pynput（全局热键）+ pyperclip（剪贴板）+ httpx + ctypes |
| 打包 | PyInstaller 风格目录 + **Inno Setup**（`installer.iss`） |
| 历史 | 是韩国项目 **Quill** 的改造版（代码注释为韩文，AppId 保留 `isyuricunha.Quill`） |
| 规模 | 约 6000 行（含测试），单人可维护量级 |
| 许可证 | **GPL-3.0 or later** |

## 2. 核心机制精读

### 2.1 取词（app/text_processor.py）— 纯剪贴板方案

```
释放 Ctrl/Alt/Shift 修饰键 → 备份剪贴板 → 写入 marker(\x00QUILL_MARKER\x00)
→ 模拟 Ctrl+C → sleep 0.1s → 读剪贴板 → 还原剪贴板
→ 读取结果 ≠ marker → 有选中文本；== marker → 无选中
```

**值得吸收的三个点**：
1. **先释放修饰键再模拟 Ctrl+C**——热键本身按着 Ctrl/Alt 时直接模拟会变成 Ctrl+Alt+C 导致复制失败。这是所有剪贴板回退方案都会踩的坑，记入实现清单；
2. **marker 哨兵**：预先写入特殊标记来区分"没选中"和"复制失败"，比对比原文更可靠；
3. **每次操作新建 Worker 线程**（QThread），操作间互不污染。

**明确的弱点（Promptly 要超越的）**：
- `sleep 0.1s` 固定等待——大文档/慢应用下会竞态（应改为轮询剪贴板变化 + 超时）；
- pyperclip **只处理纯文本**：用户剪贴板里若是图片/文件/HTML，"还原"会把这些格式**弄丢**——这正是 SPEC 里"剪贴板多格式完整性测试"存在的意义；
- **没有敏感字段检测**：对密码框一样会模拟 Ctrl+C（安全风险，Promptly 红线）；
- **没有 UIA**：所有应用都走 Ctrl+C 模拟，覆盖面和体验天花板低。

### 2.2 写回替换（replace-in-place）

备份 → 写入新文本 → 模拟 Ctrl+V → 还原剪贴板。Bragi 的核心 UX 是"AI 结果直接替换选区"（写作辅助定位）。Promptly v1.0 将 replace 列为 Non-goal，此机制留作 v1.x 参考（同样要注意修饰键释放与焦点时机）。

### 2.3 API Key 加密（core/crypto_manager.py）

ctypes 直调 `CryptProtectData / CryptUnprotectData`（DPAPI），Base64 存储，无附加熵。方案成立。
**Promptly 落法**：Electron 内置 `safeStorage` API，Windows 底层就是 DPAPI，**零原生模块**，比 Bragi 的手写 ctypes 更省事——已回写 SPEC。

### 2.4 Provider 层（core/ai_provider.py）

单一 `OAICompatibleProvider`：httpx + `stream: False` **非流式**、`test_connection()` 发一条 "Hi" 验证、错误 JSON 消息提取、支持按动作覆盖 model。没有 SSE 流式、没有 Anthropic/Gemini、没有能力探测。
→ 验证了"OpenAI 兼容直连"可行；Promptly 的流式 ChatChunk + 三适配器 + 能力模型是明确超出项。

### 2.5 热键（app/hotkey_manager.py）

pynput `keyboard.GlobalHotKeys`，三种热键并存：**主热键**（弹窗）、**quick 热键**（重复上一次动作）、**每动作直连热键**（按一下直接对该动作执行）。触发时用 `MouseController.position` 记录光标坐标供弹窗定位。
→ **"重复上次动作"热键是好的产品点子**（高频用户效率倍增器），列入 Promptly v1.x 候选。

### 2.6 应用编排（app/application.py）

- **弹窗预渲染**：启动时以透明度 0 show→hide 一次，消除首次弹出 milliseconds 级卡顿——值得照抄的思路（Electron 里对应提前创建隐藏 BrowserWindow）；
- **双锁防重入**：`extraction_in_progress` 与 `ai_request_in_progress` 分离，热键在请求期间静默忽略；
- 弹窗定位在**光标位置**；无选中时静默返回不提示；
- 首次运行 Onboarding 向导（base_url/key/model 三步）。

### 2.7 自启与安装器（core/startup_manager.py + installer.iss）

- 自启 = HKCU `...\CurrentVersion\Run` 写值，**应用内设置管理**（安装器不提供勾选项）；
- **注册表值迁移模式**：品牌从 Quill→Bragi，检测旧值名→写新值名→删旧值，升级用户无感切换；
- Inno Setup：`PrivilegesRequired=lowest` → **per-user 安装到 %LOCALAPPDATA%\Programs，全程免管理员**；桌面图标默认**不**勾选；
- **AppId 一旦确定永不变更**（跨品牌也不变），保证升级路径唯一；
- 更新 = GitHub Releases API 比对 tag → 校验下载 URL 前缀防钓鱼 → 下载安装器 → 启动（Promptly 用 electron-updater 等价实现）。

## 3. 与 Promptly 的能力对照

| 能力 | Bragi | Promptly SPEC | 说明 |
|---|---|---|---|
| 剪贴板回退取词 | ✅ | ✅ | 路线已验证 |
| DPAPI 加密 key | ✅ | ✅（safeStorage） | 路线已验证 |
| 全局热键 | ✅ | ✅ | 路线已验证 |
| per-user 免管理员安装 | ✅ | ✅（NSIS 同策略） | 路线已验证 |
| GitHub Releases 更新 | ✅ | ✅（electron-updater） | 路线已验证 |
| AI 直连（无服务器中继） | ✅ | ✅ | 路线已验证 |
| UIA 优先取词 | ❌ | ✅ | **代差** |
| 选中即自动弹条 | ❌（仅热键） | ✅（默认，可切） | **代差** |
| 敏感字段防护 | ❌ | ✅（红线设计） | **代差** |
| 剪贴板多格式还原 | ❌（纯文本） | ✅（专项测试） | **代差** |
| 流式输出 | ❌ | ✅ | **代差** |
| 多 Provider（Anthropic/Gemini） | ❌ | ✅ | **代差** |
| 能力模型探测 | ❌ | ✅ | **代差** |
| 多会话聊天窗 / 悬浮球 | ❌ | ✅ | **代差** |
| 6 语种 i18n | ❌ | ✅ | **代差** |
| Replace 写回选区 | ✅ | v1.x 候选 | Bragi 领先的一点，机制已看清 |

## 4. 吸收清单（思路层面，代码零复制）

1. 修饰键先释放 → 写入 Promptly 取词实现清单；
2. marker 哨兵判空 → 同上；
3. 剪贴板读取改"轮询变化 + 超时"，不用固定 sleep；
4. 弹窗/窗口预创建预渲染，消除首弹延迟；
5. "重复上次动作"热键 → v1.x 候选（已回写 SPEC 附录 D）；
6. per-user 免管理员安装 + 桌面图标默认不勾；
7. AppId 一次定死 + 注册表迁移模式（未来品牌演化用）；
8. 双锁防重入（取词中/请求中分离）；
9. Electron 用 `safeStorage` 而非手写 DPAPI。

## 5. 待跟进

- [ ] Bragi 的 popup_window.py / prompt_manager.py 未逐行精读（对 Promptly 增量价值低，需要时再看）；
- [ ] M1 实现时以本笔记第 2.1/4 节为 checklist。
