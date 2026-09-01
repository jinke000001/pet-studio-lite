const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
}

test('workbench uses a separate sandboxed Electron entry with narrow IPC', () => {
  const main = read('src/workbench/main.js');
  const preload = read('src/workbench/preload.js');

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /workbench:get-bootstrap/);
  assert.match(main, /workbench:create-project/);
  assert.match(main, /workbench:open-project/);
  assert.match(main, /workbench:select-import/);
  assert.match(main, /workbench:get-import-preview/);
  assert.match(main, /workbench:start-pet-preview/);
  assert.match(main, /workbench:stop-pet-preview/);
  assert.match(main, /assertTrustedSender/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('workbenchApi'/);
  assert.doesNotMatch(preload, /invoke:\s*\(/);
  assert.doesNotMatch(preload, /send:\s*\(/);
  assert.doesNotMatch(preload, /path|filePath|sourcePath/);
});

test('workbench renderer declares a strict CSP and accessible project form', () => {
  const html = read('src/workbench/renderer/index.html');
  const app = read('src/workbench/renderer/App.tsx');

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self'/);
  assert.match(app, /<main/);
  assert.match(app, /<label htmlFor="project-name"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /action-error/);
  assert.match(app, /fatalError/);
  assert.match(app, /setIsCreating\(true\)/);
  assert.doesNotMatch(app, /dangerouslySetInnerHTML/);
});

test('package exposes workbench build, typecheck, and launch commands', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts.studio, /studio:build/);
  assert.ok(packageJson.scripts['studio:build']);
  assert.ok(packageJson.scripts['studio:typecheck']);
  assert.equal(packageJson.main, 'src/main.js');
});
