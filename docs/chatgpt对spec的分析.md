我看完这版了。整体上，v1.1 比你之前那版成熟很多，尤其你已经把 **Selection Pipeline、IPC、Provider Capability、安全红线、误触发率** 都补进来了。比如你现在已经明确了“Unknown → DO NOT COPY”，并把取词链、剪贴板完整性和辅助进程隔离写进 SPEC。

不过，**附录 A 目前最大的结构性问题是：你把“选词状态机”和“AI 执行状态机”揉成了一张图。**
这会直接影响后面代码的职责划分和异常处理。

我建议你这次不要小修小补，而是把它改成：

> **Selection State Machine + Action Execution State Machine**

这是我认为这份 SPEC 下一步最值得做的一次架构升级。

------

# 一、先说结论：附录 A 现在有 8 个关键问题

你目前是：

```text
IDLE
→ MOUSE_DOWN
→ SELECTING
→ MOUSE_UP
→ CHECK_APPLICATION
→ CHECK_SENSITIVE
→ CAPTURE_TEXT
→ ...
→ SHOW_TOOLBAR
→ USER_ACTION
→ SEND_TO_AI
→ STREAMING
→ DONE
```



这个流程“看起来对”，但真正实现时会出现几个坑。

------

## 1. `MOUSE_DOWN` 没有处理“按下后没形成选择就松开”

现在：

> MOUSE_DOWN → 移动超位移阈值 → SELECTING

但如果：

```text
MouseDown
↓
移动 3px
↓
MouseUp
```

应该明确：

```text
MOUSE_DOWN
 ├─ move > 6px → SELECTING
 └─ mouse_up → IDLE
```

否则状态机存在一个没有出口的分支。

### 建议

```text
MOUSE_DOWN
├── move > threshold → SELECTING
└── mouse_up → NO_ACTION
```

------

# 二、`MOUSE_UP` 才取前台窗口，不够稳

你现在：

```text
MOUSE_UP
↓
取前台窗口
↓
CHECK_APPLICATION
```



问题是：

> **“用户在哪个应用里开始选择”应该在 MOUSE_DOWN 时就锁定。**

否则以后遇到：

```text
选中文本
↓
松鼠标
↓
某个窗口抢焦点
```

就可能判断错目标应用。

建议在 `MOUSE_DOWN` 记录：

```text
targetWindow
targetProcess
targetPid
targetHandle
targetPoint
```

然后后面一直用这个 Selection Session 的目标，而不是反复问“当前前台窗口是谁”。

------

# 三、`CHECK_APPLICATION` 和 `CHECK_SENSITIVE` 还差一个关键状态：`IDENTIFY_TARGET`

这是你现在最应该补的。

你现在：

```text
CHECK_APPLICATION
↓
CHECK_SENSITIVE
↓
CAPTURE_TEXT
```

但是：

> **SensitiveFieldDetector 到底检测谁？**

是：

- 当前窗口？
- 当前鼠标位置控件？
- 当前 Selection？
- 当前 UIA AutomationElement？

这在工程上差别很大。

应该变成：

```text
CHECK_APPLICATION
↓
IDENTIFY_TARGET
↓
CHECK_SENSITIVE
↓
CAPTURE_TEXT
```

其中：

```text
IDENTIFY_TARGET
```

负责找到：

```text
Window
  ↓
AutomationElement
  ↓
Control
```

例如：

```text
Chrome
 └── page
      └── input[type=password]
```

只有这样 `SensitiveFieldDetector` 才真正有对象可判断。

------

# 四、我建议把 `CHECK_SENSITIVE` 再细化成三态

你现在写的是：

```text
非敏感 → CAPTURE_TEXT
敏感/Unknown → IDLE
```



思想是对的，但内部实现最好明确：

```text
SAFE
SENSITIVE
UNKNOWN
```

决策：

```text
SAFE      → CAPTURE_TEXT
SENSITIVE → NO_ACTION
UNKNOWN   → NO_ACTION
```

不要简单设计成：

```ts
boolean isSensitive
```

而应该：

```ts
enum SensitiveDecision {
  SAFE,
  SENSITIVE,
  UNKNOWN
}
```

因为：

> **UNKNOWN 是一个安全状态，不是 FALSE。**

这一点你已经在产品层面想对了，现在应该把它落实到数据模型。

------

# 五、最大的架构问题：`SHOW_TOOLBAR → AI → STREAMING` 不应该属于 Selection State Machine

这是我最建议你改的地方。

现在附录 A 后半段是：

```text
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



这其实已经不是“Selection State”了。

因为：

> **Selection 已经在 SHOW_TOOLBAR 时完成了。**

后面的事情属于：

> **Action Execution / AI Request**

应该拆成两个状态机。

------

# 六、推荐架构

## 状态机 A：Selection

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
IDENTIFY_TARGET
 ↓
CHECK_SENSITIVE
 ↓
CAPTURE_TEXT
 ↓
VALIDATE
 ↓
SHOW_TOOLBAR
```

