这份 SPEC 我认真看下来，**已经明显超过“想法草稿”的水平了**。如果按照我们上一轮说的：

> PRD → Flow → State → Data → Rule → UI → Edge Case → Done

来评分，它已经有 **80～85 分**。

但它现在有一个很明显的问题：

> **“产品想法已经比较完整，工程 SPEC 还没有完全闭环。”**

而且我查了一下 2026 年海外市场后，有一个更重要的结论：

> **这个赛道已经有直接竞品，而且你的核心差异点“BYOK + 全桌面划词”并没有想象中那么空白。**
>
> 但 Windows + 本地优先 + 真正“划词即问”+ 多 Provider + 零账号/零云端，仍然有机会做出非常明确的差异化。

下面我分开说。

------

# 一、先给你总体评分

| 维度                   | 评分 | 评价                             |
| ---------------------- | ---- | -------------------------------- |
| 产品定位               | 9/10 | 很清楚                           |
| 用户痛点               | 9/10 | 比较具体                         |
| 核心功能               | 9/10 | 已经很完整                       |
| State                  | 7/10 | 有，但还没有正式建模             |
| Flow                   | 7/10 | 描述了功能，但缺完整状态流       |
| Data Model             | 6/10 | 有 sync-ready 思路，但没真正定义 |
| Business Rules         | 7/10 | 很多规则存在，但散落在各章节     |
| UI                     | 7/10 | 组件描述明确，但缺交互状态       |
| Edge Cases             | 8/10 | 比普通 SPEC 强很多               |
| Technical Architecture | 8/10 | 已经有架构意识                   |
| Security               | 8/10 | DPAPI、密码框红线不错            |
| Acceptance             | 8/10 | 有量化指标                       |
| MVP 控制               | 6/10 | **略有功能膨胀**                 |
| 商业化                 | 7/10 | 方向清楚，但有矛盾               |

### 综合：**82/100**

如果这是你刚刚学完我上一轮的方法后交的作业，我会说：

> **你已经真正理解了“SPEC 不是功能列表，而是产品 + 状态 + 规则 + 验收”的概念。**

尤其是这几个地方非常好。

------

# 二、你这份 SPEC 最好的地方

## 1. 你已经开始写“为什么”

例如：

> 官方桌面 AI 锁死自家模型与账号体系

> 浏览器插件只能覆盖浏览器一个环境

这就比：

> “做一个 AI 划词工具”

强非常多。

因为你已经在定义：

**用户为什么需要它。**

------

# 三、最漂亮的是你定义了“产品之魂”

你写：

> **划词工具条（产品之魂）**

这句话非常重要。

因为一个产品不能所有功能都是一级优先级。

你的产品实际上应该是：

```text
                    ai_desk
                       │
            ┌──────────┴──────────┐
            │                     │
        划词入口                BYOK
            │                     │
            └──────────┬──────────┘
                       │
                  AI Action
                       │
          ┌────────────┼────────────┐
        翻译          总结          自定义
```

也就是说：

> **“划词”是入口，“BYOK”是基础设施，“AI Action”才是价值输出。**

这个产品结构是成立的。

------

# 四、但你现在最大的问题：缺少“完整 State Model”

这是我认为你最应该补的一块。

现在 SPEC 里面 State 是散落的：

```text
API key
当前 Provider
当前 Model
当前窗口状态
悬浮球位置
划词模式
黑名单
语言
会话
消息
...
```

建议正式定义：

```text
AppState
├── app
│   ├── version
│   ├── platform
│   └── language
│
├── window
│   ├── floatingBallPosition
│   ├── chatWindowPosition
│   ├── alwaysOnTop
│   └── visible
│
├── selection
│   ├── enabled
│   ├── mode
│   ├── hotkey
│   ├── blacklist
│   └── lastSelection
│
├── provider
│   ├── activeProfile
│   ├── profiles[]
│   └── models[]
│
├── conversation
│   ├── activeConversation
│   ├── conversations[]
│   └── messages[]
│
└── settings
    ├── autostart
    ├── language
    ├── telemetry
    └── update
```

