# CLAUDE.md — Pet Studio Lite 工程上下文

> 这个文件告诉未来的会话：Pet Studio Lite 是什么、技术栈定了什么、为什么这么定。**修改技术栈前先读这个文件，并在改动后更新它。**

---

## TL;DR

- **是什么**：把 Petdex 宠物包变成 Windows 便携桌宠的"制作台" + 独立桌宠运行时。
- **形态**：制作台 = 普通桌面窗口；桌宠 = 透明、无边框、置顶的悬浮小窗口。
- **闭环**：导入 → 检查 → 预览 → 配置 → 导出 Windows x64 便携 ZIP → 解压双击 EXE。
- **技术栈**：Electron 32 + electron-vite + React 18 + TypeScript，零运行时第三方依赖。
- **完全离线**：无账号、无遥测、无网络调用、无 AI。

---

## 目录结构

```
src/
  shared/         # 纯逻辑（Node 可测，与 UI 分离）
    petpack.ts        # Petdex v1/v2 校验 + 状态映射 + 哈希
    zip.ts            # 安全 ZIP 读取（路径逃逸/符号链接/重复/膨胀防护）
    zipw.ts           # ZIP 写入（导出时并入启动说明/manifest）
    geometry.ts       # 缩放 bottom-center 锚点 + workArea 夹紧 + 右下角复位
    config.ts         # 运行时配置共享校验器
    pet-state.ts      # 桌宠持久化状态：解析/合并 + 单一内存状态串行原子写盘
    debounce.ts       # 可冲刷防抖器（关闭前 flush，不丢最终位置）
    export-registry.ts# 导出产物登记册 + "打开所在文件夹"目标校验
    projects.ts       # 版本化项目存储（导入=复制+哈希核对）
    manifest.ts       # 导出 manifest + 授权门
    ipc-validate.ts   # main 进程 IPC 入参运行时校验
  main/           # 制作台 main process
    index.ts          # 窗口 + IPC + 导入/导出编排
    export-win.ts     # Windows x64 ZIP 导出
  pet/            # 独立桌宠运行时
    main.ts           # 运行时入口（读 resources/petpack）
    host.ts           # 桌宠窗口宿主（制作台预览与运行时共用）
    menu.ts           # 右键菜单纯构建函数（游走开关/缩放/回右下角/关于/退出）
  preload/
    studio.ts         # 制作台窄桥（window.studio）
    petwin.ts         # 桌宠窗口窄桥（window.pet，预览/运行时共用）
  renderer/       # 制作台 UI（index.html）+ 桌宠页面（pet.html）
scripts/
  make-fixtures.mjs   # 生成测试宠物包
  test-*.mts          # 自动测试（npm test）
  check-export.mjs    # 静态核验导出的 ZIP
assets/fixtures/      # 合法 v1/v2 + 非法输入 fixtures
deliverables/         # 导出的 Windows 候选 ZIP
```

## 关键设计决策（含理由）

### 1. 核心逻辑全部下沉到 src/shared
- **为什么**：校验、ZIP、几何、存储、manifest、IPC 校验都不依赖 Electron，可在 Node 里直接单测（89 条断言）。
- **做法**：Electron 特有的（nativeImage 解码、窗口）通过探针/回调注入，不污染纯模块。

### 2. 桌宠窗口宿主共用（src/pet/host.ts）
- **为什么**：制作台"真实桌宠预览"和导出的独立运行时必须是同一套代码，否则预览不可信。
- **做法**：PetWindowHost 接收 options（payload 来源、持久化回调、关闭文案），预览和运行时各自注入。

### 3. 手写 ZIP 读写（不引第三方）
- **为什么**：导入的 ZIP 是不可信输入，需要精确控制安全检查（逃逸/符号链接/膨胀/重复/CRC）。第三方库（yauzl 等）反而要多审一个供应链面。
- **代价**：只支持 store/deflate（覆盖常见打包工具），够用。

### 4. 导出 = electron-builder win zip + 自写 zipw 并入说明/manifest
- **为什么**：electron-builder 负责把 Electron win32-x64 运行时和应用打包成 ZIP；启动说明和 manifest 需要顶层可读，用 zipw 重写并入。
- **注意**：必须 `--x64`（默认跟随宿主 arm64）；必须用系统 `node` 跑 cli.js（process.execPath 是 Electron 二进制，参数会乱）。
- **核验**：导出后立刻静态核验（ZIP 含 EXE、manifest、无开发机路径）；`npm run check:export` 可随时重跑。

### 5. 安全模型
- `contextIsolation: true`、`nodeIntegration: false`，preload 只暴露窄桥。
- 所有 IPC 入参在 main 做运行时校验（TS 类型不能替代）。
- 只读导入，绝不原地修改用户原始包；自由数据只写自己的 userData（`pet-studio-lite` / `pet-lite-pet`）。
- 不读不写 `~/.nom`、`~/.codex`、`~/.petdex`。

### 6. 缩放几何（src/shared/geometry.ts）
- 缩放保持窗口 bottom-center 锚点，夹紧当前显示器 workArea；100%→200% 不跳出屏幕。纯函数，有单测。

## 开发命令

```bash
npm install
npm run dev          # 制作台（开发模式，HMR）
npm test             # 全部自动测试（petpack + zip + runtime）
npm run typecheck    # tsc --noEmit
npm run build        # 构建制作台
npm run build:pet    # 构建桌宠运行时
npm run fixtures     # 重新生成测试宠物包
npm run check:export -- <zip>  # 静态核验导出产物
# 无 lint 工具（仓库未配置 ESLint/Biome）
```

## 工程原则

1. **完全离线**——任何网络调用都是 bug。
2. **renderer 不碰 Node API**，一切 IO 走 main + preload 窄桥。
3. **导入只读**，校验/复制失败不留半成品。
4. **错误用中文说清楚位置和修法**，不静默白屏。
5. **不引入大依赖**——ZIP、几何都手写，供应链面最小。