最终：

```text
SHOW_TOOLBAR
 ├── click action → Action State Machine
 ├── Esc → IDLE
 ├── click outside → IDLE
 └── timeout → IDLE
```

------

# 七、然后单独做状态机 B：Action

```text
ACTION_IDLE
 ↓
ACTION_SELECTED
 ↓
BUILD_REQUEST
 ↓
SEND_TO_PROVIDER
 ↓
STREAMING
 ↓
COMPLETED
```

失败：

```text
BUILD_REQUEST
 ↓
FAILED

SEND_TO_PROVIDER
 ↓
FAILED

STREAMING
 ↓
ABORTED
```

这样就非常干净。

------

# 八、为什么一定要分？

举一个你以后一定会遇到的场景。

用户：

```text
选中 A
↓
点击翻译
↓
AI 正在 Streaming
```

此时用户又选中：

```text
B
```

如果所有东西共用一个 Selection State：

```text
STREAMING
↓
MOUSE_DOWN
```

整个状态机就乱了。

但拆开之后：

```text
SelectionMachine
    A → TOOLBAR
    B → TOOLBAR

ActionMachine
    A → STREAMING
```

两者互不干扰。

最终甚至可以允许：

```text
Selection B
+
Action A streaming
```

然后由产品规则决定：

> 是取消 A，还是允许多任务并行。

这就非常清晰。

------

# 九、你还缺一个非常重要的：`sessionId`

这是我认为你附录 A 应该必须新增的字段。

每一次划词产生：

```text
SelectionSession
```

例如：

```json
{
  "sessionId": "sel_20260829_001",
  "windowId": 12345,
  "process": "chrome.exe",
  "text": "Hello world",
  "method": "uia"
}
```

后续：

```text
Action
Streaming
Done
```

全部关联：

```text
sessionId
```

这样就可以避免：

> A 选区的 AI 结果跑到 B 工具条上。

------

# 十、剪贴板 fallback 现在还需要补一个状态：`BACKUP_CLIPBOARD`

你现在写的是：

```text
CLIPBOARD_FALLBACK
备份剪贴板 → Ctrl+C → 读取 → 还原
```



概念没问题，但工程上最好拆开。

我建议：

```text
CAPTURE_TEXT
   │
   └── UIA failed
          ↓
    CHECK_FALLBACK_ALLOWED
          ↓
    BACKUP_CLIPBOARD
          ↓
    TRIGGER_COPY
          ↓
    WAIT_CLIPBOARD_CHANGE
          ↓
    READ_CLIPBOARD
          ↓
    RESTORE_CLIPBOARD
          ↓
       VALIDATE
```

为什么？

因为真正容易出 Bug 的其实是：

```text
Ctrl+C
↓
Clipboard 到底什么时候更新？
```

150ms 并不一定适合所有机器。

------

# 十一、而且你要特别补一个“用户同时修改 Clipboard”的规则

这个是我非常建议你写进 SPEC 的。

例如：

```text
Promptly 备份 Clipboard
↓
Ctrl+C
↓
Promptly 正在读取
↓
用户自己 Ctrl+C 了另外一段文字
```

这时候：

> **Promptly 绝对不能把旧 Clipboard 强行恢复回去。**

否则用户会发现：

> “我刚刚复制的内容怎么被 AI 工具吞掉了？”

推荐规则：

```text
备份原始 Clipboard
↓
Promptly 修改 Clipboard
↓
Promptly 操作期间检测 Clipboard sequence / 内容变化
↓
如果发现用户发生新的 Clipboard 操作
→ 放弃恢复旧 Clipboard
→ 保留用户最新 Clipboard
```

这属于非常关键的 UX 安全规则。

------

# 十二、`VALIDATE` 也可以升级

目前：

> 文本非空/去抖/长度 ≤ 上限



我建议改成：

```text
VALIDATE_SELECTION
├── empty?
├── whitespace only?
├── too long?
├── duplicate event?
├── unsupported content?
├── sensitive?
└── valid
```

另外“去抖”最好定义成可测试参数：

```text
dedupWindowMs = 300
maxTextLength = 20,000
minTextLength = 1
```

否则“去抖”对开发人员来说还是模糊概念。

------

# 十三、`SHOW_TOOLBAR` 建议拆成两个状态

现在：

```text
SHOW_TOOLBAR
```

实际上包含：

```text
正在定位
已经显示
等待用户
```

建议：

```text
POSITION_TOOLBAR
↓
TOOLBAR_VISIBLE
```

这样可以明确处理：

