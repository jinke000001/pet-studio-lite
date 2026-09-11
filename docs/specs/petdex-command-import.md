# Spec: Petdex 命令导入

## Objective

让用户在制作台导入页粘贴完整的 Petdex 安装命令。制作台安全地下载到 Petdex 原目录，展示解析后的宠物信息与图集预览；只有用户确认后，才复制进制作台项目。

## Tech Stack

Electron main/preload/React renderer；沿用现有 `validatePetPack`、`ProjectsStore` 与 `Sprite`，不增加第三方依赖。

## Commands

- 开发：`npm run dev`
- 功能测试：`npm run test:petdex`
- 全量测试：`npm test`
- 类型检查：`npm run typecheck`
- 构建：`npm run build`

## Project Structure

- `src/main/petdex-install.ts`：命令白名单解析、固定参数进程启动、Petdex 目录定位
- `src/main/index.ts`：候选包校验、会话令牌、确认导入 IPC
- `src/preload/studio.ts` / `src/shared/types.ts`：窄桥与展示契约
- `src/renderer/App.tsx` / `styles.css`：输入、下载状态、候选确认界面
- `scripts/test-petdex.mts`：解析与进程边界回归测试

## Code Style

```ts
const slug = parsePetdexInstallCommand(rawCommand);
await spawnFixedPetdexInstall(npxExecutable, slug); // shell: false，永不执行原始文本
```

## Testing Strategy

纯逻辑测试覆盖合法命令、转义 `\@`、命令注入、额外参数和 slug 边界；用临时假可执行文件验证固定 argv。全量测试、类型检查、构建后，再检查实际 Electron 导入页。

## Boundaries

- Always：main 进程再次校验输入；`shell: false`；只读取 `~/.petdex/pets/<slug>`；确认前不创建项目；导入仍为只读复制。
- Ask first：改变支持的命令形态、下载目录或确认流程；加入新依赖。
- Never：执行用户原始命令、接受 shell 操作符/任意 npm 包/任意路径、覆盖或删除 Petdex 原包。

## Success Criteria

- 支持 `npx petdex\@latest install capvolt`、`npx petdex@latest install capvolt` 和带 `--yes` 的官方等价命令。
- 下载保留在用户的 `~/.petdex/pets`；失败时不产生制作台项目。
- 下载后展示名称、ID、版本、授权状态和精灵预览；“确认导入”后才进入检查步骤。
- 重复点击、非法输入、进程失败和包校验失败都有明确反馈。

## Open Questions

无。命令形态、保存位置和确认时机已由用户确认。
