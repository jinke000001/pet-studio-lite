# Windows 验收工具（自包含）

`lib/` 提供 CDP、启动、selector、证据与状态机原语；`smoke.js`、`s6.js`、`run.js` 是可独立探针/运行入口，`ps/dialog-fill.ps1` 仅在 Windows 真实原生文件对话框环境执行。macOS/Linux 对 Windows 专属能力统一返回 `platform-unavailable`，不会伪造产品门通过。

每次验收必须在本地 NTFS 的唯一 run root 下运行 `node acceptance-tools/run.js create <evidence-root>`。证据通过临时文件后原子 rename，gate 重试追加 attempt，不覆盖旧证据。暂停需记录原因与下一步；只有候选哈希、60/60 required gates、缩放恢复和进程清零同时满足时才可 finalize。
