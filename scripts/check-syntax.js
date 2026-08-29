const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['src', 'scripts'];

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
    });
}

function checkSyntax(projectRoot = PROJECT_ROOT) {
  const files = SOURCE_ROOTS.flatMap((root) => listJavaScriptFiles(path.join(projectRoot, root)));
  for (const filePath of files) {
    const result = childProcess.spawnSync(process.execPath, ['--check', filePath], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${filePath}\n`);
      return result.status || 1;
    }
  }
  return 0;
}

if (require.main === module) process.exitCode = checkSyntax();

module.exports = { checkSyntax, listJavaScriptFiles };
