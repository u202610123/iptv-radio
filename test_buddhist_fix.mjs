// 佛教 v1.1.3（待发）：词表、华藏域名信号、地名排除、种类纠正
import { filterTopicRows } from './src/db/repositories/channels.js';
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };
const rows = [
  { id: 'h1', kind: 'radio', name: '华藏净宗弘化网净空老法师', category: 'buddhism', stream_url: 'https://vod.amtb.de/live.m3u8', extra: '{"tags":["buddhism"],"homepage":"https://www.hwadzan.tv/"}' },
  { id: 'h2', kind: 'radio', name: '华藏多元文化台', category: 'culture', stream_url: 'https://v.hwadzan.info/live.m3u8', extra: '{}' },
  { id: 'h3', kind: 'radio', name: '网络念佛堂', category: 'buddhism', stream_url: 'https://js1.hwadzan.info/live.m3u8', extra: '{}' },
  { id: 'f1', kind: 'radio', name: '佛山南海广播', category: 'music', stream_url: 'https://example.com/foshan.mp3', extra: '{}' },
  { id: 'f2', kind: 'radio', name: '佛冈电台', category: 'music', stream_url: 'https://example.com/fogang.mp3', extra: '{}' },
  { id: 'b1', kind: 'iptv', name: 'Global Buddhist Network (1080p)', category: 'Religious', stream_url: 'https://example.com/gbn.m3u8', extra: '{}' },
  { id: 'z1', kind: 'radio', name: 'Calm Radio Zen', category: 'ambient', stream_url: 'https://example.com/zen.mp3', extra: '{}' },
];
const kept = filterTopicRows(rows);
const byId = Object.fromEntries(kept.map((r) => [r.id, r]));
check('华藏净空保留', !!byId.h1);
check('华藏多元文化台保留（词表+域名）', !!byId.h2);
check('华藏视频流种类纠正为 iptv', byId.h1?.kind === 'iptv' && byId.h2?.kind === 'iptv');
check('佛山地方台排除', !byId.f1);
check('佛冈地方台排除', !byId.f2);
check('真佛教台保留', !!byId.b1);
check('Zen 弱词仍保留（词边界）', !!byId.z1);
console.log('kept:', kept.map((r) => r.id + ':' + r.kind).join(', '));
if (!ok) process.exit(1);
console.log('ALL BUDDHIST TESTS PASSED');
