// 收藏页 v1.1.4（待发）：收藏接口返回 channel_id，卡片只认 id。
// 归一化后 data-id 不为空、星标填充、点击能查到条目。
import { stationListHtml, gridHtml } from './public/js/components/channel-card.js';
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!ok) {}; if (!cond) ok = false; };
// 模拟 /api/favorites 原始返回（与线上实测一致：只有 channel_id，无 id/is_favorite）
const raw = [
  { channel_id: 'radio:1', kind: 'radio', name: '万盛融媒体中心综合广播', stream_url: 'https://example.com/a.mp3', country: 'China', category: 'information', band: 'FM' },
  { channel_id: 'iptv:2', kind: 'iptv', name: 'Test TV', stream_url: 'https://example.com/b.m3u8', country: 'China', category: 'News' },
];
const items = raw.map((c) => ({ ...c, id: c.channel_id, is_favorite: true }));
const radioHtml = stationListHtml(items.filter((c) => c.kind !== 'iptv'), null).toString();
const tvHtml = gridHtml(items.filter((c) => c.kind === 'iptv'), null).toString();
check('广播行 data-id 非空', radioHtml.includes('data-id="radio:1"'));
check('电视卡 data-id 非空', tvHtml.includes('data-id="iptv:2"'));
check('星标填充（is-on）', radioHtml.includes('is-on') && tvHtml.includes('is-on'));
check('点击查找：按 data-id 能找到条目', items.find((c) => c.id === 'radio:1')?.name === '万盛融媒体中心综合广播');
// 未归一化的旧行为对照：直接用原始条目渲染，data-id 应为空，证明 bug 根因
const oldHtml = stationListHtml(raw.filter((c) => c.kind !== 'iptv'), null).toString();
check('旧行为对照：未归一化时 data-id 为空（bug 复现）', oldHtml.includes('data-id=""'));
if (!ok) process.exit(1);
console.log('ALL FAVORITES TESTS PASSED');
