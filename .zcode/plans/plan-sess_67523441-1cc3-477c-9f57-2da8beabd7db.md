# Promptly v1.0.0 发布计划（含打赏渠道）

## 前置（半小时，和你配合）
- **A5 缩放复测**：显示缩放切 125%/150% 各划词一次，验证贴光标，记录到验收矩阵。
- 验证 `build/installer.nsh` 打包后生效（装/卸一次查自启 Run 键）。

## Phase 1：更新链路 electron-updater（约 1.5h）
1. `npm i electron-updater`
2. `electron-builder.yml` 加 `publish: { provider: github, owner: onesun2012, repo: promptly }`（产出 latest.yml + blockmap）
3. 新 `src/main/updater.ts`：仅打包环境启用；ready 后 5s 静默检查；进度 IPC 广播到设置页；托盘加「检查更新」；失败静默
4. 设置页显示更新状态 + 10 语种字串

## Phase 2：Electron Fuses 加固（约 0.5h）
- `@electron/fuses`：runAsNode=off、nodeCliInspect=off、NODE_OPTIONS=off、onlyLoadAppFromAsar=on
- asar 完整性校验需签名配合，跳过

## Phase 3：匿名安装统计（约 1.5h）
1. `src/main/install-ping.ts`：首启 GET Worker URL，只带 `?v=版本&os=win`，3s 超时静默
2. settings 加 `statsEnabled`（默认开）+ 设置页复选框（10 语种）
3. Worker URL 常量放 `src/shared/config.ts`（占位，你部署后填）
4. 交付 `scripts/cf-worker.js`（KV 计数，wrangler 部署，免费）
5. 隐私页明示范围与关闭方法

## Phase 4：隐私页 + LICENSE（约 1h）
- `PRIVACY.md`（中文+英文摘要）：本地优先 / DPAPI 加密 / API 直连 / 零内容遥测 / 安装 ping 范围与关闭 / 联系邮箱
- `LICENSE`（MIT），README 的 "License TBD" 改掉

## Phase 5：打赏渠道（约 1.5h）★新增
统一一个「支持 Promptly」弹层，多处入口：
1. **资产**：`build/donate/wechat.png`、`alipay.png`（你提供两张收款码截图；链接类不用图）
2. **弹层内容**（设置页新组件）：
   - 国内：微信赞赏码 / 支付宝收款码（二维码并排展示，点击放大）+ 爱发电链接（月捐）
   - 海外：GitHub Sponsors 按钮（主路径）+ Ko-fi 链接（轻量一杯咖啡）
3. **入口**：
   - 设置页现有「Support the project」按钮（当前是空链接）→ 打开此弹层
   - 首次启动欢迎/关于弹层带一个「支持」标签（不强制弹出，首次启动显示一次）
   - 托盘右键菜单加「支持项目」
4. **README**：顶部加 GitHub Sponsors 赞助徽章 + 爱发电/Ko-fi 链接
5. **落地页**：页脚「支持开发」区块（Sponsors/Ko-fi/爱发电三按钮）
6. 10 语种 i18n 字串（约 5 条/语言）
7. NSIS 卸载完成页不放二维码（场景不合适，跳过）

## Phase 6：README 产品化 + 落地页（约 2h）
- README 重写：定位 → 功能 → GIF → 下载 → 快速上手 → 赞助 → 隐私 → 开发构建
- 录 3 个 GIF（你操作我录屏）：三态工具条 / 悬浮球拖拽 / 粘贴截图识别
- `site/index.html` 单页（纯 HTML+CSS）：卖点 + GIF + 下载按钮（Releases latest）+ GitHub API 实时下载数 + 教程 + 页脚赞助区
- `npm run site:deploy` 推 gh-pages 分支，你在 repo 设置启用 Pages

## Phase 7：发布 v1.0.0（约 1h）
1. version → 1.0.0，`npm run dist` 验证产物
2. 干净环境验证：安装/自启/卸载清理/划词/更新检查静默
3. `git push origin main`（网络恢复后）+ `git tag v1.0.0` + `gh release create v1.0.0`（上传 Setup.exe + latest.yml + blockmap）
4. 社区发帖包起草（v2ex/小众软件/Reddit r/software/少数派）

## 明确不做（v1.0）
- 代码签名（v1.1 视用户量买 Certum ~€69/年）、Crash 上报、CI/CD、NSIS 卸载页二维码

## 需要你配合的四件事
1. A5 缩放复测（10 分钟）
2. 提供微信/支付宝收款码截图 + 你的爱发电/Ko-fi/GitHub Sponsors 账号链接（Sponsors 需要在 GitHub 上开通，5 分钟）
3. Cloudflare 账号 + `wrangler deploy`（15 分钟，代码我全给）
4. GitHub Pages 开关 + 发社区帖（15 分钟）

预计总工作量：两个工作时段内完成，v1.0.0 本周内可发布。