**English** | [简体中文使用教程](./README.zh-CN.md)

# Pet Studio Lite

## New here? Start with installation

**[Step-by-step beginner guide (Chinese): download, install and create your first pet](./docs/guides/从下载到第一只桌宠.md)**

**The trial is available. Download an installer:**

- **[Windows 11 x64 installer (EXE)](https://github.com/jinke000001/pet-studio-lite/releases/download/v0.2.0-beta.2-trial.1/PetStudio-Lite-0.2.0-beta.2-Windows-x64-Setup.exe)**
- **[Mac Apple Silicon installer (DMG)](https://github.com/jinke000001/pet-studio-lite/releases/download/v0.2.0-beta.2-trial.1/PetStudio-Lite-0.2.0-beta.2-Mac-arm64.dmg)**
- [Release notes and checksums](https://github.com/jinke000001/pet-studio-lite/releases/tag/v0.2.0-beta.2-trial.1)

A desktop workbench for **Windows 11 x64 and macOS** that turns Petdex v1/v2 packs into standalone **Windows x64 desktop pets**.

Import → validate → preview → configure → export a ZIP → extract and run `PetLitePet.exe` on Windows.

## Use the packaged workbench

**No Node.js, Python, npm, Git, AI service or Mac is required to use the Windows workbench.**

| Computer | Trial package | Start |
| --- | --- | --- |
| Windows 11 x64 | Windows `.exe` installer | Copy to your computer, install, then launch from the desktop or Start menu |
| Apple Silicon Mac | Mac `.dmg` | Copy to your computer, open, drag the app into Applications and launch |

Download the trial installers using the links above. GitHub **Code → Download ZIP contains source code, not an installer**. T7 is only used to transfer the installer; it is not needed after installation. The current Mac trial is for Apple Silicon, not Intel, and is not Developer ID signed or notarized.

## Quick tutorial

1. **Import:** paste a Petdex command such as `npx petdex@latest install boba` into the workbench's Petdex download field. The app reads the pet identifier; it does not execute npx. Review the candidate before confirming. You can also import a local folder or ZIP containing `pet.json` and a PNG/WebP spritesheet.
2. **Check:** review file, format, dimensions and safety checks. Imported files are copied into the app's workspace; originals are preserved.
3. **Preview:** inspect actions, pause, step through frames, change preview speed and facing, or open a real transparent desktop preview. Preview inspection settings do not change exported animation data.
4. **Configure:** save a display name, size and automatic wandering preference. Save or discard pending edits before exporting.
5. **Export:** choose a destination. The workbench creates a new Windows x64 ZIP without overwriting earlier exports. The packaged app includes its runtime template, so export requires no runtime download or external build tools.
6. **Run on Windows:** extract the entire ZIP, then launch `PetLitePet.exe`. Keep the extracted files together. The exported pet runs offline. Both workbench platforms currently export Windows pets; the EXE does not run on macOS.

Drag to move, click for a response, or right-click for wandering, clones, size, repositioning and exit controls.

For detailed instructions, see the [Chinese tutorial](./README.zh-CN.md).

## Data, network and artwork

- Online Petdex imports contact official manifest and asset endpoints. Existing local packs can be processed and exported locally.
- Projects are stored in the current computer's application user data; GitHub and T7 do not automatically sync them.
- Format validation does not guarantee artwork quality. If fragments appear in a paused frame, compare it with the source spritesheet before attributing the issue to animation rendering.
- Respect source artwork rights. Unknown or internal-test licensing produces an `internal-test-only` export; an export label does not grant distribution rights.

## Current trial status

Version: **0.2.0-beta.2**. Mac source workflow regression passed 71/71 checks; packaged-app regression passed 14/14, including import, preview, export and restart persistence. Windows installation, uninstall, reinstall and user experience evidence is available. Full multi-display, upgrade, DPI, disconnected-network and long-running acceptance remains incomplete. This is a public preview, not a fully accepted stable release.

## Develop from source

Requires **Node.js >=22.18.0**. Run in the repository root. Initial runtime template preparation may require network access.

```bash
npm ci
npm run dev
npm test
npm run test:studio-builder-config
npm run typecheck
npm run build
npm run smoke:studio
npm run check:export -- <exported.zip>
```

Build a versioned candidate:

```bash
npm run package:mac      # On macOS: DMG for the host architecture
npm run package:win      # On Windows: NSIS installer and ZIP
npm run package:win:zip  # Windows ZIP without building an NSIS installer
```

Candidates are created in new directories under `deliverables/`. Windows installer builds must run on Windows; macOS builds must run on macOS. Do not copy `node_modules` across platforms.

Only Petdex v1/v2 is supported. Historical reports under `docs/` describe their original candidate and date; they are not current usage instructions or proof for a different binary.
