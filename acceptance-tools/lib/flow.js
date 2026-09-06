'use strict';

const childProcess = require('node:child_process');
const path = require('node:path');
const { cleanElectronEnv } = require('./lab');

function waitFor(predicate, { timeoutMs = 10000, intervalMs = 100, description = 'condition' } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try { const value = await predicate(); if (value) return resolve(value); } catch (error) { return reject(error); }
      if (Date.now() - started >= timeoutMs) return reject(Object.assign(new Error(`timed out waiting for ${description}`), { code: 'TIMEOUT' }));
      setTimeout(poll, intervalMs);
    }; poll();
  });
}
function launchMode(mode, config = {}) {
  const commands = config.modes || {}; const target = commands[mode]; if (!target) throw new Error(`unknown launch mode: ${mode}`);
  const child = childProcess.spawn(target.command, target.args || [], { cwd: target.cwd || config.cwd || process.cwd(), env: cleanElectronEnv({ ...process.env, ...(target.env || {}) }), windowsHide: true, stdio: 'pipe' });
  const startedAt = new Date().toISOString();
  return { mode, child, pid: child.pid, startedAt, command: target.command, args: target.args || [], stop: () => new Promise((resolve) => { if (child.exitCode !== null) return resolve(child.exitCode); child.once('exit', (code) => resolve(code)); child.kill(); }) };
}
function selectorOperation(page, selector, operation = 'click', value) {
  if (!page || typeof page.evaluate !== 'function') throw new Error('a connected CDP page is required');
  const escaped = JSON.stringify(selector); const escapedValue = JSON.stringify(value);
  const expression = operation === 'fill'
    ? `(()=>{const e=document.querySelector(${escaped});if(!e)throw new Error('selector not found: '+${escaped});e.focus();e.value=${escapedValue};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`
    : `(()=>{const e=document.querySelector(${escaped});if(!e)throw new Error('selector not found: '+${escaped});e.click();return true})()`;
  return page.evaluate(expression).then((result) => result?.result?.value ?? result);
}
function classifyWindowExit(child) { return child.exitCode === null ? 'window-exited-early' : `exitCode=${child.exitCode}`; }

module.exports = { classifyWindowExit, launchMode, selectorOperation, waitFor };