```text
屏幕边缘
多显示器
DPI Scaling
任务栏
鼠标位置
```

特别是 Windows 多显示器 + 125% / 150% DPI，很容易出现坐标转换问题。

------

# 十四、还应该加入 `IGNORED_WINDOW`

你现在：

```text
CHECK_APPLICATION
```

但最好直接定义：

```text
CHECK_APPLICATION
├── BLACKLISTED → NO_ACTION
├── PROMPTLY_OWN_WINDOW → NO_ACTION
├── SYSTEM_UNSUPPORTED → NO_ACTION
└── ALLOWED → IDENTIFY_TARGET
```

尤其要明确：

> **Promptly 自己的窗口不能触发划词。**

否则用户在 Promptly 聊天窗口里拖文字，也可能又冒一个 Toolbar。

这是典型的 self-trigger 问题。

------

# 十五、一定要处理“全局钩子重入”

这是你以后大概率会遇到的 Bug。

例如：

```text
选中文字
↓
Toolbar 出现
↓
用户点击 Toolbar
↓
全局鼠标 Hook 捕获这次点击
↓
Promptly 又认为用户正在选择文本
```

所以需要：

```text
IGNORE_PROMPTLY_WINDOW
```

甚至：

```text
Suppression Window
```

例如：

```text
Toolbar_VISIBLE
期间
↓
忽略 Promptly 自己窗口的鼠标事件
```

------

# 十六、`SEND_TO_AI` 现在还缺超时 / 取消

你当前：

```text
SEND_TO_AI
├── 首包 → STREAMING
└── 错误 → 错误态 → IDLE
```



至少要增加：

```text
SEND_TO_AI
├── first token → STREAMING
├── timeout → REQUEST_TIMEOUT
├── error → REQUEST_FAILED
└── cancelled → REQUEST_CANCELLED
```

Streaming 还要：

```text
STREAMING
├── done → DONE
├── connection lost → RETRY / FAILED
├── user cancel → CANCELLED
└── timeout → FAILED
```

因为你的技术约束本身已经写了：

> SSE 断流需要重试与明确报错。

但是附录 A 没有把这个规则真正落实进状态机。

------

# 十七、所以我建议你直接把附录 A 改成这一版

这比你现在这张表更适合实际编码：

```text
## 附录 A：Selection / Action 状态机

### A1. Selection State Machine

IDLE
  │
  └─ mouse_down(left)
        ↓
MOUSE_DOWN
  ├─ mouse_up before threshold → IDLE
  └─ move > threshold → SELECTING
                         ↓
                       MOUSE_UP
                         ↓
                 CHECK_APPLICATION
                   ├─ blocked → IDLE
                   └─ allowed
                         ↓
                   IDENTIFY_TARGET
                         ↓
                  CHECK_SENSITIVE
              ┌──────────┼──────────┐
            SAFE     SENSITIVE    UNKNOWN
              │           │           │
              │           └──────┬────┘
              │                  ↓
              │               IDLE
              ↓
          CAPTURE_TEXT
          ├─ UIA success → VALIDATE
          └─ UIA failure
                 ↓
        CHECK_FALLBACK_ALLOWED
          ├─ blocked → IDLE
          └─ allowed
                 ↓
          BACKUP_CLIPBOARD
                 ↓
            TRIGGER_COPY
                 ↓
         READ_CLIPBOARD
                 ↓
       RESTORE_CLIPBOARD
                 ↓
             VALIDATE
                 ↓
          POSITION_TOOLBAR
                 ↓
          TOOLBAR_VISIBLE
```

------

## A2. Action State Machine

```text
ACTION_IDLE
  ↓
ACTION_SELECTED
  ↓
BUILD_REQUEST
  ↓
SEND_TO_PROVIDER
  ├─ success(first token) → STREAMING
  ├─ timeout → REQUEST_TIMEOUT
  ├─ error → REQUEST_FAILED
  └─ cancel → REQUEST_CANCELLED

STREAMING
  ├─ done → COMPLETED
  ├─ connection lost → RETRYING
  ├─ retry failed → REQUEST_FAILED
  └─ cancel → REQUEST_CANCELLED

COMPLETED
  ↓
DISPLAY_RESULT
```

------

# 十八、然后定义几个“全局规则”

这一段很重要，我建议直接加入附录 A。

