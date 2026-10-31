// v1.1.7 省资源（待发）：订阅差量删除、统计不每次全扫、同步 12h、额度友好提示
import { idsBySubscription, removeByIds } from './src/db/repositories/channels.js';
import { readFileSync } from 'node:fs';
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };
// mock D1: all() returns rows, run() records
function mockDb(rows) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { calls.push({ op: 'all', sql, params }); return { results: rows }; },
            async run() { calls.push({ op: 'run', sql, params }); return {}; },
            async first() { return null; },
          };
        },
      };
    },
  };
}
const env = { DB: mockDb([{ id: 'sub:x:1' }, { id: 'sub:x:2' }, { id: 'sub:x:3' }]) };
const ids = await idsBySubscription(env, 'x');
check('订阅旧 id 只读 id 列', ids.join(',') === 'sub:x:1,sub:x:2,sub:x:3');
// 差量删除：新列表只有 1 和 3，消失的 2 应被删，且只删 2
const env2 = { DB: mockDb([]) };
const gone = ['sub:x:1', 'sub:x:2', 'sub:x:3'].filter((id) => !new Set(['sub:x:1', 'sub:x:3']).has(id));
await removeByIds(env2, gone);
const deletes = env2.DB.calls.filter((c) => c.sql.startsWith('DELETE FROM channels'));
check('差量删除只删消失的台', deletes.length === 1 && deletes[0].params[0] === 'sub:x:2');
const sync = readFileSync('./src/services/sync.js', 'utf-8');
check('同步结束不再无条件刷分面', !sync.includes("refreshFacets(env, 'iptv')") && !sync.includes("refreshFacets(env, 'radio')"));
check('计数 24h 才重算', sync.includes('24 * 60 * 60 * 1000'));
const wrangler = readFileSync('./wrangler.jsonc', 'utf-8');
check('定时同步改为 12 小时一次', wrangler.includes('"17 */12 * * *"') && !wrangler.includes('*/6'));
const stats = readFileSync('./src/services/stats.js', 'utf-8');
check('分面缓存改为 24 小时', stats.includes('24 * 60 * 60 * 1000'));
const router = readFileSync('./src/router.js', 'utf-8');
check('额度错误有友好提示', router.includes('QUOTA_EXCEEDED') && router.includes('明早 8 点'));
const importer = readFileSync('./src/services/importer.js', 'utf-8');
check('订阅同步不再全删全插', !importer.includes('removeBySubscription(env, id)') && importer.includes('removeByIds'));
if (!ok) process.exit(1);
console.log('ALL RESOURCE TESTS PASSED');
