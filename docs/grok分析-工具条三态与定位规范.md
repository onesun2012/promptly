# Grok 分析：产品/工程/发布成熟度 + 工具条三态 + 定位规范

> 抓取自 grok.com 对话，2026-08-30。原文未删改。

chatgpt对spec的分析.md
chatgpt分析.md
chatgpt修改意见1.md

我做了一个windows版的划词工具，第1/2/3截图是根据chatgpt修改意见1.md修改的，第4个配置界面。分析一下有哪些可以优化的，达到什么程度可以发布推广

工作了 5s

根据你提供的截图（悬浮球、聊天窗、划词工具条、配置页）以及之前两份 ChatGPT 分析文档，我对当前版本做一次产品 + 工程 + 发布就绪度的综合分析。

一、当前状态总览

你已经把上一轮反馈落地了不少关键点：

项目	之前问题	当前状态	评价
悬浮球品牌	动物头像	改成带环形的 P	明显进步，品牌一致性提升
划词工具条信息	显示 chrome.exe	改成「Promptly + 选中文本 + ✓ Safe」	正确方向
Action 层级	按钮平均	Ask / Translate / Rewrite 主按钮 + Summarize / Explain 次级	有主次，但仍可再精简
工具条尺寸	偏大像小窗口	已缩小，接近选区工具条	接近可用
配置页	基础 Provider Lab	有 Test connection、Saved profiles、Settings	功能闭环已有雏形
聊天窗	-	左侧会话列表 + 主对话区 + 底部输入	结构正确，视觉仍偏“开发中”

整体判断：

功能方向已基本正确，视觉和交互已从“原型”进入“可用 MVP”，但距离“可自信推广”还有明显打磨空间。

二、各界面可优化点（按优先级）
1. 划词工具条（产品之魂，优先级最高）

当前已较接近目标，但仍有几处可显著提升：

必须改：

选中文本预览再弱一点：现在整段 "Raycast mini action bar" 显示没问题，但建议限制为一行截断 + 字符数，避免长文本把工具条撑高。
主次按钮再明确：Ask / Translate / Rewrite 用实心/高对比，Summarize / Explain 用描边或更低对比。当前两者视觉权重仍接近。
结果态与动作态分离：点击 Action 后工具条应进入「加载 / 结果」状态（显示结果 + Copy / Retry / 关闭），而不是始终保持按钮列表。这是体验分水岭。
定位与碰撞：SPEC 里建议正式定义 ToolbarPositioner（优先选区下方 → 上方 → 边缘修正），多显示器 + DPI 是高频坑。

建议增强：

第一次出现可稍完整，后续用户熟悉后可更克制（甚至允许用户置顶常用 3 个 Action）。
Close 改成纯 ×，减少文字噪音。
Safe 徽章保持轻量（✓ Safe 已不错），不要再加调试信息。

目标形态参考：

text
复制
┌─────────────────────────────────────┐
│ ✦ Promptly                    ✓ Safe │
│ “Raycast mini action bar”            │
│                                      │
│ [Ask]  [Translate]  [Rewrite]        │
│ Summarize   Explain          ⋯       │
└─────────────────────────────────────┘

点击后变成结果卡片，保持小而贴边。

2. 悬浮球

当前 P + 紫色环形 已经比动物头像专业很多，但仍可优化：

Idle 时建议半透明或更低调，Hover 时再清晰 + 微发光。
尺寸控制在 40–48px，避免抢视线。
Hover 展开微型菜单（Ask / Chat / Settings）可作为 v1.1，不必阻塞 v1。
与工具条、聊天窗共用同一套 Design Token（背景、边框、Accent #7C5CFF 类紫色、圆角、阴影）。
3. 聊天窗口

当前结构正确，但视觉仍偏“Electron 默认 + 深色主题拼凑”：

左侧会话列表可更紧凑，当前标题截断后辨识度一般。
主内容区阅读体验可再提升（行高、段落间距、代码/列表样式）。
底部输入框 + Send 按钮可更统一（高度、圆角、焦点态）。
悬浮球出现在聊天窗右侧是合理的，但需确保不遮挡内容，且点击行为清晰（唤起 vs 拖拽）。
4. 配置页（Providers + Settings）

这是目前最接近可发布的一块，但仍有体验缺口：

