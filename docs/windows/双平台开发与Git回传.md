# 通过 T7 在 Windows 开发，再同步回 Mac

T7 只负责运输。两台电脑各自在本机磁盘开发、安装依赖和构建；使用 Git 提交同步源码，使用独立目录交接安装候选和验收证据。

## 交付内容

- `pet-studio-lite.bundle`：当前开发分支 `feat/dual-platform-workbench` 及其完整可达 Git 历史，离线即可克隆。历史混合产品记录保持原样；当前工作范围仍以 AGENTS.md 的 Petdex 边界为准。
- `source/`：同一提交的源码快照，含素材、配置、测试、文档和 package-lock.json。
- `SOURCE-COMMIT.txt`：本次源码基线；`APP-SOURCE-COMMIT.txt`：所附 beta.2 应用 ZIP 的原构建源码提交。r2 只修订工具，两者不同是预期的。
- `candidate.json` 与 Windows ZIP：保留已实测 beta.2 的精确二进制身份。
- `本轮验证证据/`、修复说明及回传报告：区分已通过的窄范围实测与待完成项目。

不搬运 Mac 的 node_modules、构建缓存或运行中的用户数据。Windows 通过 npm ci 重建依赖；后续平台产物各自版本化保留。需要同步个人项目数据时另做导出、备份与兼容性校验，不用源码合并代替数据迁移。

## Windows 首次接收

先将整个交付目录从 T7 复制到 Windows 本地磁盘。安装 Git 和 Node.js 22.18+ 后，在交付目录打开 PowerShell，执行下面的命令。目标目录必须尚不存在：

```powershell
git clone -b feat/dual-platform-workbench .\pet-studio-lite.bundle C:\PetStudioDev\pet-studio-lite
cd C:\PetStudioDev\pet-studio-lite
git switch -c windows/beta2-acceptance
npm ci
```

克隆会校验对象完整性。克隆后用 `git rev-parse HEAD` 对照交付的 `SOURCE-COMMIT.txt`；两者应一致。无需初始化或改写交付目录。

依赖安装成功后，执行：

```powershell
npm run verify:windows-source
```

这会依次验证完整 npm test、原生 Windows PowerShell 5.1 的报告生成、typecheck。通过后再执行 `npm run package:win`，生成独立安装版候选。遇到失败时 Windows 本地 Agent 直接修复、回归测试、提交；不用每个 Windows 错误都往返 Mac。

## 给 Windows 本地 Agent 的任务

先读 AGENTS.md、`docs/windows/2026-09-15-beta2-r2-tools-fix.md` 和本说明，核对 Git 基线。只在本地克隆的 `windows/beta2-acceptance` 分支开发。先运行源码门禁，修复实际失败；再打包并对准确哈希的候选执行 Windows 验收。已有 beta.2 ZIP 的 Boba 清理证据可保留，但不能替代新安装版证据。自动化尽量自主完成，人工动画/拖动/菜单感受由用户确认；交互 PowerShell 工具保持 tty=true。记录所有 fail/blocked/incomplete；不要把未生成的 result.json 当成通过。

保存本次修改的明确文件列表，逐项提交代码与相关测试文档，不将 node_modules、用户数据、凭据或大型构建产物提交 Git。系统 DPI、安装/卸载等操作应遵循用户在 Windows 会话中授权的范围；不删除或覆盖历史候选。不要提交或推送到远程仓库来代替本地交接。

## Windows 回传

在工作仓库确认本次开发改动已提交，且 `git status --short` 没有遗漏的源码修改。然后执行：

```powershell
git bundle create ..\pet-studio-lite-windows-return.bundle windows/beta2-acceptance
git bundle verify ..\pet-studio-lite-windows-return.bundle
git rev-parse HEAD
```

将 bundle、最终提交号、基线提交号、简短变更说明、测试日志、candidate.json、安装候选和验收证据放入新的回传目录，生成 SHA-256 清单后复制到 T7。Git bundle 不包含未提交文件；若还留有草稿，先明确记录并额外备份，不能用旧 bundle 冒充完整回传。

## Mac 接收与合并

Mac Agent 先验证清单和 bundle，再把 Windows 分支 fetch 为一个新的 review 分支，比较共同基线之后的提交。先在独立工作目录评审并做 Mac typecheck、测试、实际工作台回归，再合并回主开发分支。若 Mac 同期也有修改，保留两边提交并处理冲突；禁止直接覆盖目录、reset/clean/stash 未知改动。

源码合并通过后，分别在 Mac 与 Windows 生成各自候选。平台验收跟随具体候选哈希，不因 Git 合并自动继承为双平台发布通过。
