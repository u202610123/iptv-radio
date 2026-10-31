// v1.1.6（待发）：代理绝不能把 .ts 分片当播放列表做文本改写
import { isHls } from './src/lib/m3u.js';
import { readFileSync } from 'node:fs';
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };
check('.ts + video/mp2t 不是播放列表', isHls('https://x/seg_1.ts', 'video/mp2t') === false);
check('.m3u8 + mpegurl 是播放列表', isHls('https://x/index.m3u8', 'application/vnd.apple.mpegurl') === true);
check('.m3u8 无 content-type 仍是播放列表', isHls('https://x/index.m3u8', '') === true);
check('.m4s 不是播放列表', isHls('https://x/seg.m4s', 'video/iso.segment') === false);
const proxy = readFileSync('./src/services/proxy.js', 'utf-8');
check('代理有分片扩展名防线', proxy.includes('isSegment') && proxy.includes('!isSegment'));
if (!ok) process.exit(1);
console.log('ALL SEGMENT TESTS PASSED');