这样以后 AI 写代码就非常稳。

------

# 五、还有一个更重要的：你需要定义“划词状态机”

这个产品最复杂的地方其实不是 Chat。

是：

> **Windows 上到底什么时候触发划词工具条？**

建议把它明确成状态机。

```text
IDLE
 ↓
MOUSE_DOWN
 ↓
SELECTING
 ↓
MOUSE_UP
 ↓
CHECK_APPLICATION
 ↓
CHECK_PASSWORD_FIELD
 ↓
CAPTURE_TEXT
 ↓
VALIDATE_TEXT
 ↓
SHOW_TOOLBAR
 ↓
USER_ACTION
 ↓
SEND_TO_AI
 ↓
STREAMING
 ↓
DONE
```

失败：

```text
CAPTURE_TEXT
     ↓
   FAILED
     ↓
TRY_FALLBACK
     ↓
   FAILED
     ↓
NO_ACTION
```

密码框：

```text
CHECK_PASSWORD_FIELD
        ↓
      YES
        ↓
     BLOCK
        ↓
      END
```

这东西一旦写出来，你的开发难度会一下子清晰很多。

------

# 六、你的“全局鼠标钩子”方案需要重新审视

这是我认为 SPEC 里面一个比较大的技术风险。

你现在写：

> 默认“拖选释放即弹”（全局鼠标钩子）

问题在于：

**Windows 全局鼠标钩子 ≠ 用户正在进行文本选择。**

它只能告诉你：

```text
鼠标按下
鼠标移动
鼠标释放
```

你还要判断：

```text
用户是不是在选择文字？
当前窗口是谁？
当前控件是什么？
有没有选中文字？
是不是密码框？
是不是 PDF？
是不是浏览器？
是不是游戏？
是不是拖拽？
是不是窗口移动？
是不是图片？
```

所以应该把它定义成：

> **Selection Detection Pipeline**

而不是简单：

> mouse hook → selection

这会直接影响你的工程设计。

------

# 七、第二个非常重要的问题：UIA 并没有你描述得那么简单

你写：

> UIA TextPattern 优先（Chrome/Edge/VSCode/记事本）

这个方向没问题。

但 SPEC 里最好不要承诺：

> “Chrome/Edge/VSCode/记事本都能稳定取词”

因为不同应用的 UIA 暴露情况差异很大。

特别是：

- Chromium
- Electron
- VS Code
- WPF
- Win32
- Qt
- Office
- WPS
- PDF 阅读器

行为可能完全不同。

所以建议改成：

```text
CaptureProvider
├── UIAProvider
├── ClipboardProvider
└── UnsupportedProvider
```

然后定义：

```text
优先级：

UIA
 ↓
安全检查
 ↓
Clipboard fallback
 ↓
失败
```

而不是把具体软件写死在架构里。

------

# 八、你这个地方非常好，但还应该再加一个安全层

你已经写：

> 密码框绝不触发且不做剪贴板回退（安全红线）

这是很好的产品判断。

但建议升级成：

```text
SensitiveFieldDetector
```

至少定义：

```text
Password
PIN
Security Code
Credit Card
SSN
Private Key
Token
```

不过注意：

**不要仅仅靠控件类型判断。**

因为网页里的密码框、Electron 自定义输入框、浏览器特殊控件都有差异。

因此应该明确：

> “无法确定是否安全”时，默认不执行 Clipboard fallback。

也就是：

```text
Unknown
 ↓
DO NOT COPY
```

这个原则非常重要。

------

# 九、你 SPEC 里有一个明显的产品逻辑矛盾

你写：

> Q2 = 免费 + 未来 Pro

然后：

> Q3 = 先全免费（捐赠制）后转云同步 Pro

然后：

> 存量功能永不收费

这三个东西其实需要重新定义。

因为：

**如果核心功能永远免费，Pro 到底卖什么？**

你已经给了答案：

> 云同步

但现在还不够明确。

建议正式定义：

