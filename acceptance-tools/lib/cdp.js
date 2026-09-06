'use strict';

const http = require('node:http');

class CdpError extends Error {
  constructor(message, code = 'CDP_ERROR') { super(message); this.name = 'CdpError'; this.code = code; }
}

function requestJson(host, port, pathname, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: pathname, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new CdpError(`CDP HTTP ${res.statusCode}`, 'CDP_HTTP'));
        try { resolve(JSON.parse(body)); } catch (error) { reject(new CdpError(`invalid CDP JSON: ${error.message}`, 'CDP_JSON')); }
      });
    });
    req.on('timeout', () => { req.destroy(new CdpError(`CDP request timed out after ${timeoutMs}ms`, 'CDP_TIMEOUT')); });
    req.on('error', (error) => reject(error.code === 'ECONNREFUSED' ? new CdpError(error.message, 'CDP_CONNECTION') : error));
  });
}

async function discoverTarget({ host = '127.0.0.1', port, timeoutMs = 5000 } = {}) {
  if (!Number.isInteger(port) || port <= 0) throw new CdpError('a valid CDP port is required', 'CDP_CONFIG');
  const targets = await requestJson(host, port, '/json/list', timeoutMs);
  const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
  if (!target) throw new CdpError('no CDP page target is available', 'CDP_TARGET');
  return target;
}

async function connectCdp(options = {}) {
  const target = options.target || await discoverTarget(options);
  let WebSocketImpl = globalThis.WebSocket;
  if (!WebSocketImpl) {
    try { WebSocketImpl = require('undici').WebSocket; } catch { throw new CdpError('WebSocket implementation is unavailable', 'CDP_WEBSOCKET'); }
  }
  const socket = new WebSocketImpl(target.webSocketDebuggerUrl);
  const timeoutMs = options.timeoutMs || 5000;
  let nextId = 1;
  const pending = new Map();
  const events = new Map();
  const onMessage = (raw) => {
    let message;
    try { message = JSON.parse(typeof raw === 'string' ? raw : raw.data || raw); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new CdpError(message.error.message || 'CDP command failed', 'CDP_COMMAND'));
      else resolve(message.result);
    } else if (message.method) for (const listener of events.get(message.method) || []) listener(message.params || {});
  };
  if (socket.addEventListener) socket.addEventListener('message', (event) => onMessage(event));
  else socket.onmessage = (event) => onMessage(event);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CdpError(`CDP connect timed out after ${timeoutMs}ms`, 'CDP_TIMEOUT')), timeoutMs);
    const open = () => { clearTimeout(timer); resolve(); };
    const error = (event) => { clearTimeout(timer); reject(new CdpError(event?.message || 'CDP connection failed', 'CDP_CONNECTION')); };
    if (socket.addEventListener) { socket.addEventListener('open', open); socket.addEventListener('error', error); }
    else { socket.onopen = open; socket.onerror = error; }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(new CdpError(`CDP command timed out: ${method}`, 'CDP_TIMEOUT')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { socket.send(JSON.stringify({ id, method, params })); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  return {
    target,
    command: send,
    evaluate: (expression, awaitPromise = true) => send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }),
    on(method, listener) { const list = events.get(method) || []; list.push(listener); events.set(method, list); return () => events.set(method, list.filter((entry) => entry !== listener)); },
    close() { try { socket.close(); } catch {} for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new CdpError('CDP connection closed', 'CDP_CLOSED')); } pending.clear(); },
  };
}

module.exports = { CdpError, connectCdp, discoverTarget, requestJson };
