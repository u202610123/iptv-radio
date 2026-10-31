// CDP 调试：打开页面 → 点击目标元素 → 回读播放器状态
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

console.log('script start');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const url = process.argv[2] || 'http://127.0.0.1:8787/#/radio';
const selector = process.argv[3] || '.station-row';

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=' + process.env.TEMP + '\\edge-cdp-debug',
  'about:blank'
], { stdio: 'ignore' });

async function waitPort() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return await res.json();
    } catch { await sleep(300); }
  }
  throw new Error('CDP 端口未就绪');
}

let ws;
try {
  const ver = await waitPort();
  console.log('browser:', ver.Browser);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('无页面 target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(5000);

  const click = await send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector('${selector}'); if (!el) return 'NO_ELEMENT'; el.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  console.log('CLICK:', click.result?.result?.value);
  await sleep(6000);

  const probe = await send('Runtime.evaluate', {
    expression: `(() => { const p = window.__panel?.player; if (!p) return 'NO_PANEL';
      const m = p.mediaElements ? p.mediaElements() : {};
      const el = m.current?.kind === 'radio' ? m.audio : m.video;
      return JSON.stringify({ name: m.current?.name, src: (m.currentUrl||'').slice(0,80), paused: el?.paused, readyState: el?.readyState, networkState: el?.networkState, errCode: el?.error?.code, muted: el?.muted, volume: el?.volume }); })()`,
    returnByValue: true, awaitPromise: true
  });
  console.log('RESULT:', probe.result?.result?.value);
} catch (err) {
  console.log('DEBUG_FAIL:', err.message);
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
}
