// v1.1.5 加速（待发）：播放列表不缓存，分片可缓存；hls 配置封顶到播放器尺寸
import { responseCacheControl } from './src/services/proxy.js';
import { isHlsUrl } from './public/js/lib/hls.js-loader.js';
import { readFileSync } from 'node:fs';
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };
check('播放列表 no-store', responseCacheControl({ isPlaylist: true, upstreamCache: 'max-age=600' }) === 'no-store');
check('分片沿用上游缓存头', responseCacheControl({ isPlaylist: false, upstreamCache: 'max-age=600' }) === 'max-age=600');
check('分片无上游头时默认 public 1h', responseCacheControl({ isPlaylist: false, upstreamCache: null }) === 'public, max-age=3600');
const loader = readFileSync('./public/js/lib/hls.js-loader.js', 'utf-8');
check('hls 按播放器尺寸封顶', loader.includes('capLevelToPlayerSize: true'));
check('hls 关闭低延迟模式（非 LL-HLS 源）', loader.includes('lowLatencyMode: false'));
check('hls 初始带宽估计 1Mbps', loader.includes('abrEwmaDefaultEstimate: 1000000'));
check('HLS 判断未改坏（代理地址仍识别）', isHlsUrl('/api/proxy?url=https%3A%2F%2Fx%2Findex.m3u8&rewrite=1'));
if (!ok) process.exit(1);
console.log('ALL ACCELERATION TESTS PASSED');
