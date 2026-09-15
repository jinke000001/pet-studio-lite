# Windows native development, 2026-09-15

Baseline: ae8bdc3e69905731d9287662b40e7ba1424668c9. Branch: windows/beta2-acceptance.

## Fixed

- Real workbench smoke stalled at candidate Image.decode while document.visibilityState was hidden. Explicitly show/focus the window and wait for visible before visual decoding. The original checks remain intact; final native regression passed 67/67. A reload experiment did not resolve the failure and was reverted. Production lifecycle and rendering code are unchanged.
- Windows packaging failed with EBUSY copying win-x64.zip. electron-builder automatically loads electron-builder.yml; extending that same file and adding extraResources again yielded three copy jobs for one destination. Use a shared options function without duplicate inherited entries. Regression exercises electron-builder's effective configuration and verifies exactly one template copy, both required files, app identity, isolated stage and disabled publishing. Old configuration returned three jobs; fixed configuration returns one. NSIS and ZIP build succeeded.

## Validation

- npm ci: exit 0, 479 packages. Existing audit output: 28 vulnerabilities; no dependency upgrade or audit fix performed.
- Local Electron postinstall returned 0 with an incomplete dist and missing path.txt. DEBUG logging stopped at the first extract-zip read stream. Repeating postinstall did not resolve it. Validated cached Electron ZIP against node_modules/electron/checksums.json and expanded it with Windows Expand-Archive; wrote the package's expected electron.exe path.txt. This is a local dependency recovery, not a proven upstream fix. Future fresh installs must verify the Electron executable exists.
- npm run verify:windows-source: exit 0, including full tests, effective builder configuration, PowerShell 5.1.26100.9444 report generation (35 ms final run), and typecheck.
- node scripts/run-studio-smoke.mjs after production build: 67/67. Real Electron/React/import/storage/previews; HTTP responses and file picker are controlled test fixtures. Does not prove live Internet download, user animation assessment or process restart.
- npm run package:win: exit 0. Internal unsigned beta.2 candidate, no publication.

## Candidate

Directory: deliverables/studio-0.2.0-beta.2-win-x64-2026-09-15T10-37-04-137Z

- ZIP SHA-256: 4acdc5a69360724f57e1fba1e16b42701b55df9b52c497bb76d312bed289832a
- NSIS SHA-256: f3406e960c42678caa5a26a613d4af7e056fbd2d543fac144599b6758b646e1b

New candidate identity is independent of the original beta.2 ZIP. No historical GUI pass transfers to this candidate. Runtime sources and locked dependencies are unchanged; packaging and test tooling changed.

## Outstanding

Native candidate GUI matrix, installation/uninstallation/reinstallation, actual offline export, 125/150% dynamic DPI, multiple displays, long use and user subjective checks remain incomplete. System DPI read 96 / 100%. Do not use this report as release approval. Windows file-picker automation showed stale element/focus errors; these are not evidence of an application import failure.

Evidence is stored beside the clone in RETURN-development-20260915-182948 and under the candidate's RETURN-studio-20260915-183838-fb3519. Failed runs remain preserved. Mac regression and synchronization are pending.
