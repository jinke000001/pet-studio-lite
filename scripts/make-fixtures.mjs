// 生成测试用宠物包 fixtures（程序生成的色块图集，无版权问题）。
// 运行：npm run fixtures
//
// 产出（assets/fixtures/）：
//   pack-v1              合法 v1 PNG，license=authorized
//   pack-v2              合法 v2 PNG，license=internal-test
//   pack-v1-webp         合法 v1 WebP（真实编码），license=authorized
//   pack-v2-webp         合法 v2 WebP（真实编码），license=internal-test
//   pack-no-license      合法 v1，但未声明授权（导出门应阻止）
//   pack-conflict        spriteVersionNumber=1 与 version="v2" 冲突
//   pack-decl-v1-img-v2  声明 v1 但图集是 v2（尺寸不一致）
//   pack-bad-size        图集尺寸错误（1024×1024）
//   classic-shimeji-test  无版权经典 Shimeji 目录，用于转换与 Windows 统一验收
//
// WebP fixture 用 sharp（libvips）真实编码，保证和 Petdex 真实包走同一条
// 解码路径（VP8L 无损）。

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'fixtures');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 生成测试图集：每行一种底色，帧间有一个移动白块，肉眼可辨状态切换。 */
function makeSheet(width, height, cols, rows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const fw = width / cols;
  const fh = height / rows;
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let r = 0; r < rows; r++) {
    const hue = (r * 40) % 360;
    const [cr, cg, cb] = hsl(hue, 0.65, 0.62);
    for (let y = r * fh; y < (r + 1) * fh; y++) {
      const rowStart = y * (rowBytes + 1);
      raw[rowStart] = 0;
      for (let x = 0; x < width; x++) {
        const o = rowStart + 1 + x * 4;
        const col = Math.floor(x / fw);
        const frame = col;
        // 移动白块：每帧向右下移动，验证动画切帧
        const bx = col * fw + 24 + frame * 16;
        const by = r * fh + 30 + frame * 10;
        const inBlock = x >= bx && x < bx + 26 && y >= by && y < by + 26;
        raw[o] = inBlock ? 255 : cr;
        raw[o + 1] = inBlock ? 255 : cg;
        raw[o + 2] = inBlock ? 255 : cb;
        raw[o + 3] = 255;
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const PACKS = [
  {
    dir: 'pack-v1',
    petJson: {
      id: 'demo-cat',
      displayName: '演示猫',
      description: '程序生成的 Petdex v1 测试包（非美术素材）',
      spriteVersionNumber: 1,
      license: 'authorized',
      spritesheetPath: 'spritesheet.png',
    },
    width: 1536,
    height: 1872,
  },
  {
    dir: 'pack-v2',
    petJson: {
      id: 'demo-fox',
      displayName: '演示狐',
      description: '程序生成的 Petdex v2 测试包（非美术素材）',
      spriteVersionNumber: 2,
      license: 'internal-test',
      spritesheetPath: 'spritesheet.png',
    },
    width: 1536,
    height: 2288,
  },
  {
    dir: 'pack-v1-webp',
    petJson: {
      id: 'demo-bird',
      displayName: '演示鸟',
      description: '程序生成的 Petdex v1 WebP 测试包（非美术素材）',
      spriteVersionNumber: 1,
      license: 'authorized',
      spritesheetPath: 'spritesheet.webp',
    },
    width: 1536,
    height: 1872,
    webp: true,
  },
  {
    dir: 'pack-v2-webp',
    petJson: {
      id: 'demo-fish',
      displayName: '演示鱼',
      description: '程序生成的 Petdex v2 WebP 测试包（非美术素材）',
      spriteVersionNumber: 2,
      license: 'internal-test',
      spritesheetPath: 'spritesheet.webp',
    },
    width: 1536,
    height: 2288,
    webp: true,
  },
  {
    dir: 'pack-no-license',
    petJson: {
      id: 'mystery',
      displayName: '无授权包',
      spriteVersionNumber: 1,
      spritesheetPath: 'spritesheet.png',
    },
    width: 1536,
    height: 1872,
  },
  {
    dir: 'pack-conflict',
    petJson: {
      id: 'conflict',
      displayName: '版本冲突包',
      spriteVersionNumber: 1,
      version: 'v2',
      license: 'internal-test',
      spritesheetPath: 'spritesheet.png',
    },
    width: 1536,
    height: 1872,
  },
  {
    dir: 'pack-decl-v1-img-v2',
    petJson: {
      id: 'liar',
      displayName: '声明不符包',
      spriteVersionNumber: 1,
      license: 'internal-test',
      spritesheetPath: 'spritesheet.png',
    },
    width: 1536,
    height: 2288,
  },
  {
    dir: 'pack-bad-size',
    petJson: {
      id: 'badsize',
      displayName: '尺寸错误包',
      license: 'internal-test',
      spritesheetPath: 'spritesheet.png',
    },
    width: 1024,
    height: 1024,
  },
];

fs.rmSync(OUT, { recursive: true, force: true });
const { default: sharp } = await import('sharp');
for (const p of PACKS) {
  const dir = path.join(OUT, p.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pet.json'), JSON.stringify(p.petJson, null, 2) + '\n', 'utf8');
  const png = makeSheet(p.width, p.height, 8, Math.round(p.height / 208));
  if (p.webp) {
    // 无损 WebP（VP8L），与 Petdex 真实包同一编码族
    const webp = await sharp(png).webp({ lossless: true }).toBuffer();
    fs.writeFileSync(path.join(dir, 'spritesheet.webp'), webp);
  } else {
    fs.writeFileSync(path.join(dir, 'spritesheet.png'), png);
  }
  console.log(`生成 ${p.dir}（${p.width}×${p.height}${p.webp ? ' webp' : ''}）`);
}

const classicDir = path.join(OUT, 'classic-shimeji-test');
const classicImgDir = path.join(classicDir, 'img');
const classicConfDir = path.join(classicDir, 'conf');
fs.mkdirSync(classicImgDir, { recursive: true });
fs.mkdirSync(classicConfDir, { recursive: true });

function classicFrameSvg(frame) {
  const bob = [0, -4, -1, 3, 0][frame - 1];
  const foot = [0, 4, 8, 4, 0][frame - 1];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <g transform="translate(0 ${bob})">
      <path d="M31 55 C31 27 97 27 97 55 L91 96 C88 111 76 118 64 118 C52 118 40 111 37 96 Z" fill="#ff9857" stroke="#4a2b32" stroke-width="5" stroke-linejoin="round"/>
      <path d="M39 49 C45 31 83 28 91 49" fill="none" stroke="#ffd39b" stroke-width="8" stroke-linecap="round"/>
      <circle cx="51" cy="68" r="5" fill="#25222a"/><circle cx="77" cy="68" r="5" fill="#25222a"/>
      <path d="M56 82 Q64 88 72 82" fill="none" stroke="#4a2b32" stroke-width="4" stroke-linecap="round"/>
      <path d="M44 112 q${foot} 9 17 0M84 112 q-${foot} 9 -17 0" fill="none" stroke="#4a2b32" stroke-width="6" stroke-linecap="round"/>
      <path d="M28 74 q-12 ${frame % 2 ? -8 : 8} -16 1M100 74 q12 ${frame % 2 ? 8 : -8} 16 1" fill="none" stroke="#4a2b32" stroke-width="5" stroke-linecap="round"/>
    </g>
  </svg>`);
}

for (let frame = 1; frame <= 5; frame += 1) {
  await sharp(classicFrameSvg(frame)).png().toFile(path.join(classicImgDir, `shime${frame}.png`));
}
fs.writeFileSync(path.join(classicConfDir, 'actions.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Mascot><ActionList>
  <Action Name="Stand" Type="Stay" BorderType="Floor"><Animation><Pose Image="/shime1.png" Duration="250" /></Animation></Action>
  <Action Name="Walk" Type="Move" BorderType="Floor"><Animation><Pose Image="/shime2.png" Duration="250" /><Pose Image="/shime3.png" Duration="250" /></Animation></Action>
  <Action Name="Fall" Type="Embedded"><Animation><Pose Image="/shime4.png" Duration="250" /></Animation></Action>
  <Action Name="Dragged" Type="Embedded"><Animation><Pose Image="/shime5.png" Duration="250" /></Animation></Action>
  <Action Name="Thrown" Type="Embedded"><ActionReference Name="Fall" /></Action>
  <Action Name="ChaseMouse" Type="Move"><ActionReference Name="Walk" /></Action>
</ActionList></Mascot>
`, 'utf8');
fs.writeFileSync(path.join(classicConfDir, 'behaviors.xml'), `<Mascot><BehaviorList>
  <Behavior Name="Stand" Frequency="35" />
  <Behavior Name="Walk" Frequency="65" />
  <Behavior Name="Fall" Frequency="0" />
  <Behavior Name="Dragged" Frequency="0" />
  <Behavior Name="Thrown" Frequency="0" />
  <Behavior Name="ChaseMouse" Frequency="0" />
</BehaviorList></Mascot>
`, 'utf8');
console.log('生成 classic-shimeji-test（经典目录测试宠物）');
console.log('fixtures 生成完成 →', OUT);
