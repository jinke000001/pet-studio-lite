#!/usr/bin/env node

const path = require('node:path');

const { importPetDirectory } = require('../src/import/directory-importer');
const { downloadPetdexSlug } = require('../src/import/petdex-adapter');
const { importPetZip } = require('../src/import/zip-importer');

const USAGE = `Usage:
  npm run import-pet -- directory --source <path> --identity <id> [--output <path>] [--authorization <status>]
  npm run import-pet -- zip --source <path> --identity <id> [--output <path>] [--authorization <status>]
  npm run import-pet -- slug --slug <petdex-slug> [--output <path>] [--authorization <status>]

Authorization status: unknown | internal-test | authorized`;

function parseArguments(argv) {
  const command = argv[0];
  if (!['directory', 'zip', 'slug'].includes(command)) throw new Error(`Unknown or missing command\n${USAGE}`);
  const commonFlags = new Set(['output', 'authorization']);
  const allowedFlags = command === 'slug'
    ? new Set([...commonFlags, 'slug'])
    : new Set([...commonFlags, 'source', 'identity']);
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--')) throw new Error(`Unknown argument: ${flag}`);
    const key = flag.slice(2);
    if (!allowedFlags.has(key)) throw new Error(`Unknown argument: --${key}`);
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag || 'argument'}\n${USAGE}`);
    }
    if (values[key] !== undefined) throw new Error(`Duplicate argument: ${flag}`);
    values[key] = value;
  }
  if (command === 'slug') {
    if (!values.slug) throw new Error(`--slug is required\n${USAGE}`);
    return {
      command,
      slug: values.slug,
      output: values.output,
      authorization: values.authorization || 'internal-test',
    };
  }
  if (!values.source) throw new Error(`--source is required\n${USAGE}`);
  if (!values.identity) throw new Error(`--identity is required\n${USAGE}`);
  return {
    command,
    source: values.source,
    identity: values.identity,
    output: values.output,
    authorization: values.authorization || 'unknown',
  };
}

async function run(argv) {
  const args = parseArguments(argv);
  const projectRoot = path.resolve(__dirname, '..');
  const outputRoot = path.resolve(args.output || path.join(projectRoot, 'imports'));
  let result;
  if (args.command === 'directory') {
    result = importPetDirectory({
      sourceDirectory: path.resolve(args.source),
      outputRoot,
      sourceIdentity: args.identity,
      authorizationStatus: args.authorization,
    });
  } else if (args.command === 'zip') {
    result = await importPetZip({
      zipPath: path.resolve(args.source),
      outputRoot,
      sourceIdentity: args.identity,
      authorizationStatus: args.authorization,
    });
  } else {
    result = await downloadPetdexSlug({
      slug: args.slug,
      outputRoot,
      authorizationStatus: args.authorization,
    });
  }
  return {
    status: result.alreadyImported ? 'already-imported' : 'imported',
    importDirectory: result.importDirectory,
    reportPath: result.reportPath,
    humanReportPath: result.humanReportPath,
    contactSheetPath: result.contactSheetPath,
    actionPreviewPath: result.actionPreviewPath,
  };
}

if (require.main === module) {
  run(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    const code = typeof error.code === 'string' ? error.code : 'INVALID_ARGUMENT';
    process.stderr.write(`IMPORT_ERROR ${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { USAGE, parseArguments, run };
