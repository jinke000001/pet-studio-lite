[English](./README.md) | **简体中文**

# Pet Studio Lite

一个把 Petdex 宠物包变成 **Windows 便携桌宠** 的制作台。不需要账号或任何 AI 服务；可按用户操作联网下载 Petdex 宠物，其他制作流程都在本地完成。

**闭环**：导入宠物包 → 自动检查 → 动作预览 → 配置 → 导出 Windows x64 便携 ZIP → 解压双击 EXE 运行桌宠。

---

## 这是什么

Pet Studio Lite 是一个 macOS 上的"制作台"应用。你可以导入 Petdex v1/v2 目录或 ZIP，检查、预览和配置，最后导出一个 **Windows 便携 ZIP**。

导出的桌宠 **完全独立**：不需要安装 Node.js、Python、Git，不联网，不依赖 Petdex / Codex / 任何命令行。

## 我什么都不懂，怎么用？

### 1. 启动制作台（需要 macOS）

制作台是开发/制作工具，需要 Node.js 环境运行（仅制作台需要；导出的桌宠不需要）。

```bash
npm install
npm run dev
```

会打开一个窗口，左侧是 5 个步骤：导入 → 检查 → 预览 → 配置 → 导出。跟着走就行。

### 2. 导入宠物包

直接把 Petdex 页面提供的完整命令（例如 `npx petdex@latest install boba`）粘贴到
**「从 Petdex 下载」**，下载完成后核对宠物信息并确认导入。也可以继续点
**「选择宠物包目录」** 或 **「选择 ZIP 压缩包」** 导入已有文件。

宠物包长这样：

```
我的宠物/
  pet.json          ← 宠物信息（名字、图集文件名、版本）
  spritesheet.png   ← 图集（一张 PNG 或 WebP）
```

导入会把包**复制**到制作台自己的工作区，不会动你的原始文件。如果包有问题（缺文件、尺寸不对、JSON 写错、路径不安全），会用中文告诉你哪里错了、怎么修，不会留下坏掉的半成品。

### 3. 检查

导入后自动进入检查。每一项检查都有 通过 / 失败 标记，失败会说明原因。

### 4. 预览

- 上半部分：制作台内直接播放图集的各个动作（待机/行走/说话…）。
- 点 **「打开桌宠预览」**：弹出一个**真实的透明桌宠窗口**（和最终导出的 Windows 桌宠共用运行核心）。可以拖动、单击、自动游走和调整尺寸。

### 5. 配置

- **宠物显示名称**：1–24 个字符。
- **默认缩放**：100%–300%，每次 5%；新项目默认 200%。旧项目的 50%/75% 会安全迁移为 100%。
- **允许闲置时自动游走**：开/关。

配置会保存，并随导出一起进入桌宠。不合法的输入（比如超长名字）不会被保存。

### 6. 导出

点 **「选择导出位置并导出」**，选一个文件夹。制作台会生成一个 **新的、不覆盖旧文件** 的 ZIP，名字类似：

```
petlite-pet-pack-v1-win-x64-20260908-193000.zip
```

> 首次导出需要下载一次 Windows 版 Electron 运行时（约 100MB），可能花几分钟。之后就快了。

#### 授权说明
- `license: "authorized"`（已授权）→ 正常导出分发候选。
- `license: "internal-test"`（内部测试）→ 导出但明确标记为内部测试包。
- 没有声明授权 → 可以导出，但强制标记为 `internal-test-only`，不得对外分发。

### 7. 发给 Windows 用户

把 ZIP 发给对方。对方：
1. 解压 ZIP。
2. 双击 `PetLitePet.exe`。
3. 桌宠出现在桌面上。

ZIP 里有 `启动说明.txt`（同样这份说明）和 `manifest.json`（版本、来源哈希、授权状态）。

**桌宠操作**：
- 左键拖动并松手 = 移动宠物
- 单击 = 宠物回应你一句
- 自动行为 = 闲置时等待、思考和左右游走
- 右键 = 自动游走 / 召唤分身（最多 8 只）/ 100%–300% 尺寸 / 回到屏幕右下角 / 关闭单只 / 退出全部

## 隐私

- 只有用户主动提交 Petdex 安装命令时，制作台才会启动官方 CLI 联网下载；导出的桌宠始终离线。
- 下载保留在 `~/.petdex/pets`。用户确认后，制作台只读复制宠物包到自己的目录（`~/Library/Application Support/pet-studio-lite`），不会移动或删除原包，也不读取 `~/.nom`。

## 开发者

```bash
npm install        # 安装依赖
npm run dev        # 启动制作台（开发模式，带热更新）
npm test           # 全部自动测试（包校验 + ZIP 安全 + 运行时逻辑）
npm run typecheck  # TypeScript 类型检查
npm run build      # 构建制作台
npm run build:pet  # 构建桌宠运行时
npm run smoke:electron  # 真实 Electron Petdex 单宠物烟测
npm run smoke:multi     # 真实 Electron 多宠物烟测
npm run fixtures   # 重新生成测试用宠物包
npm run check:export <zip>  # 静态核验一个导出的 ZIP
```

仓库无 lint 工具（无 ESLint/Biome），这是事实陈述。

Windows 成品验收见 `docs/acceptance/windows-light-kit.md`。

本项目仅支持 Petdex。其他产品的旧项目文件仍保留，但不能继续预览或导出；请使用对应的独立工作台。
