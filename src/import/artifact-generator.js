const fs = require('node:fs');
const path = require('node:path');

const ROW_LABELS = Object.freeze([
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
  'look 000–157.5',
  'look 180–337.5',
]);

function escapeMarkup(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMarkdown(value) {
  return String(value)
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('`', '\\`');
}

function createContactSheet(pet) {
  const scale = 0.5;
  const frameWidth = pet.grid.cellWidth * scale;
  const frameHeight = pet.grid.cellHeight * scale;
  const labelWidth = 130;
  const headerHeight = 34;
  const width = labelWidth + pet.grid.columns * frameWidth;
  const height = headerHeight + pet.grid.rows * frameHeight;
  const frames = [];
  for (let row = 0; row < pet.grid.rows; row += 1) {
    for (let column = 0; column < pet.grid.columns; column += 1) {
      frames.push(`  <svg class="frame" x="${labelWidth + column * frameWidth}" y="${headerHeight + row * frameHeight}" width="${frameWidth}" height="${frameHeight}" viewBox="0 0 ${pet.grid.cellWidth} ${pet.grid.cellHeight}"><image href="../package/${escapeMarkup(pet.spritesheetPath)}" x="-${column * pet.grid.cellWidth}" y="-${row * pet.grid.cellHeight}" width="${pet.grid.cellWidth * pet.grid.columns}" height="${pet.grid.cellHeight * pet.grid.rows}"/></svg>`);
    }
  }
  const labels = Array.from({ length: pet.grid.rows }, (_, row) => (
    `  <text x="8" y="${headerHeight + row * frameHeight + 18}" class="label">${escapeMarkup(ROW_LABELS[row])}</text>`
  ));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#f4f4f4"/><rect width="8" height="8" fill="#dedede"/><rect x="8" y="8" width="8" height="8" fill="#dedede"/></pattern></defs>
  <rect width="${width}" height="${height}" fill="#202124"/>
  <text x="8" y="23" fill="#fff" font-family="sans-serif" font-size="15">${escapeMarkup(pet.displayName)} · v${pet.spriteVersionNumber} · ${pet.grid.columns}×${pet.grid.rows}</text>
  <g fill="url(#checker)">${Array.from({ length: pet.grid.rows }, (_, row) => `<rect x="${labelWidth}" y="${headerHeight + row * frameHeight}" width="${pet.grid.columns * frameWidth}" height="${frameHeight}"/>`).join('')}</g>
  <g font-family="sans-serif" font-size="12" fill="#fff">${labels.join('\n')}</g>
${frames.join('\n')}
</svg>
`;
}

function createActionPreview(pet) {
  const cards = Object.entries(pet.states).map(([name, state]) => (
    `<section><h2>${escapeMarkup(name)}</h2><div class="action" data-row="${state.row}" data-frames="${state.frames}" aria-label="${escapeMarkup(name)} animation"></div></section>`
  )).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><link rel="icon" href="data:,"><title>${escapeMarkup(pet.displayName)} 动作预览</title>
<style>body{margin:0;padding:24px;background:#17181a;color:#f5f5f5;font:14px system-ui,sans-serif}header{margin-bottom:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px}section{background:#25272a;border:1px solid #3b3e42;border-radius:10px;padding:12px}h1,h2{margin:0 0 10px}h2{font-size:14px}.action{width:96px;height:104px;margin:auto;background-image:url('../package/${escapeMarkup(pet.spritesheetPath)}');background-size:${pet.grid.columns * 96}px ${pet.grid.rows * 104}px;image-rendering:pixelated}</style></head>
<body><header><h1>${escapeMarkup(pet.displayName)}</h1><p>Petdex v${pet.spriteVersionNumber} · ${pet.capabilities.lookDirections ? '支持 16 个注视方向' : 'v1 使用 idle 注视回退'} · 离线预览</p></header><main>${cards}</main>
<script>'use strict';const items=[...document.querySelectorAll('.action')];let previous=performance.now();let frame=0;function draw(now){if(now-previous>=125){frame+=1;previous=now;for(const item of items){const row=Number(item.dataset.row);const frames=Number(item.dataset.frames);item.style.backgroundPosition=(-96*(frame%frames))+'px '+(-104*row)+'px';}}requestAnimationFrame(draw);}requestAnimationFrame(draw);</script></body></html>
`;
}

function createHumanReport(report) {
  return `# Pet Import Report

- Pet: ${escapeMarkdown(report.pet.displayName)} (\`${escapeMarkdown(report.pet.id)}\`)
- Sprite version: v${report.pet.spriteVersionNumber}
- Source: ${report.source.type} / \`${report.source.identity}\`
- Authorization: ${report.authorizationStatus}
- Imported at: ${report.importedAt}
- Source digest: \`${report.sourceDigest}\`
- Original SHA-256: ${report.source.originalSha256 ? `\`${report.source.originalSha256}\`` : 'recorded per file below'}
- Grid: ${report.pet.grid.columns} × ${report.pet.grid.rows}, ${report.pet.grid.cellWidth} × ${report.pet.grid.cellHeight} per frame
- Look directions: ${report.pet.capabilities.lookDirections ? '16' : 'not available; runtime falls back to idle'}

## Files

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
${report.files.map((file) => `| ${escapeMarkdown(file.path)} | ${file.bytes} | \`${file.sha256}\` |`).join('\n')}

## Visual evidence

- Static contact sheet: \`preview/contact-sheet.svg\`
- Animated actions: \`preview/actions.html\`
`;
}

function writeImportArtifacts(importDirectory, report) {
  const previewDirectory = path.join(importDirectory, 'preview');
  fs.mkdirSync(previewDirectory);
  fs.writeFileSync(path.join(importDirectory, 'import-report.md'), createHumanReport(report), { flag: 'wx' });
  fs.writeFileSync(path.join(previewDirectory, 'contact-sheet.svg'), createContactSheet(report.pet), { flag: 'wx' });
  fs.writeFileSync(path.join(previewDirectory, 'actions.html'), createActionPreview(report.pet), { flag: 'wx' });
}

module.exports = { createActionPreview, createContactSheet, createHumanReport, writeImportArtifacts };