Test connection 流程要完整闭环：成功后自动拉模型列表 → 默认选一个 → 可选发送测试请求。
Saved profiles 管理要更明确（编辑、设默认、删除确认）。
「Launch Promptly at startup」默认建议改为不勾选（或首次启动明确询问），与“尊重用户机器 / Privacy”定位一致。
语言、Helper 状态、版本号已有，可再加简单的「关于 / 隐私说明 / 开源许可」。
三、结合之前 SPEC 分析，工程上仍需补齐的关键项

之前 ChatGPT 分析里最核心的建议依然成立，发布前建议至少完成这些：

Selection State Machine + Action State Machine 拆分
不要把 SHOW_TOOLBAR → STREAMING 揉在一起。否则后续“选中 A 正在流式，又选中 B”会乱。
sessionId / requestId
所有 Selection 与 Action 必须带唯一 ID，防止结果串台。
Sensitive / Unknown 明确三态
SAFE → 继续；SENSITIVE / UNKNOWN → 不触发、不做 Clipboard fallback。
Clipboard 竞态规则
备份 → Ctrl+C → 读取期间若检测到用户自己改了剪贴板，则放弃恢复旧内容。
Helper 生命周期 + 崩溃重启
辅助进程崩溃不影响主程序，并有重启逻辑。
超时 / 取消 / 重试
SSE 断流、超时、用户取消必须有明确状态与清理。
误触发率指标
密码框 = 0；普通拖拽 / 窗口移动误触发极低。这比单纯“300ms 弹条”更重要。

这些补齐后，工程成熟度会从“能跑”进入“可长期维护”。

四、发布推广需要达到的程度
可以小范围发布（内测 / 朋友圈 / 小圈子）的最低线
划词在 Chrome / Edge / 记事本 / VS Code 主流场景稳定可用（≥90% 正确取词）。
密码框 / 敏感控件零误触发。
Clipboard 不丢用户原有内容（含文本、HTML、图片多格式抽测）。
工具条不挡内容、定位基本正确。
Provider 配置 + Test connection 可用，至少一个 OpenAI-compatible 端点跑通流式。
无严重崩溃（Helper 崩溃可自动恢复）。
有基础隐私说明（本地优先、API 直连、Key 用 DPAPI）。

当前截图显示你已接近这条线，但结果态交互、多场景稳定性、Clipboard 竞态还需实测验证。

可以公开推广（Product Hunt / Reddit / 独立开发者社区 / 官网）的推荐线
维度	要求
核心体验	选中 → 工具条 → Action → 流式结果 → Copy/Retry，全流程顺滑、不打扰
稳定性	主流应用误触发率极低，密码框绝对安全
视觉	统一 Design Token，悬浮球 / 工具条 / 聊天窗 / 设置页看起来是同一产品
品牌	「Select anything. Ask any AI.」+ Local-first / BYOK / 零账号 / 直连
配置	Test connection 可靠，Saved profiles 管理清晰，默认不强制开机启动
错误处理	超时、断流、Key 错误、网络错误有明确提示与恢复路径
隐私叙事	官网 / 关于页明确写清：数据不经过你的服务器
竞品差异	强调 Windows-first + 真正本地直连 + 无账号，而不是“又一个划词 AI”

达到这一档后，再考虑正式推广。否则容易被用户一句“不稳定 / 误触发 / 看起来像半成品”直接劝退。

不建议现在就大力推广的原因
工具条还停留在“动作列表”阶段，结果呈现与后续操作（Copy / Retry / 替换）体验尚未闭环。
聊天窗与工具条的视觉统一度不够，整体仍偏“功能拼装”。
工程边界（状态机拆分、sessionId、Clipboard 竞态、Helper 重启）若未落地，公开后 Bug 会集中爆发。
竞品（Raycast Selected Text、AskAny.ai、Bragi 等）已存在，差异化叙事需要更清晰才能站稳。
五、建议的下一步行动顺序（不增加功能，只打磨）
把划词工具条打造成真正的“选区 Command Bar”
动作态 → 加载态 → 结果态三态清晰，尺寸再压一点，主次按钮分明。
统一 Design Token
悬浮球、工具条、聊天窗、设置页共用背景 / 边框 / Accent / 圆角 / 阴影。
补齐 Selection / Action 状态机 + sessionId + Clipboard 规则（工程）
这是稳定性和可维护性的根基。
做一轮真实场景验收
Chrome / Edge / VS Code / 记事本 / WPS + 密码框 + 拖拽 + 多显示器 + 剪贴板多格式。
配置页打磨 Test connection 与默认启动行为。
准备最小可推广物料
一句话定位、3 张核心截图（选中→工具条→结果）、隐私说明、简单落地页。

