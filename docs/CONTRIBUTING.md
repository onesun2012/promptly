# CONTRIBUTING — Promptly 工程规范

> 单人项目也要有纪律：提交历史是未来唯一的"当时为什么这么改"的记录。

## 1. 提交规范（Conventional Commits 1.0.0）

格式：`<type>(<scope>): <subject>`

```
feat(selection): add clipboard fallback with multi-format restore
fix(provider): handle groq streaming error format
docs: update spec v1.1 success criteria
chore: bump electron to 30.2.0
```

### 类型表

| type | 用途 | 影响版本 |
|---|---|---|
| `feat` | 新功能 | MINOR（如含 `!` 或 `BREAKING CHANGE:` 则 MAJOR） |
| `fix` | 缺陷修复 | PATCH |
| `docs` | 仅文档变更 | — |
| `refactor` | 既非新增也非修复的代码变更 | — |
| `perf` | 性能优化 | PATCH |
| `test` | 测试相关 | — |
| `build` | 构建/依赖/打包变更 | — |
| `ci` | CI 配置变更 | — |
| `chore` | 其他杂项 | — |

### 规则

1. subject 用英文、祈使句、不加句号、≤ 72 字符；
2. scope 常用值：`selection`（取词管线）、`provider`（适配层）、`chat`（聊天窗）、`ball`（悬浮球）、`settings`、`i18n`、`installer`；
3. 一个提交只做一件事；提交前 `git status` 检查不带杂物；
4. **红线**：API key、`.env`、`references/`（第三方参考代码）永远不入库。

## 2. 版本（SemVer）

`MAJOR.MINOR.PATCH`；发版打 tag：`git tag -a v1.0.0 -m "..."` → push tag 触发 GitHub Release → electron-updater 向用户分发。

## 3. 分支

- `main`：主干，**任何时刻可构建**；单人开发默认直接提交 main；
- 实验性/高风险改动：`feat/<name>` 短期分支，验证后合回并删除。

## 4. 本地提交身份

仓库级已配置（不改全局）：

```
git config user.name  onesun2012
git config user.email onesun2012@users.noreply.github.com
```

如需更换（例如用真实邮箱以关联 GitHub 贡献图），只改仓库级配置即可。
