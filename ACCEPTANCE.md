# ACCEPTANCE — Pet Studio Lite 逐项验收

对照 `FULL-TASK.md` 逐项标注 `passed` / `failed` / `not-verified`。

图例证据：`T###` = 自动测试断言（`npm test`，共 89 条）；`L##` = macOS 实机人工观察（带辅助功能树 + 截图/CDP）；`S` = 静态核验脚本输出。

## 3.1 导入

| 要求 | 结果 | 证据 |
|---|---|---|
| 中文界面，可选本地目录或 ZIP | passed | L01（导入步骤两个按钮，系统对话框选择） |
| 输入含 pet.json + PNG/WebP | passed | T（缺 pet.json/缺图集/扩展名不支持均拒绝），L02 |
| 复制到版本化工作区，不原地修改输入 | passed | T（导入后源包 SHA-256 不变；项目目录为 `<id>-<时间戳>` 版本化目录） |
| 最近项目/当前项目重启后恢复 | passed | T（新实例读同一 root 恢复当前项目），L03（重启 dev 后项目仍在） |
| 损坏状态不白屏、可重置 | passed | T（projects.json 损坏 → 备份 + 恢复空索引，不崩溃） |

## 3.2 检查

| 要求 | 结果 | 证据 |
|---|---|---|
| 支持 v1（8×9, 1536×1872） | passed | T（pack-v1 识别 v1/9 行），L02 |
| 支持 v2（8×11, 1536×2288） | passed | T（pack-v2 识别 v2/11 行），L04 |
| spriteVersionNumber 为主，兼容无冲突旧别名；冲突/不支持/尺寸不符拒绝 | passed | T（冲突、svn=3、声明v1配v2图集、别名兼容、无字段按图集，各一条断言），L05（冲突包被中文拒绝） |
| 缺文件/JSON/必要字段/可解码性/版本/尺寸/路径 | passed | T（全部有断言）；可解码性 = 注入式探针（Electron main 用 nativeImage 真实解码，Node 测试注入模拟失败） |
| ZIP 防绝对路径/../符号链接/重复/膨胀/任意覆盖；失败不留半成品 | passed | T（14 条 ZIP 断言全绿），L05（失败导入后项目数不变） |
| 中文说明错误位置与修复方向，不白屏 | passed | L05（导入失败面板含具体原因 + 「修复后可重新导入」） |

## 3.3 预览

| 要求 | 结果 | 证据 |
|---|---|---|
| 制作台内预览图集动作，可切换/播放状态 | passed | L06（台内 sprite + 待机/行走/说话/…状态按钮切换） |
| 真实透明/无边框/置顶桌宠预览窗口 | passed | L07（真实透明窗口，非网页/静态图；置顶 + 全工作区可见） |
| 预览失败制作台可见报错，可重选/返回 | passed | L05（坏包导入即报错）；预览失败路径有错误面板 |

## 3.4 配置

| 要求 | 结果 | 证据 |
|---|---|---|
| 显示名称 + 缩放 + 一个行为开关 | passed | L08（名字/缩放下拉/游走开关） |
| 输入有范围 + 即时校验；非法值不进 main 状态/导出配置 | passed | T（配置校验 7 条：超长名/越界 zoom/错误类型均拒绝）；UI 层 maxLength=24 再截断 |
| 配置重启后保持并进入导出桌宠 | passed | T（updateConfig 落盘 + 重启恢复）；S（导出 ZIP 内 config.json 含 petName=演示猫） |

## 3.5 导出

| 要求 | 结果 | 证据 |
|---|---|---|
| 选择输出位置，导出新的非覆盖 Windows x64 便携 ZIP | passed | L09（连续两次导出生成不同时间戳文件）；T（reserveOutputPath 自动加序号） |
| 解压后顶层有启动说明 + 可双击 .exe；无需 Node/Python/命令行 | passed | S（check-export 17/17：PetLitePet.exe + 启动说明.txt 顶层、说明含「不需要安装」） |
| 运行时与资源共同封装，首次启动不下载 | passed | S（resources/petpack/ 含 pet.json+图集+config.json；运行时零网络调用） |
| 连续两次导出不静默覆盖 | passed | T + L09 |
| manifest 含产品版本/宠物身份/Petdex 版本/原始包 SHA-256/图集 SHA-256/导出时间/平台架构/授权状态 | passed | S（manifest 字段全校验通过） |
| authorized 放行 / internal-test 标记 / unknown 阻止 | passed | T（授权门 3 条）；L10（unknown 包导出被阻止+中文提示）；L11（internal-test 导出 manifest.distribution=internal-test-only） |
| macOS 无法生成 Win 二进制时的诚实边界 | n/a | 本机成功生成了真实 x64 ZIP（PE machine 0x8664），未触及该边界 |

## 3.6 导出桌宠基础互动