完成以上后，再评估是否进入公开推广。当前最值得做的不是加功能，而是把「选中文字 → 工具条 → Action → 结果」这一条路径打磨到快、准、不打扰、看起来像一个完整产品。

如果你愿意，我可以下一步直接帮你出一版更具体的「工具条三态交互说明」或「Design Token 建议清单」，方便你对照改 UI。

好的

工作了 5s

好的，下面直接给你两份可落地的材料，方便你对照改 UI 和交互。

一、划词工具条三态交互说明（核心）

目标：小、快、贴选区、不打断工作。

状态严格分为三态，互不混用。

状态 1：动作态（Action State）——刚弹出时
text
复制
┌────────────────────────────────────────────┐
│ ✦ Promptly                          ✓ Safe │
│ “Raycast mini action bar”                  │  ← 一行截断，超长加 …
│                                            │
│  [ Ask ]   [ Translate ]   [ Rewrite ]     │  ← 主按钮（实心 / 高对比）
│  Summarize    Explain              ⋯       │  ← 次按钮（描边或低对比）
└────────────────────────────────────────────┘

规则：

尺寸建议控制在 ≈ 280–320 × 90–110（尽量小）。
主按钮 3 个，次按钮 2 个 + More。
点击主/次按钮 → 进入「加载态」。
点击空白处 / Esc / × → 关闭，回到 IDLE。
不显示 Copy（此时还没有结果）。
状态 2：加载态（Loading State）
text
复制
┌────────────────────────────────────────────┐
│ ✦ Translating…                             │
│                                            │
│  The selected text is being processed…     │  ← 可选简短提示
│                                            │
│                          [ Cancel ]        │
└────────────────────────────────────────────┘

规则：

显示当前 Action 名称 + 加载动画（轻量旋转或进度点）。
提供 Cancel（取消当前请求，清理资源，回到动作态或直接关闭）。
超时 / 网络错误 → 进入错误提示，提供 Retry / Close。
状态 3：结果态（Result State）
text
复制
┌────────────────────────────────────────────┐
│ ✦ Translation                        [Copy]│
│                                            │
│  这是翻译后的结果文本……                     │
│  （可滚动，最大高度限制，避免撑满屏幕）      │
│                                            │
│              [ ↻ Retry ]          [ × ]    │
└────────────────────────────────────────────┘

规则：

标题显示 Action 名称（Translation / Summary 等）。
Copy 按钮在结果出来后才出现，且视觉权重提高。
Retry 重新发起同一 Action（带同一 sessionId）。
结果区域限制最大高度，超出滚动。
关闭后工具条消失，不残留。
通用规则（所有状态）
始终贴着选区（优先下方 → 上方 → 屏幕边缘自动修正）。
多显示器 + DPI 必须正确转换坐标。
Promptly 自身窗口（工具条、聊天窗、设置页）的鼠标事件不触发新选词。
每个 Selection 带唯一 sessionId，结果严禁串台。
敏感 / Unknown → 直接不弹出工具条。
二、Design Token 建议清单（统一视觉语言）

把悬浮球、工具条、聊天窗、设置页全部统一到同一套 Token，用户会立刻感觉“这是一个产品”。

颜色
text
复制
Background (App / 深色主背景)   #0F1115
Surface (卡片 / 工具条背景)     #171A21
Surface Elevated (悬浮层)      #1E222B
Border                         #2A2F3A
Border Subtle                  #23262F

Text Primary                   #E8EAED
Text Secondary                 #8B93A1
Text Muted                     #6B7280

Accent (主色，按钮/高亮)        #7C5CFF
Accent Hover                   #8B6FFF
Accent Muted                   #5B45C4

Success (Safe 徽章)            #22C55E
Danger / Error                 #EF4444
Warning                        #F59E0B
圆角 & 阴影
text
复制
Radius sm     6px
Radius md     10px
Radius lg     14px
Radius full   9999px   ← 悬浮球

Shadow toolbar:
  0 4px 16px rgba(0,0,0,0.35),
  0 0 0 1px rgba(255,255,255,0.04)

