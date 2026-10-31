import { list, count, upsertMany } from './src/db/repositories/channels.js';
import { replaceForChannel } from './src/db/repositories/epg.js';

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!cond) failures += 1;
}

const topicRows = [
  { id: 'r1', kind: 'radio', name: 'Chant With Namasphere 108', category: 'mantra', stream_url: 'http://a/1' },
  { id: 'r2', kind: 'radio', name: 'Chant With Namasphere 108', category: 'mantra', stream_url: 'http://a/2' },
  { id: 'r3', kind: 'radio', name: 'Chante France', category: 'chanson', stream_url: 'http://a/3' },
  { id: 'r4', kind: 'radio', name: 'Concertzender Geen dag zonder Bach', category: 'classical', stream_url: 'http://a/4' },
  { id: 'r5', kind: 'radio', name: 'Chérie FM Zen', category: 'zen', stream_url: 'http://a/5' },
  { id: 't1', kind: 'iptv', name: 'Citizen TV', category: 'News', stream_url: 'http://a/6' },
  { id: 't2', kind: 'iptv', name: 'Plzen TV', category: 'Undefined', stream_url: 'http://a/7' },
  { id: 't3', kind: 'iptv', name: 'Global Buddhist Network (1080p)', category: 'Culture', stream_url: 'http://a/8' },
  { id: 't4', kind: 'iptv', name: 'Dhamma TV (720p)', category: 'Culture', stream_url: 'http://a/9' },
  { id: 't5', kind: 'iptv', name: 'Global Buddhist Network (720p)', category: 'Culture', stream_url: 'http://a/10' },
];

function makeEnv({ topic = topicRows, existingChannels = [], existingEpg = [] } = {}) {
  const batches = [];
  const runs = [];
  const db = {
    batches,
    runs,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async all() {
              if (sql.includes('SELECT * FROM channels')) return { results: topic };
              if (sql.includes('SELECT id, name, stream_url')) {
                return { results: existingChannels.filter((r) => params.includes(r.id)) };
              }
              if (sql.includes('SELECT title, description')) return { results: existingEpg };
              return { results: [] };
            },
            async run() { runs.push({ sql, params }); return {}; },
            async first() { return null; },
          };
        },
      };
    },
    async batch(prepared) { batches.push(prepared); return {}; },
  };
  return { DB: db, batches, runs };
}

// 1. 佛教专题：去重 + 排除子串误伤
{
  const env = makeEnv();
  const items = await list(env, { topic: 'buddhist', page: 1, pageSize: 60, sort: 'name' });
  const names = items.map((r) => r.name);
  check('topic keeps 4 unique rows', items.length === 4, `got ${items.length}: ${names.join(' | ')}`);
  check('topic excludes Chante France', !names.includes('Chante France'));
  check('topic excludes Citizen TV', !names.includes('Citizen TV'));
  check('topic excludes Plzen TV', !names.includes('Plzen TV'));
  check('topic excludes Concertzender', !names.some((n) => n.includes('Concertzender')));
  check('topic keeps Chérie FM Zen', names.includes('Chérie FM Zen'));
  const total = await count(env, { topic: 'buddhist' });
  check('topic count matches deduped list', total === 4, `got ${total}`);
}

// 2. upsertMany：无变化不写
{
  const existing = [{
    id: 'iptv:US:aaa', name: 'Same Channel', stream_url: 'http://x/1', logo_url: null,
    country: 'United States', country_code: 'US', language: null, category: 'News', band: null,
    source: 'iptv-org', subscription_id: null, extra: '{"tvgId":null}',
  }];
  const env = makeEnv({ existingChannels: existing });
  const res = await upsertMany(env, [
    { id: 'iptv:US:aaa', kind: 'iptv', name: 'Same Channel', stream_url: 'http://x/1', country: 'United States', country_code: 'US', category: 'News', source: 'iptv-org', extra: { tvgId: null } },
    { id: 'iptv:US:bbb', kind: 'iptv', name: 'Changed Channel', stream_url: 'http://x/2', country: 'United States', country_code: 'US', category: 'News', source: 'iptv-org', extra: {} },
    { id: 'iptv:US:ccc', kind: 'iptv', name: 'New Channel', stream_url: 'http://x/3', country: 'United States', country_code: 'US', category: 'News', source: 'iptv-org', extra: {} },
  ]);
  const written = env.batches.flat().length;
  check('upsert skips unchanged row', written === 2 && res.skippedUnchanged === 1, `written=${written} skipped=${res.skippedUnchanged}`);
}

// 3. EPG：无变化不写
{
  const progs = [{ title: 'Morning Chant', description: null, start_ts: 1000, stop_ts: 2000 }];
  const envSame = makeEnv({ existingEpg: [{ title: 'Morning Chant', description: null, start_ts: 1000, stop_ts: 2000 }] });
  const r1 = await replaceForChannel(envSame, 'ch1', progs);
  check('epg skips identical programs', r1.skippedUnchanged === true && envSame.runs.length === 0, `runs=${envSame.runs.length}`);
  const envDiff = makeEnv({ existingEpg: [{ title: 'Other', description: null, start_ts: 1000, stop_ts: 2000 }] });
  await replaceForChannel(envDiff, 'ch1', progs);
  check('epg rewrites when changed', envDiff.runs.length >= 1 && envDiff.batches.length >= 1);
}

console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
