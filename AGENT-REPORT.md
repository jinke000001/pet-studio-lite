# AGENT-REPORT — Pet Studio Lite 完整 MVP（Kimi Code 全量自主任务）

- 代理：Kimi Code CLI 0.41.0，模型 kimi-code/k3
- 基线提交：`10c7f136d942cc42ae5b2b4d1e3aa6d5994c455a`（开工前 `git status --short` 干净）
- 工作分支：`kimi/pet-studio-lite-full`
- 工作目录：`/Users/jinke00001/Desktop/pet-kimi-full-20260908-01`
- 日期：2026-09-08，环境 macOS（Apple Silicon），Node v24.14.0 / Electron 32.3.3

## 1. 实际完成内容

把 nom（一个读 AI transcript 的桌宠）整体改造成 **Pet Studio Lite** —— 一个"导入宠物包 → 检查 → 预览 → 配置 → 导出 Windows 便携 ZIP"的制作台 + 独立桌宠运行时。旧产品功能（token 监控、Claude/Codex 扫描、LLM、journal、autonomy）全部删除。

**制作台**（`src/main` + `src/renderer`）：左侧 5 步导航的单窗口工具。导入支持目录和 ZIP；检查/预览/配置/导出分步进行。

**桌宠运行时**（`src/pet`）：透明无边框置顶窗口，可拖动、单击出本地气泡、右键菜单（缩放/关于/退出），闲置游走可开关。

**核心纯逻辑**（`src/shared`，全部与 UI 分离、Node 可测）：
- `petpack.ts` — Petdex v1/v2 校验：结构、JSON、版本字段（spriteVersionNumber 优先 + version 别名 + 冲突拒绝）、图集尺寸、路径安全、授权状态、可解码性探针注入、SHA-256。
- `zip.ts` — 手写安全 ZIP 读取器：EOCD/中央目录解析、绝对路径/..逃逸/反斜杠/盘符/符号链接/特殊文件/重复目标/压缩炸弹防护、CRC 校验、白名单提取。
- `zipw.ts` — 手写 ZIP 写入器（导出时把启动说明/manifest 并入产物）。
- `geometry.ts` — 缩放 bottom-center 锚点 + workArea 夹紧。
- `config.ts` — 运行时配置共享校验器（UI/main/导出三层用同一份）。
- `projects.ts` — 版本化项目存储：导入=复制+哈希核对、损坏索引备份恢复、非法配置不入库。
- `manifest.ts` — 导出 manifest + 授权门。
- `ipc-validate.ts` — main 进程 IPC 入参运行时校验器。

## 2. 关键设计选择

1. **导出用 electron-builder 打 win x64 zip**，再把启动说明/manifest 用自写 zipw 并入 ZIP 顶层。运行时含 Electron x64，首次启动零下载。
2. **桌宠窗口宿主 `src/pet/host.ts` 被制作台预览和导出运行时共用** —— 预览到的就是用户拿到的，差异（持久化/信息弹窗/关闭文案）靠 options 注入。
3. **可解码性用探针注入**：纯校验层只解析文件头，Electron main 注入 nativeImage 真实解码探针；Node 测试注入模拟失败探针。
4. **授权门在导出函数最前面**，unknown 直接抛中文错，不产生任何文件。
5. **修复过程中发现并修掉的真实缺陷**：
   - `pet.css` flex 高度坍塌导致 sprite 被推出可视区（加 `#root{height:100%}` 修复）；
   - electron-builder 默认跟随宿主架构 arm64 → 强制 `--x64`；
   - 用 `process.execPath`（Electron 二进制）跑 cli.js 参数解析错乱 → 改用系统 node；
   - 自写 zip 校验的 64MB 单文件上限误伤合法的 186MB EXE → 拆出放宽限制 `ZIP_LIMITS_RELAXED` 供导出核用；
   - ZIP 导入的项目 slug 用了临时解压目录名 → 改用 pet.json 的稳定 id；
   - `0o100644 << 16` 位移符号位问题 → `>>> 0`；
   - NUL 字符检查 `includes('')` 恒真 → 改 `'\0'`。

## 3. 修改文件清单

