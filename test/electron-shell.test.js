const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

test('Electron shell keeps the renderer sandboxed and character-neutral', () => {
  const main = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'index.html'), 'utf8');
  const combined = `${main}\n${preload}\n${renderer}\n${html}`;

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.doesNotMatch(combined, /悟空|Wukong|Doraemon|JokeBear|阿岱/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('petApi'/);
  assert.match(renderer, /contract\.atlasUrl/);
});
