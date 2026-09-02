'use strict';
// Test double for electron-builder's out/cli/cli.js entry. It parses the
// process argv through the real yargs singleton — captured by require() at
// module load time with hideBin(process.argv), exactly like the genuine CLI —
// and prints the normalized parse result as a single JSON line.
const yargs = require(process.env.BUILDER_FIXTURE_YARGS);

yargs
  .parserConfiguration({ 'camel-case-expansion': false })
  .command(['build', '*'], 'Build', (command) => command
    .option('publish', { type: 'string' })
    .option('config', { type: 'string' })
    .option('mac', { type: 'boolean' })
    .option('win', { type: 'boolean' }), (parsed) => {
    process.stdout.write(`${JSON.stringify({
      _: parsed._,
      publish: parsed.publish ?? null,
      config: parsed.config ?? null,
      mac: parsed.mac ?? null,
      win: parsed.win ?? null,
    })}\n`);
  })
  .strict()
  .help()
  .parse();