删除：旧产品全部 src/main/data/*（17 个）、renderer 的 card/journal/onboarding/settings、对话模板、scripts/test-journal|tick、preload/index.ts。

新增：
- `src/shared/`：petpack, zip, zipw, geometry, config, projects, manifest, ipc-validate
- `src/main/`：index.ts（制作台）, export-win.ts（导出编排）
- `src/pet/`：main.ts（运行时）, host.ts（窗口宿主）
- `src/preload/`：studio.ts, petwin.ts
- `src/renderer/`：index.html, main.tsx, App.tsx, styles.css, pet.html, pet/{main,PetWindowApp,Sprite}.tsx, pet/lines.json, pet/pet.css
- `scripts/`：make-fixtures.mjs, test-petpack.mts, test-zip.mts, test-runtime.mts, check-export.mjs
- `assets/fixtures/`：pack-v1(authorized), pack-v2(internal-test), pack-no-license, pack-conflict, pack-decl-v1-img-v2, pack-bad-size
- `deliverables/petlite-pet-pack-v1-win-x64-20260908-210229.zip`（Windows 候选）
- `electron.vite.config.ts`（制作台）, `electron.vite.pet.config.ts`（运行时）
- `ACCEPTANCE.md`, `RUN-METRICS.json`, 重写 `README.md`/`README.zh-CN.md`

## 4. 验证命令及真实结果

| 命令 | 结果 |
|---|---|
| `npm test` | **89 通过 / 0 失败**（petpack 29 + zip 14 + runtime 46） |
| `npm run typecheck` | 通过 |
| `npm run build` + `npm run build:pet` | 通过 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| lint | 仓库无 lint 工具（如实说明，未伪造） |
| `npm run check:export -- deliverables/*.zip` | 17/17 通过 |
| macOS 实机：导入目录(v1)/ZIP(v2)/检查/台内预览/真实桌宠预览/单击气泡/拖动/右键缩放/关闭预览/配置保存/导出×3/授权门/坏包错误/独立运行时退出 | 全部通过 |
| 导出 EXE 架构 | PE machine 0x8664 = x64 确认 |

产物 SHA-256：`ff4dea95fcae68f767ee180c2c180fe4e17641ad46ac623b57d84031623f100b`

## 5. 人工观察（macOS 真实窗口，辅助功能树 + CDP 截图确认）

- 制作台 5 步流程连通，空状态/进度/成功/失败文案正常。
- 真实桌宠预览窗口：透明、置顶、可拖动、单击出中文气泡、右键缩放 100%→200% 窗口 200→400 且不出屏。
- 独立运行时（PET_PACK_DIR 注入）：位置持久化恢复、右键「退出」后进程真正消失。
- 授权门：unknown 包导出被阻止并给出中文指引；internal-test 包导出 manifest 标记 internal-test-only。
- 坏包（版本冲突）导入失败，中文说明原因，不留半成品项目。

## 6. 未验证与风险

- **Windows 实机未验证**：导出的 EXE 未在真实 Windows 上运行动态行为（透明窗口、拖动、缩放、退出）。仅做了静态核验。这是最显著的边界。
- WebP 图集只做了文件头解析（VP8X/VP8L/VP8），未在窗口中渲染真实 WebP（fixtures 均为 PNG）。
- v2 第 9–10 行上游语义未公开，映射为 extra1/extra2，可在预览播放但桌宠默认动作不用。
- 首次导出需下载 ~113MB Windows Electron 运行时，离线环境下会失败（有真实错误提示，不伪装成功）。
- 合成右键在透明窗上偶发不触发 context-menu（真实鼠标正常），验证时改为真实右键点击。

## 7. 关键外部资料

- Electron BrowserWindow 透明/置顶：https://www.electronjs.org/docs/latest/api/browser-window
- electron-builder 跨平台打包：https://www.electron.build/
- WebP RIFF 容器：https://developers.google.com/speed/webp/docs/riff_container
- PNG IHDR：http://www.libpng.org/pub/png/spec/1.2/PNG-Chunks.html
- ZIP APPNOTE（EOCD/中央目录结构）：https://pkware.cachefly.net/webdocs/APPNOTE/APPNOTE-6.3.9.TXT
- Petdex 行约定：MIT 授权的 crafter-station/petdex（https://github.com/crafter-station/petdex）
