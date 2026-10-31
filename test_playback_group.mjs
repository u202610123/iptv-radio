// 播放核心 v1.1.1：同名分组单测（纯函数，无 DOM）
import { groupChannels } from './public/js/lib/group.js';

const items = [
  { id: '1', kind: 'radio', name: 'CNR-1 中国之声', stream_url: 'http://a.m3u8', extra: '{"votes":4209}' },
  { id: '2', kind: 'radio', name: 'CNR-1 中国之声', stream_url: 'http://b.m3u8', extra: '{"votes":757}' },
  { id: '3', kind: 'radio', name: 'CNR-1 中国之声', stream_url: 'http://c.m3u8', extra: '{"votes":229}' },
  { id: '4', kind: 'radio', name: 'Nice Radio 永安广播电视台综合广播', stream_url: 'https://x.mp3', extra: '{"votes":21}' },
  { id: '5', kind: 'iptv', name: 'Dhamma TV (720p) [Not 24/7]', stream_url: 'https://d.m3u8' },
  { id: '6', kind: 'iptv', name: 'Dhamma TV (1080p)', stream_url: 'https://e.m3u8' },
];
const g = groupChannels(items);
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };
check('groups 3', g.length === 3);
check('CNR-1 merged x3', g[0]._sourceCount === 3);
check('CNR representative is highest votes (id 1)', g[0].id === '1');
check('CNR sources ordered by votes', g[0]._sources.map((s) => s.id).join(',') === '1,2,3');
check('Dhamma 720p/1080p merged x2', g.find((x) => x.name.includes('Dhamma'))?._sourceCount === 2);
if (!ok) process.exit(1);
console.log('ALL GROUP TESTS PASSED');
