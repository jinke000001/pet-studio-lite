# Windows 验收工具（自包含）

`lib/` 提供 CDP、启动、selector、证据与状态机原语；`smoke.js`、`s6.js`、`run.js` 是可独立探针/运行入口，`ps/dialog-fill.ps1` 仅在 Windows 真实原生文件对话框环境执行。macOS/Linux 对 Windows 专属能力统一返回 `platform-unavailable`，不会伪造产品门通过。

每次验收必须在本地 NTFS 的唯一 run root 下运行 `node acceptance-tools/run.js create <evidence-root>`。正式 handoff 内的 `run-config.json` 已绑定 source commit、source ZIP、验收合同与 60 个必需门，机器环境指纹在创建 run 时生成；通用源码里的全空模板不能直接作为正式验收输入。证据先复制到唯一 attempt 临时目录再原子 rename，gate 重试追加 attempt 且不覆盖旧证据。暂停后的恢复必须逐项匹配完整身份并重新核验历史证据哈希。只有候选哈希、60/60 required gates、缩放恢复和进程清零同时满足时才可 finalize；finalize 最后生成覆盖状态与最终报告的 `returned-checksums.sha256`。

`G7-02-official-uninstall` 必须运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File acceptance-tools/ps/official-uninstall.ps1 -EvidenceRoot <gate-evidence-root>`。该探针只调用 HKCU 中的官方 `UninstallString`，不手工删注册表；它会等待卸载进程树结束，并要求注册表、安装目录、快捷方式和精确进程连续 3 次清零。禁止用固定 5 秒等待或手工清理冒充通过。