```text
### A3. State Machine Global Rules

1. 每次新的 Selection 创建唯一 sessionId。
2. 任意 Selection 失败/取消后最终回到 IDLE。
3. Unknown Sensitive 状态等同于 BLOCKED，不执行 Clipboard fallback。
4. Promptly 自有窗口及 Toolbar 鼠标事件不触发新的 Selection。
5. Clipboard fallback 期间如检测到用户主动修改 Clipboard，则不得覆盖用户最新 Clipboard。
6. 每个 Selection / Action 请求必须携带 sessionId，禁止旧请求结果污染新 Selection。
7. 同一时间默认只允许一个 Active Action；新 Action 可取消旧 Action（v1 规则）。
8. 所有原生操作均必须有 timeout，超时后进入 Failed/Cleanup。
9. 辅助进程崩溃时主进程进入 DEGRADED 状态并尝试重启 Helper。
10. 所有异常路径必须执行资源清理后再回到 IDLE。
```

第 9 条尤其值得加。

因为你的产品架构明确要求：

> **辅助进程崩溃不影响主程序。**



那就不能只有：

```text
helper crashed → 崩溃
```

应该定义：

```text
HELPER_CRASHED
↓
RESTARTING
↓
READY
```

------

# 十九、还需要新增一个 Helper State Machine

这是你附录 A 没有覆盖，但我认为非常值得补的。

因为你的系统实际上有三个独立生命周期：

```text
Electron Main
Native Helper
AI Request
```

Helper：

```text
STARTING
↓
READY
↓
RUNNING
↓
STOPPING
↓
STOPPED
```

异常：

```text
READY / RUNNING
↓
CRASHED
↓
RESTARTING
↓
READY
```

否则“辅助进程崩溃不影响主程序”只是产品口号，没有工程定义。

------

# 二十、附录 C 也应该顺手升级

你现在 IPC：

```json
{"type":"selectionCaptured", ...}
```



建议所有事件加：

```json
{
  "version": 1,
  "requestId": "...",
  "sessionId": "...",
  "type": "selectionCaptured",
  "timestamp": 1756450000000
}
```

这样未来：

```text
Selection A
Selection B
Request 1
Request 2
```

发生交错时，完全不会混。

------

# 二十一、你的 SPEC 其它地方还有 6 个建议修改

## ① “覆盖 95% 海外用户”建议删掉

你现在写：

> v1 三个适配器覆盖 95% 海外用户。

这个属于**未经验证的市场数字**。

改成：

> “覆盖主流 BYOK 使用场景”

更稳。

------

## ② “EV 证书 $200-500/年”不要写死

你现在把这个写成硬约束：

> EV 代码签名证书为必买预算项。

这个比较适合放：

```text
Release / Distribution Decision
```

而不是 Technical Constraint。

因为证书类型、价格、SmartScreen 体验都会变化。

------

## ③ 自动启动默认勾选，我建议先改成“不默认勾选”

你自己其实已经在 Open Questions 里发现了：

> 部分用户视为流氓行为。

我倾向：

```text
□ Launch Promptly at startup
```

默认：

```text
OFF
```

然后首次启动提示一次。

因为你的核心卖点之一恰恰是：

> **Privacy / Respect user's machine**

默认悄悄常驻，会有品牌认知冲突。

------

# 二十二、还有一个比状态机更重要的产品问题

你的产品定位现在已经写得很好：

> `Windows-first + Local-first + BYOK + 零账号 + API 直连零中继 + 划词原生体验`。

但你的真正核心卖点我建议再压缩成一句：

> **Select anything. Ask any AI.**

下面再解释：

```text
Select anything
→ 全桌面划词

Ask any AI
→ BYOK / Multi Provider

Without giving us your data
→ Local-first / Direct API
```

这比“Windows 上最好用的 Local-first BYOK 划词 AI”更容易形成海外产品记忆点。

------

# 二十三、最终我会这样评价你的 v1.1

你现在已经从：

> **“产品想法”**

进入：

> **“可以开始架构设计”**

的阶段了。

尤其你已经把：

- 产品定位
- Target User
- Selection Pipeline
- Provider
- Capability Model
- Data Model
- IPC
- Security
- Milestone
- Acceptance Criteria

都建立起来了。

### 当前最值得改的不是继续加功能，而是：

```text
                    Promptly
                       │
          ┌────────────┼────────────┐
          │            │            │
     Selection      Helper       Provider
     StateMachine   Lifecycle    StateMachine
          │            │            │
          └────────────┼────────────┘
                       │
                Action Execution
                       │
                  Chat / Stream
```

**把这四层状态彻底分开，你这份 SPEC 的工程成熟度会再提升一个档次。**

尤其是附录 A，我会建议你直接从现在的“16 状态串行表”升级成：

> **Selection State Machine + Action State Machine + Helper Lifecycle + Global Invariants**

这比单纯增加几个状态更重要。

如果按你这份 v1.1 当前版本重新评分，我会给到 **89/100**；把上面这套状态机、IPC session/request ID、Clipboard race、Helper restart、Provider timeout/cancel 补完整后，我会认为已经非常接近 **“可以直接进入 M0/M1 开发的工程 SPEC”**。