# Phase 6.4 工作台证据（基础任务系统）

已加入持久化后台 job 控制器，支持 queued、running、succeeded、failed、cancelled、interrupted；项目重启时 queued/running 会被改记为 interrupted。支持取消、失败/取消/中断重试，重试产生新 job，不覆盖原记录。工作台任务中心轮询显示状态与进度。

验证：`npm test` 106/106、`npm run studio:typecheck`、`npm run lint`、`git diff --check` 通过。

剩余：构建/导入全面迁移到 worker、真实子进程取消、Petdex slug 离线状态、项目复制和崩溃恢复实测仍待完成。
