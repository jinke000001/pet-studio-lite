# Pet Studio 产品边界

Pet Studio 仅支持 Petdex v1/v2 宠物包（pet.json + PNG/WebP 图集）。Shimeji Pet 是桌面 shimeji pet 目录中的独立项目；两者不共享源码、可写依赖、用户数据或构建产物。

2026-09-15 已移除经典 XML 转换、行为计划、桌面地形/窗口探测、拖拽投掷物理、对应 IPC、专属测试与旧 schema 3 验收工具。Petdex 多宠路由、缩放、原有自动游走、帧预览、配置恢复、导出快照及轻量 Windows 验收工具保留。

已导入的其他产品格式会在共享包校验入口被拒绝，不能继续预览或导出；不自动删除、改写或迁移用户项目，也不把旧转换包当普通 Petdex 包显示。历史 Windows 交付保持原文件，不能用于证明当前版本通过原生验收。

移除前源码快照、原文件及验证记录位于 `/Users/jinke00001/Desktop/shimeji pet/Archive/petstudio-compatibility-removal-20260915/`。恢复时先在独立目录解压比较，不覆盖现有工作树。