```text
Free Forever
├── 本地 AI
├── BYOK
├── 划词
├── 多 Provider
├── 本地历史
├── 自定义 Prompt
└── 本地设置

Pro
├── Cloud Sync
├── Multi-device Sync
├── Cloud Backup
├── Prompt Sync
├── Settings Sync
└── maybe Team / advanced features
```

这样你的商业模式反而很漂亮：

> **不向用户收 AI Token 税。**

这在海外开发者用户里其实是很有吸引力的。

------

# 十、但“所有 AI API 都能用”这个宣传语风险很大

这是我强烈建议你修改的地方。

你现在说：

> “所有 AI API 都能用”

实际上 v1 只有：

```text
OpenAI Compatible
Anthropic
Gemini
```

这已经覆盖很多，但不是：

> 所有 AI API。

建议产品语言改成：

> **Bring Your Own AI Provider**

或者：

> **One desktop AI layer for your own models and API keys.**

内部可以写：

> v1 supports OpenAI-compatible endpoints, Anthropic, and Gemini.

这会更加专业。

------

# 十一、你现在其实已经撞上海外竞品了

我查了目前 2026 年的产品，结论比较有意思。

## 第一类：最强竞品——Raycast

Raycast 现在已经支持 BYOK，而且官方文档明确写了：

> Bring Your Own Key

支持：

- OpenAI
- Anthropic
- Google

而且还有：

> Selected Text

以及：

> Replace Selection

也就是说，你原来认为：

> “BYOK + AI + 划词”

是空白市场。

