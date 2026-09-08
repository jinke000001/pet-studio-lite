# Windows 验收工具（自包含）

`lib/` 提供 CDP、启动、selector、证据与状态机原语；`smoke.js`、`s6.js`、`run.js` 是可独立探针/运行入口，`ps/dialog-fill.ps1` 仅在 Windows 真实原生文件对话框环境执行。macOS/Linux 对 Windows 专属能力统一返回 `platform-unavailable`，不会伪造产品门通过。

每次验收必须在本地 NTFS 的唯一 run root 下运行 `node acceptance-tools/run.js create <evidence-root>`。正式 handoff 内的 `run-config.json` 已绑定 source commit、source ZIP、验收合同与 60 个必需门，机器环境指纹在创建 run 时生成；通用源码里的全空模板不能直接作为正式验收输入。证据先复制到唯一 attempt 临时目录再原子 rename，gate 重试追加 attempt 且不覆盖旧证据。暂停后的恢复必须逐项匹配完整身份并重新核验历史证据哈希。只有候选哈希、60/60 required gates、缩放恢复和进程清零同时满足时才可 finalize；finalize 最后生成覆盖状态与最终报告的 `returned-checksums.sha256`。

`G7-02-official-uninstall` 必须运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File acceptance-tools/ps/official-uninstall.ps1 -EvidenceRoot <gate-evidence-root> -IdentityFile <候选身份JSON>`。候选身份（productName、卸载显示名、可执行文件名、快捷方式名）只从本轮候选 manifest 或 G7-01 安装证据取得，没有内置默认身份；注册子键按卸载显示名在 HKCU 两个视图中发现，不依赖固定 GUID。探针先经产品正常退出入口（主窗口关闭请求）关闭已安装应用并等待精确进程数为 0——失败记为独立的 lifecycle-failed，绝不用强杀冒充；然后只调用 HKCU 中的官方 `UninstallString`，不手工删注册表，等待卸载进程树结束，并要求注册表、安装目录、快捷方式和精确进程连续 3 次清零。禁止用固定 5 秒等待或手工清理冒充通过。

失败（failed/environment-blocked）的父运行永久只读，不能用普通 resume 恢复。续验使用 `node acceptance-tools/run.js continue <父RETURN目录> [evidence-root]`：工具重新核验父 `returned-checksums.sha256` 的格式、覆盖率与全部文件哈希，逐项匹配源码/合同/环境/候选身份（候选哈希由父 G5-12 候选 manifest、build-artifacts 与 G7-01 安装证据三处交叉核对得出，绝不为 null 直接继承），只把父运行中 passed、exitCode=0 且证据哈希完整的门作为 inherited 门导入新运行，并在 finalize 时再次完整核验父 RETURN。继承门保留 parentRunId、parentReturnSha256、原 attempt 与父证据哈希；验证器以 `--parent-return` 与 `--expect-parent-return-sha256` 复核父清单，并分别报告 parentReturnValid、continuationIdentityValid、inheritedGateCount、executedGateCount 与 acceptancePassed。完整性（integrityValid）与验收结论分开：失败 RETURN 只要哈希完整仍然可核验。
