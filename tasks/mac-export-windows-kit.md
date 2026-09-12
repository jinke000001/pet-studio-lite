# Mac 修复与轻量 Windows 验收（2026-09-12）

- [x] 阶段一：修复导出未重新校验素材、manifest 可能使用旧指纹的问题。独立快照先校验配置/完整像素解码，再核对导入哈希，打包前拒绝变化。
- [x] 回归覆盖正常副本、已修改 JSON、非法配置、截断图集、复制期间变化；npm test、typecheck、build 通过（Mac）。
- [ ] 阶段二：独立便携验收工具；复用现有素材/配置规则与原生窗口检查，生成四态摘要和 JSON。

基线：5798d35；独立分支 fix/mac-export-and-windows-kit。原 deliverables 和 Windows 候选未改动。Windows 实机结果仍待验。