Shadow ball:
  0 2px 8px rgba(0,0,0,0.4)
字体
text
复制
Font Family: system-ui, -apple-system, "Segoe UI", sans-serif
Font Size:
  xs   11px
  sm   12px
  base 13px
  md   14px
  lg   16px

Line Height: 1.4 ~ 1.5
组件级建议
组件	背景	边框	圆角	其他
划词工具条	Surface	Border	md	轻阴影，最大宽度约 320px
主按钮	Accent	无	sm	白字，Hover 稍亮
次按钮	透明	Border	sm	次级文字色
Safe 徽章	极浅绿底	无	full	小字 + ✓
悬浮球	Surface Elevated	细边框	full	Idle 半透明 0.7，Hover 1.0 + 微光
聊天窗侧边栏	Background	右侧细边框	-	紧凑列表
输入框	Surface	Border	md	焦点时 Accent 描边
悬浮球具体建议
尺寸：42–48px
Idle：透明度 ≈ 0.65–0.75，几乎不抢视线
Hover：透明度 1.0 + 轻微缩放或光晕
图标：保持当前 P + 环形，不要再换动物
拖拽时增加轻微阴影反馈
三、落地优先级（建议你按这个顺序改）
工具条三态（动作 → 加载 → 结果）——体验分水岭
统一 Design Token（颜色、圆角、阴影、按钮样式）
工具条尺寸再压一点 + 主次按钮对比加强
结果态 Copy / Retry 交互
悬浮球 Idle / Hover 状态
聊天窗与工具条视觉对齐

完成 1–3 后，整体观感会从“功能原型”明显跃升到“可给人看的产品”。

需要的话，我可以继续帮你写：

工具条在不同屏幕位置的定位伪代码 / 规则表
或者直接出一版更详细的「结果态 + 错误态」文案与布局

你想先推进哪一块？

工具条在不同屏幕位置的定位伪代码 / 规则表

工作了 4s

以下是可直接落地的 划词工具条定位规则表 + 伪代码，专为 Windows 多显示器、DPI 缩放、任务栏等场景设计。

一、定位规则表（优先级从高到低）
优先级	规则	说明
1	优先选区下方	工具条顶部对齐选区底部 + 间距（推荐 8px）
2	空间不足时翻到上方	下方剩余高度 < 工具条高度 + 安全边距 → 改到选区上方
3	水平居中于选区	工具条水平中心尽量对齐选区水平中心
4	左右边缘修正	超出屏幕左右边界时，向内推，保持最小边距（推荐 8px）
5	上下边缘修正	超出屏幕上下边界时，强制贴边并保留最小边距
6	任务栏避让	检测任务栏位置（底/顶/左/右），避免被遮挡
7	多显示器正确归属	以选区所在显示器为基准，不要跑到另一块屏
8	DPI 感知	所有坐标使用物理像素或正确转换后的逻辑像素，支持 125%/150%/200%
9	不遮挡选区本身	工具条与选区矩形保持最小间距，避免重叠
10	鼠标位置微调（可选）	若选区很窄，可轻微向鼠标释放点靠近，提升“跟手感”

推荐常量：