**实际上已经不是。** ([Raycast Manual](https://manual.raycast.com/settings?utm_source=chatgpt.com))

不过 Raycast 的产品定位更偏：

```text
Launcher
+
Automation
+
Extensions
+
AI
```

而你的定位应该是：

```text
AI
+
Selected Text
+
Desktop
+
BYOK
```

这是一个很重要的区别。

另外，Raycast 的 AI Extensions 目前在 Windows 还有限制，这给 Windows-first 产品留了一定空间。([Raycast Developers](https://developers.raycast.com/ai/getting-started?utm_source=chatgpt.com))

------

# 十二、第二个直接竞品：AskAny.ai

这个甚至比 Raycast 更值得你研究。

AskAny.ai 的定位就是：

> selected-context AI

而且现在已经有：

- Windows
- macOS
- 浏览器
- Floating widget
- Selected text
- Files
- Screenshot
- Replace in place
- 多模型
- BYOK

甚至它自己的网站就拿：

> Raycast / BoltAI / Kerlig / ChatGPT / Grammarly

做竞品比较。([AskAny.ai](https://askany.ai/?utm_source=chatgpt.com))

更关键的是：

> **AskAny.ai 2025 年已经推出 Windows desktop app，2026 年继续强化 BYOK。** ([AskAny.ai](https://askany.ai/changelog/?utm_source=chatgpt.com))

所以如果你现在做 ai_desk：

**AskAny.ai 是你必须重点拆解的竞品。**

------

# 十三、第三类：BoltAI / Kerlig

这两个更偏：

```text
AI assistant
+
selected text
+
Mac
```

尤其是 Mac 用户的“划词 AI”已经有一定市场。

所以你的机会不应该是：

> “我也做一个划词 AI。”

而应该变成：

> **“我做一个 Windows-first、真正本地 BYOK、无需账号、无需云端中转、支持任意 OpenAI-compatible endpoint 的桌面 AI 层。”**

这个定位就清楚很多。

------

# 十四、还有一个非常值得你研究的开源竞品：Bragi

我查到了一个非常接近你 SPEC 的项目：

[Bragi GitHub](https://github.com/isyuricunha/bragi?utm_source=chatgpt.com)

它现在的描述就是：

> System-wide AI writing assistance for Windows

而且：

- Windows
- OpenAI-compatible API
- DPAPI
- Selected text
- Clipboard fallback
- 恢复原 Clipboard
- GitHub Releases
- Global hotkeys

甚至连你 SPEC 里的：

> API Key 用 DPAPI

> 选中文字 → Clipboard → 调 AI → 恢复 Clipboard

都有非常明显的重合。([GitHub](https://github.com/isyuricunha/bragi?utm_source=chatgpt.com))

这个项目对你来说其实特别有价值。

不是因为它一定是商业竞争对手，而是：

> **它可以验证你的技术路线到底是不是现实。**

------

# 十五、所以现在你的竞争格局其实是这样的

```text
                       AI Desktop
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
       Launcher        Selected Text      Screen AI
          │                │                 │
       Raycast          AskAny.ai          Invisibility
          │                │                 │
          │             BoltAI/Kerlig       │
          │                │                 │
          └────────────────┼─────────────────┘
                           │
                        ai_desk
                           │
                  Windows + BYOK
                  Local-first
                  No account
                  Multi-provider
                  Selected text
```

你真正要找的位置不是“再做一个 AI Assistant”。

而是：

# **Local-first BYOK Desktop AI Layer**

------

# 十六、你的 SPEC 还有一个很重要的遗漏：Provider 抽象层

你已经写了：

> OpenAI Compatible / Anthropic / Gemini

但真正开发的时候至少要定义统一接口。

例如：

```ts
interface AIProvider {
  id: string

  listModels(): Promise<Model[]>

  chat(request: ChatRequest): AsyncIterable<ChatChunk>

  validateConfig(): Promise<ValidationResult>

  supportsStreaming(): boolean
}
```

然后：

```text
OpenAICompatibleProvider
AnthropicProvider
GeminiProvider
```

统一输出：

```ts
ChatChunk {
  type: "text" | "reasoning" | "error" | "done"
  content?: string
}
```

这样以后增加：

```text
DeepSeek
Mistral
xAI
Cohere
Ollama
LM Studio
...
```

不会污染 UI。

------

# 十七、数据库也需要正式定义

你写：

> better-sqlite3，schema 按 sync-ready 设计

这个方向对。

但现在还停留在一句话。

至少应该把：

```text
providers
provider_models
conversations
messages
prompts
settings
```

定义出来。

比如：

```text
conversations
----------------
id
title
provider_id
model
created_at
updated_at
messages
----------------
id
conversation_id
role
content
created_at
```

以后云同步时：

```text
local SQLite
      ↓
Sync Engine
      ↓
Supabase
```

会比较自然。

------

# 十八、还有一个你没有真正定义的东西：Action 系统

你现在写：

> AI 提问/翻译/总结/解释/复制 + 3 个免费自定义提示词

实际上这应该抽象成：

```text
Action
├── translate
├── summarize
├── explain
├── ask
├── copy
└── custom
```

每一个 Action：

```ts
{
  id: "translate",
  name: "Translate",
  prompt: "...",
  icon: "...",
  shortcut: null
}
```

这样未来用户可以自己添加：

```text
Fix Grammar
Rewrite Professionally
Explain Like I'm 5
Translate to Chinese
Translate to Japanese
Generate SQL
```

这个反而可能成为你的一个核心卖点。

------

# 十九、你现在的“3个自定义 Prompt”有点奇怪

如果你真的想做：

> Power User Tool

我反而建议 v1：

```text
3个固定内置 Action
+
5个自定义 Action
```

或者：

```text
Free:
5 custom actions

Pro:
Unlimited custom actions + cloud sync
```

但你又说：

> 存量功能永不收费

那么最好还是：

```text
Custom Actions：永久免费
Cloud Sync：Pro
```

会更符合产品哲学。

------

# 二十、你的 Success Criteria 有一个问题

你写：

> Chrome/Edge/VSCode/记事本/WPS 各10段划词，≥90%在300ms内弹条且取词正确

这个非常像工程测试。

但：

> **300ms 是不是正确指标？**

其实用户真正感受到的是：

```text
选中文字
↓
松开鼠标
↓
工具条出现
```

如果：

```text
150ms
```

和：

```text
300ms
```

用户可能几乎感觉不到区别。

反而：

> **“工具条不能误触发”**

更加重要。

我建议增加：

```text
误触发率 < 1%
密码框误触发 = 0
普通拖拽误触发 < 0.5%
```

这才是划词工具的核心指标。

------

# 二十一、还有一个关键指标：Clipboard 安全

既然你的产品会：

```text
Ctrl+C
读取 Clipboard
恢复 Clipboard
```

那么必须测试：

```text
原 Clipboard
↓
用户选择文字
↓
AI Desk 临时读取
↓
恢复
```

必须保证：

> 用户原来的 Clipboard 内容不能丢。

甚至应该增加：

```text
Clipboard integrity test
```

例如连续测试：

```text
文本
图片
HTML
文件
多格式 Clipboard
```

因为 Windows Clipboard 并不是简单的字符串。

------

# 二十二、Electron 也需要重新考虑

你写：

> Electron 30+

这个可以。

但你的产品其实属于：

> **系统级常驻小工具**

所以 Electron 的缺点会比较明显：

- 内存
- 启动速度
- 常驻进程
- 多窗口
- 全局 Hook
- 原生辅助进程
- Windows 系统集成

你已经意识到：

> 原生辅助进程

这是对的。

我甚至建议你考虑：

```text
Electron
   │
   ├── Renderer
   │
   ├── Main
   │
   └── Native Selection Service
           │
           ├── Mouse Hook
           ├── UIA
           ├── Clipboard
           └── Security Detection
```

而不是让 Electron 自己承担所有系统级工作。

------

# 二十三、你还需要补一个“进程通信协议”

因为你已经有：

> Electron ↔ Native Helper

那么 SPEC 必须定义：

```text
Electron
   ↕ IPC
Native Helper
```

至少定义：

```json
{
  "type": "selectionCaptured",
  "text": "...",
  "app": "chrome",
  "windowTitle": "...",
  "isSensitive": false
}
```

以及：

```json
{
  "type": "showToolbar",
  "x": 1234,
  "y": 567,
  "text": "..."
}
```

否则后面很容易变成：

> “Electron 调一下 exe，然后 exe 自己搞一堆东西。”

最终会很难维护。

------

# 二十四、还有一个我建议你补的核心功能：Provider Test

用户第一次配置：

```text
DeepSeek
OpenAI
Ollama
OpenRouter
```

一定要有：

> **Test Connection**

流程：

```text
填写 Base URL
↓
API Key
↓
点击 Test
↓
获取 Models
↓
选择 Model
↓
发送测试请求
↓
成功
```

而不是让用户：

> 保存 → 划词 → 等失败 → 再回来排查。

这个对 BYOK 产品尤其重要。

------

# 二十五、另外一个很容易踩坑：OpenAI Compatible 并不真的“完全兼容”

这是你 Provider 层必须考虑的。

不同：

```text
DeepSeek
OpenRouter
Groq
Ollama
LM Studio
各种中转站
```

虽然 API 看起来兼容 OpenAI：

```text
/chat/completions
```

但：

- streaming
- reasoning
- tool calling
- system message
- model name
- error format
- token usage

可能都有区别。

所以你的 SPEC 最好明确：

> **OpenAI Compatible Provider 只保证基础 Chat Completion + Streaming。**

高级能力：

```text
Reasoning
Vision
Tools
JSON mode
Structured output
```

全部通过 capability detection。

------

# 二十六、我会建议你增加一个 Capability Model

例如：

```ts
{
  streaming: true,
  vision: false,
  reasoning: true,
  tools: false,
  jsonMode: true
}
```

UI 根据能力决定：

```text
支持图片 → 显示图片按钮
支持 reasoning → 显示 reasoning
支持 tools → 显示 tools
```

这样你的架构会漂亮很多。

------

# 二十七、你的路线图其实也有一点问题

你现在：

```text
v1 Windows
v1.1 macOS
v1.2 Ubuntu
```

我反而建议：

```text
M0 Windows Core
 ↓
M1 Windows Selection
 ↓
M2 Provider
 ↓
M3 Chat
 ↓
M4 Polish
 ↓
v1.0
 ↓
验证用户需求
 ↓
决定 macOS
```

不要太早把：

> macOS / Ubuntu

写进产品路线的具体版本。

因为你真正需要验证的是：

> **Windows 用户是否真的愿意每天用它。**

如果：

```text
3000 downloads
200 WAU
```

都达不到，那么 macOS/Linux 的工程投入没有意义。

------

# 二十八、竞品之后，我反而认为你的机会变得更清晰了

我现在不会建议你做：

> “另一个 Raycast”

也不会建议：

> “另一个 AskAny”

而建议你把定位压得非常窄：

# **Windows 上最好用的 BYOK 划词 AI。**

第一阶段只解决一个动作：

```text
选中文字
↓
松开
↓
AI Toolbar
↓
翻译 / 总结 / 改写 / 解释
↓
结果
```

然后做到：

> **快、准、不打扰、隐私、自己的 Key。**

------

# 二十九、甚至可以把产品核心 Loop 定成这样

```text
             用户正在工作
                  │
                  ▼
              选择文字
                  │
                  ▼
             AI Toolbar
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
      翻译       总结        改写
       │          │          │
       └──────────┼──────────┘
                  ▼
              AI Response
                  │
             ┌────┴────┐
             ▼         ▼
           Copy     Replace
```

**这才是你的产品。**

悬浮球、聊天窗、数据库、i18n、自动更新都是外围。

------

# 三十、我建议你下一版 SPEC 增加这 10 个章节

你现在的 v1.0 可以升级成：

```text
01 Problem Statement
02 Target Users
03 Product Positioning
04 Core User Journey
05 Core State Model
06 Selection State Machine
07 Provider Architecture
08 Action System
09 Data Model
10 Security Model
11 UI / UX
12 Error Handling
13 Platform Limitations
14 Performance Requirements
15 Privacy
16 Business Model
17 Competitive Positioning
18 MVP Scope
19 Milestones
20 Acceptance Criteria
```

尤其是现在缺得比较明显的是：

> **Target Users**

> **State Model**

> **State Machine**

> **Action Model**

> **Provider Capability**

> **IPC Protocol**

> **Error Model**

------

# 三十一、最后给你一个非常重要的判断

你这个项目**不是没有竞品**。

相反，现在已经出现了比较直接的竞品：

- Raycast
- AskAny.ai
- BoltAI
- Kerlig
- Bragi
- 一批开源/独立开发者的 BYOK Desktop AI

Raycast 已经明确支持 BYOK、Selected Text 和 Replace Selection；AskAny.ai 则已经把“selected context + floating widget + Windows + BYOK”做成了核心定位。([Raycast Manual](https://manual.raycast.com/ai/bring-your-own-keys?utm_source=chatgpt.com))

所以如果你只是：

> **“把这些功能重新做一遍”**

我认为产品竞争力不够。

但是如果重新定位成：

> **Windows-first + Local-first + BYOK + Zero Account + Zero Cloud Relay + System-wide Selection + Provider Agnostic**

我认为还是有空间。

尤其是：

### **“API 请求默认直连用户 Provider，不经过你的服务器。”**

这个可以成为非常强的产品原则。

因为 Raycast 的 BYOK 请求目前仍会经过 Raycast 的服务器做统一 API、fallback 和 prompt management；这一点与你设想的“用户设备直连所配 API”形成了非常明确的架构差异。([Raycast Manual](https://manual.raycast.com/ai/bring-your-own-keys?utm_source=chatgpt.com))

------

## 我给你这份 SPEC 的最终评价

**不是推倒重来，而是进入 v1.1 的“架构收敛阶段”。**

你现在最应该做的不是继续加功能，而是补齐这 6 张图：

```text
① Product Positioning
② User Journey
③ State Model
④ Selection State Machine
⑤ Provider Architecture
⑥ Data Model
```

尤其是 **④ Selection State Machine**。

因为这个项目真正难的不是：

> Electron + Vue + Chat UI

而是：

> **Windows 全局选词 → 判断是否安全 → 正确获取 Selection → 弹出 Toolbar → Action → Provider → Streaming → Copy/Replace**

把这一条链设计明白，你这个项目就真正“立住”了。

如果让我给你当前 SPEC 的一句话诊断：

> **产品经理部分已经 85 分，架构师部分 75 分，真正需要补的是“状态机 + 数据模型 + 系统边界”，而不是再继续堆功能。**