| 要求 | 结果 | 证据 |
|---|---|---|
| 透明/无边框/置顶，透明区无矩形底色 | passed | L07（CDP 截图透明区为透明，sprite 正常） |
| 可拖动移动 | passed | L12（拖动后窗口坐标变化） |
| 单击产生动作或本地气泡，不联网 | passed | L13（单击出 talking 帧 + 本地气泡「演示猫 我在呢我在呢」） |
| 右键/托盘菜单含缩放、设置/信息、真正退出 | passed | L14（右键菜单：缩放/关于这只宠物/退出） |
| 缩放保持 bottom-center 锚点 + 夹紧 workArea；100→200% 不跳出屏幕 | passed | T（几何 5 条断言含右下角 100→200%）；L15（菜单 100%→200%，窗口 200→400 且在屏内） |
| 退出真正结束进程 | passed | L16（点「退出」后进程消失，pgrep 无残留） |

## 4. 独立产品与数据安全边界

| 要求 | 结果 | 证据 |
|---|---|---|
| 全新产品名/package name/appId/可执行文件名/userData | passed | name=pet-studio-lite、appId=com.petstudio.lite(.pet)、exe=PetLitePet.exe、userData=~/Library/Application Support/pet-studio-lite 与 pet-lite-pet |
| 不读/迁移/删 ~/.nom、~/.codex、~/.petdex；只读导入副本 | passed | T（~/.nom/state.json 测试前后哈希不变）；导入全程只读源 |
| 自有数据只写自己 userData；测试用临时目录注入（不改 HOME） | passed | T（store 测试用 mkdtemp 注入 rootDir） |
| contextIsolation:true、nodeIntegration:false、preload 窄桥 | passed | 两个 BrowserWindow 均如此；preload 只暴露 studio/pet 两个窄对象 |
| IPC 参数在 main 运行时校验 | passed | T（IPC 校验器 8 条：路径注入/枚举/越界/NaN/布尔类型均拒绝） |
| renderer 无 fs/shell/任意 IPC/Node；受控打开路径 | passed | revealExport 只放行已存在的 .zip |
| 无账号/遥测/Token/AI/语音/自动更新/开机启动/网络服务 | passed | 全代码无网络调用 |

## 5. 视觉和体验

| 要求 | 结果 | 证据 |
|---|---|---|
| 简洁克制有层级的桌面工具 | passed | L01（左步骤栏 + 内容区） |
| 主流程在一个清晰步骤结构完成 | passed | L01（5 步：导入→检查→预览→配置→导出） |
| 空状态/进行中/成功/失败/可恢复 | passed | L01（空项目）、L05（失败）、L09（成功）、T（损坏恢复） |
| 中文文案一致，无旧产品概念（token/transcript/journal/soul） | passed | 全文审查无残留 |
| 常见 macOS 尺寸下无按钮遮挡/溢出 | passed | L01（960×680 及各步骤） |

## 6. 工程与测试

| 要求 | 结果 | 证据 |
|---|---|---|
| 核心逻辑与 UI 分离可自动测试 | passed | shared/ 纯模块（petpack/zip/geometry/config/projects/manifest/ipc-validate/export） |
| 测试覆盖任务清单 | passed | 89 条断言全绿 |
| 跑真实 test/typecheck/lint/build/审计 | passed | test 89/0、typecheck 通过、build 通过、audit 0；lint=仓库无 lint 工具（如实说明） |
| 至少一个 v1 和一个 v2 fixture 跑通导入到预览 | passed | L02（v1 目录导入）、L04（v2 ZIP 导入）、L06/L07 预览 |
| macOS 实际运行制作台和桌宠，人工检查主流程 | passed | L01–L16 |
| Windows ZIP 静态检查；动态行为标未实机验收 | passed | S（17/17）；Windows 动态行为 = not-verified（见下） |

## 7. 交付物

| 要求 | 结果 |
|---|---|
| 可运行制作台源码与测试 | passed |
| 合法 v1/v2 和关键非法输入 fixtures | passed（assets/fixtures/ 6 个包） |
| 版本化 Windows x64 便携 ZIP 候选 | passed（deliverables/petlite-pet-pack-v1-win-x64-20260908-210229.zip） |
| README.md 面向非程序员 | passed |
| AGENT-REPORT.md | passed |
| RUN-METRICS.json 有效 JSON | passed |
| ACCEPTANCE.md（本文件） | passed |
| 清晰 git commit，工作区干净，不 push/不建 PR | passed |

## 验证范围边界（明确区分）

1. **macOS source-mode 已验证**：制作台 + 桌宠预览全流程（L01–L16）。
2. **macOS packaged-mode**：未做（未打 mac 安装包，任务未强制）。
3. **Windows 候选仅静态生成/检查**：ZIP 结构、EXE 架构（PE 0x8664=x64）、manifest、启动说明、无开发机绝对路径均已静态核验通过。
4. **Windows 实机仍未验证**：导出的 EXE 未在真实 Windows 机器上运行动态行为。这是当前唯一的关键未验证项。