text
复制
MARGIN_SCREEN     = 8px    // 距离屏幕边缘最小距离
MARGIN_SELECTION  = 8px    // 距离选区最小距离
TOOLBAR_MAX_WIDTH = 320px
TOOLBAR_HEIGHT    ≈ 100px  // 根据实际内容动态计算
二、核心伪代码
TypeScript
复制
interface Rect {
  x: number;      // 左上角 x（屏幕坐标）
  y: number;      // 左上角 y
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface Monitor {
  bounds: Rect;           // 显示器完整区域
  workArea: Rect;         // 排除任务栏后的工作区
  scaleFactor: number;    // DPI 缩放
}

function positionToolbar(
  selectionRect: Rect,        // 选区在屏幕上的矩形（已是屏幕坐标）
  toolbarSize: { width: number; height: number },
  mouseUpPoint?: Point        // 可选：鼠标释放点
): Point {
  // 1. 找到选区所在的显示器
  const monitor = getMonitorFromRect(selectionRect);
  const work = monitor.workArea;   // 使用工作区，自动避开任务栏

  const tbW = Math.min(toolbarSize.width, TOOLBAR_MAX_WIDTH);
  const tbH = toolbarSize.height;

  // 2. 水平位置：尽量居中于选区
  let x = selectionRect.x + (selectionRect.width - tbW) / 2;

  // 左右边界修正
  if (x < work.x + MARGIN_SCREEN) {
    x = work.x + MARGIN_SCREEN;
  } else if (x + tbW > work.x + work.width - MARGIN_SCREEN) {
    x = work.x + work.width - tbW - MARGIN_SCREEN;
  }

  // 3. 垂直位置：优先下方
  let y: number;
  const spaceBelow = (work.y + work.height) - (selectionRect.y + selectionRect.height);
  const spaceAbove = selectionRect.y - work.y;

  const needBelow = tbH + MARGIN_SELECTION + MARGIN_SCREEN;
  const needAbove = tbH + MARGIN_SELECTION + MARGIN_SCREEN;

  if (spaceBelow >= needBelow) {
    // 下方空间足够
    y = selectionRect.y + selectionRect.height + MARGIN_SELECTION;
  } else if (spaceAbove >= needAbove) {
    // 上方空间足够
    y = selectionRect.y - tbH - MARGIN_SELECTION;
  } else {
    // 上下都不够：选择空间更大的一侧，并做边缘吸附
    if (spaceBelow >= spaceAbove) {
      y = work.y + work.height - tbH - MARGIN_SCREEN;
    } else {
      y = work.y + MARGIN_SCREEN;
    }
  }

  // 4. 最终上下边界再保险一次
  if (y < work.y + MARGIN_SCREEN) {
    y = work.y + MARGIN_SCREEN;
  } else if (y + tbH > work.y + work.height - MARGIN_SCREEN) {
    y = work.y + work.height - tbH - MARGIN_SCREEN;
  }

  // 5. 可选：向鼠标释放点轻微靠拢（选区很宽时提升跟手感）
  if (mouseUpPoint && selectionRect.width > tbW * 1.5) {
    const mouseOffset = mouseUpPoint.x - (x + tbW / 2);
    const maxAdjust = 40; // 最多微调 40px
    x += Math.max(-maxAdjust, Math.min(maxAdjust, mouseOffset * 0.3));
    // 微调后再做一次左右边界检查
    x = clamp(x, work.x + MARGIN_SCREEN, work.x + work.width - tbW - MARGIN_SCREEN);
  }

  return { x: Math.round(x), y: Math.round(y) };
}
三、关键辅助函数（Windows 场景）
TypeScript
复制
// 根据选区矩形找到对应显示器（支持多屏）
function getMonitorFromRect(rect: Rect): Monitor {
  // 优先使用选区中心点所在的显示器
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return getMonitorFromPoint({ x: centerX, y: centerY });
}

// 获取鼠标释放点所在显示器（备用）
function getMonitorFromPoint(point: Point): Monitor {
  // Electron: screen.getDisplayNearestPoint(point)
  // 原生 Helper: MonitorFromPoint / EnumDisplayMonitors
}

// 获取工作区（自动排除任务栏）
function getWorkArea(monitor: Monitor): Rect {
  // Electron: display.workArea
  // 原生: SystemParametersInfo(SPI_GETWORKAREA) 或 GetMonitorInfo
}
四、特殊场景处理表
场景	处理方式
选区在屏幕最底部（任务栏上方）	自动翻到选区上方
选区在屏幕最顶部	优先下方，下方不够则贴顶
选区跨两个显示器	以选区中心点所在显示器为准
纵向任务栏（左侧或右侧）	使用 workArea，水平方向自动避开
150% / 200% DPI	所有坐标统一用屏幕物理坐标或正确 scale 后的逻辑坐标，禁止混用
选区极窄（几个字符）	水平居中即可，不必强行跟鼠标
选区极宽（整行）	可启用「向鼠标释放点轻微靠拢」
工具条自身被点到	忽略，不触发新的 Selection（防重入）
全屏应用 / 游戏	建议在 CHECK_APPLICATION 阶段直接拦截，不弹工具条
五、实现建议（Electron + Native Helper）
选区矩形来源
优先用 UIA 拿到 BoundingRectangle，转成屏幕坐标。
Clipboard fallback 时可用鼠标释放点 ± 估算，或记录 MouseDown/Up 的包络矩形。
坐标一致性
Helper 返回的坐标必须是屏幕坐标（已考虑 DPI）。
Electron 端用 screen.getDisplayNearestPoint + workArea 做最终计算最稳。
动态高度
工具条高度会随内容变化（动作态 vs 结果态）。
结果态如果内容很长，建议限制最大高度（例如 240px）并内部滚动，定位时用实际渲染后的高度重新算一次位置（可做轻量二次定位）。
二次定位（推荐）
第一次先按预估高度定位并显示 → 内容渲染完成后如果高度变化较大，再平滑微调一次 y，避免跳动感。
性能
定位计算非常轻量，可在 SHOW_TOOLBAR 时同步完成，不必异步。
六、可直接写入 SPEC 的精简版规则
text
复制
Toolbar Positioning Rules

1. Anchor = selection bounding rect (screen coordinates)
2. Preferred position = below selection + 8px gap
3. If not enough space below → place above selection
4. Horizontally center on selection, then clamp to monitor workArea with 8px margin
5. Always use the monitor that contains the selection center
6. Respect workArea (auto-avoid taskbar)
7. Support per-monitor DPI
8. Toolbar must never cover the selection itself
9. Ignore mouse events originating from Promptly windows

需要的话，我可以继续补充：

结果态高度变化后的「平滑二次定位」伪代码
或者把这套规则整理成更正式的 SPEC 章节格式（可直接粘贴进文档）

你更想先要哪一个？

把这套规则整理成更正式的 SPEC 章节格式（可直接粘贴进文档）

工作了 2s
Markdown
复制
## 附录 X：划词工具条定位规范（Toolbar Positioning Specification）

### X.1 目标

保证划词工具条在任意屏幕布局、DPI 缩放、多显示器及任务栏配置下：

- 尽可能贴近选区，不遮挡选中文本
- 始终完整可见
- 行为可预测、可测试
- 与 Promptly 整体「轻量、不打扰」的产品定位一致

### X.2 设计原则

1. **优先下方**：默认出现在选区下方。
2. **空间不足自动翻转**：下方空间不足时优先尝试上方。
3. **水平居中**：工具条水平中心尽量对齐选区水平中心。
4. **严格边界约束**：任何情况下不得超出当前显示器工作区（workArea）。
5. **任务栏感知**：使用工作区而非完整显示器区域，自动避开任务栏。
6. **多显示器正确归属**：以选区中心点所在显示器为基准。
7. **DPI 安全**：所有坐标计算必须正确处理 per-monitor DPI。
8. **不遮挡选区**：工具条与选区保持最小间距。
9. **防重入**：工具条自身产生的鼠标事件不得触发新的 Selection。

### X.3 常量定义

| 常量名 | 推荐值 | 说明 |
|--------|--------|------|
| `MARGIN_SCREEN` | 8px | 工具条距离屏幕工作区边缘的最小距离 |
| `MARGIN_SELECTION` | 8px | 工具条距离选区边缘的最小距离 |
| `TOOLBAR_MAX_WIDTH` | 320px | 工具条最大宽度 |
| `TOOLBAR_ESTIMATED_HEIGHT` | 100px | 动作态预估高度（实际以渲染后为准） |
| `MAX_MOUSE_ADJUST` | 40px | 向鼠标释放点微调的最大距离 |
| `MOUSE_ADJUST_RATIO` | 0.3 | 鼠标微调系数 |

> 实际高度应以工具条渲染完成后的真实高度为准，允许在内容变化后进行一次轻量二次定位。

### X.4 输入与输出

**输入：**

- `selectionRect`：选区在屏幕坐标系下的矩形（x, y, width, height）
- `toolbarSize`：工具条当前尺寸（width, height）
- `mouseUpPoint`（可选）：鼠标释放时的屏幕坐标

**输出：**

- 工具条左上角屏幕坐标 `{ x, y }`

### X.5 定位算法

```text
function positionToolbar(selectionRect, toolbarSize, mouseUpPoint?):

  1. 根据 selectionRect 中心点确定目标显示器 monitor
  2. 获取该显示器的 workArea（已排除任务栏）

  3. 计算水平位置：
     x = selectionRect.x + (selectionRect.width - toolbarWidth) / 2
     将 x 限制在 [workArea.left + MARGIN_SCREEN, workArea.right - toolbarWidth - MARGIN_SCREEN]

  4. 计算垂直位置（优先下方）：
     spaceBelow = workArea.bottom - selectionRect.bottom
     spaceAbove = selectionRect.top - workArea.top

     if spaceBelow >= toolbarHeight + MARGIN_SELECTION + MARGIN_SCREEN:
         y = selectionRect.bottom + MARGIN_SELECTION
     else if spaceAbove >= toolbarHeight + MARGIN_SELECTION + MARGIN_SCREEN:
         y = selectionRect.top - toolbarHeight - MARGIN_SELECTION
     else:
         // 两侧都不足，选择空间较大的一侧并贴边
         if spaceBelow >= spaceAbove:
             y = workArea.bottom - toolbarHeight - MARGIN_SCREEN
         else:
             y = workArea.top + MARGIN_SCREEN

  5. 最终垂直边界保护：
     将 y 再次限制在 workArea 有效范围内

  6. （可选）鼠标微调：
     当 selectionRect.width > toolbarWidth * 1.5 且提供了 mouseUpPoint 时，
     向鼠标释放点方向进行有限微调（不超过 MAX_MOUSE_ADJUST），
     微调后再次执行水平边界检查

  7. 返回四舍五入后的整数坐标 {x, y}
X.6 显示器与坐标规则
显示器选择：始终使用包含选区中心点的显示器。若选区跨屏，以中心点为准。
工作区优先：定位计算必须基于 workArea，而非完整 bounds，以自动避开任务栏（底部、顶部、左侧、右侧均适用）。
坐标体系：
Native Helper 返回的选区坐标必须为屏幕坐标，并已正确处理 DPI。
Electron 端使用 screen.getDisplayNearestPoint 与 display.workArea 进行最终计算。
DPI 要求：支持 100% / 125% / 150% / 200% 等常见缩放比，禁止逻辑像素与物理像素混用。
X.7 特殊场景处理
场景	处理策略
选区靠近屏幕底部（任务栏上方）	自动翻转到选区上方
选区靠近屏幕顶部	优先下方，下方不足则贴顶显示
选区水平跨两个显示器	以选区中心点所在显示器为准
纵向任务栏（左/右）	依赖 workArea 自动避开
选区极窄	仅做水平居中，不启用鼠标微调
选区极宽	允许向鼠标释放点进行有限微调
工具条高度在结果态显著变化	允许在内容渲染完成后进行一次平滑二次定位
全屏应用 / 游戏	在 CHECK_APPLICATION 阶段拦截，不显示工具条
工具条自身被点击	忽略，不触发新的 Selection（防重入）
X.8 二次定位（结果态高度变化时）

当工具条从动作态切换到结果态，高度发生明显变化时：

使用新的真实高度重新执行定位算法。
若新位置与当前位置差异较小，可直接更新。
若差异较大，建议使用短时过渡（≤ 120ms）平滑移动，避免跳动感。
二次定位仍必须遵守所有边界与工作区约束。
X.9 与状态机的关系
定位计算发生在 POSITION_TOOLBAR 阶段。
只有定位成功后才进入 TOOLBAR_VISIBLE。
定位失败（极端情况）时，应安全回退到 IDLE，并记录日志，不得显示残缺工具条。
工具条可见期间，所有来自 Promptly 自身窗口的鼠标事件必须被忽略。
X.10 验收标准
在单显示器 + 100%/125%/150% DPI 下，工具条均完整可见且不遮挡选区。
在双显示器（主屏扩展）场景下，工具条始终出现在选区所在屏幕。
任务栏位于底部、顶部、左侧、右侧时，工具条均不被遮挡。
选区位于屏幕四边及四角时，工具条位置符合「优先下方 → 上方 → 贴边」的预期。
结果态高度变化后，工具条仍保持完整可见，无严重跳动。
工具条自身点击不会触发新的划词流程。
X.11 实现注意事项
选区矩形优先来自 UIA BoundingRectangle，并转换为屏幕坐标。
Clipboard fallback 场景下，可使用 MouseDown 到 MouseUp 的包络矩形或鼠标释放点进行近似定位。
定位算法本身必须是同步且轻量的，不得引入可感知延迟。
所有边界计算使用整数像素，避免亚像素定位导致的模糊。

版本记录建议

v1.0：首次写入完整定位规范
后续如调整间距、最大宽度或二次定位策略，请同步更新常量与验收标准。
text
复制
以上内容可直接复制到你的 SPEC 文档中使用。需要我再帮你把「二次定位」部分写得更详细，或者补一个对应的测试用例表吗？




Fast