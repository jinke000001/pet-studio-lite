#!/usr/bin/env node
'use strict';
const { platformResult } = require('./lib/lab');
const result = process.platform === 'win32' ? { status: 'ready', mode: process.argv[2] || 'source' } : platformResult('s6-acceptance', { mode: process.argv[2] || 'source' });
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status === 'platform-unavailable') process.exitCode = 2;
