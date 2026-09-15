# Petdex 工作台保护边界

- 本目录是现有 Petdex 产品工作台，保留名称 `pet-studio-lite`、appId `com.petstudio.lite` 和原 userData/studio-data。
- Shimeji 独立产品任务请转到 `/Users/jinke00001/Desktop/shimeji pet/Development/shimeji-workbench`；不得在本目录安装新产品依赖、改写启动入口、共享可写目录或混入新运行器。
- 本产品仅支持 Petdex v1/v2，已移除其他产品的导入转换、专属运行时和测试；不得重新引入跨产品兼容依赖。已有其他产品项目仅保留原文件，不默认迁移或删除。
- 保留已有未提交修改、源包和 deliverables；禁止 reset/clean/stash 或覆盖历史候选。
- 修改 Petdex 时执行对应测试、构建和真实工作台回归；Windows 实机验收单独记录。
