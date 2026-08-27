const fs = require('node:fs');
const path = require('node:path');

function resolveProductProfile(projectRoot, selector = 'wukong') {
  if (typeof selector !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selector)) {
    throw new Error('product selector must use lowercase kebab-case');
  }
  const profilePath = path.join(projectRoot, 'config', 'products', `${selector}.json`);
  if (!fs.existsSync(profilePath)) throw new Error(`Unknown product: ${selector}`);
  return profilePath;
}

module.exports = { resolveProductProfile };
