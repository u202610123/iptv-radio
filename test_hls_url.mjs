import { isHlsUrl } from '/home/hatch/workspace/iptv-panel/repo/public/js/lib/hls.js-loader.js';
const cases = [
  ['https://example.com/live/index.m3u8', true],
  ['https://example.com/live/index.m3u8?token=abc', true],
  ['/api/proxy?url=https%3A%2F%2Fexample.com%2Flive%2Findex.m3u8&rewrite=1', true],
  ['/api/proxy?url=https%3A%2F%2Fexample.com%2Flive%2Findex.m3u8%3Ftoken%3Dabc&rewrite=1', true],
  ['https://example.com/live/stream.mp4', false],
  ['/api/proxy?url=https%3A%2F%2Fexample.com%2Flive%2Fstream.mp3&rewrite=0', false],
  ['/api/proxy?url=https%3A%2F%2Fexample.com%2Flive%2Findex.m3u8&rewrite=0', true],
];
let ok = true;
for (const [url, want] of cases) {
  const got = isHlsUrl(url);
  console.log((got===want?'PASS ':'FAIL ')+url+' => '+got);
  if (got!==want) ok=false;
}
// 旧正则在代理 URL 上的表现，证明旧 Bug
const old = /\.m3u8(\?|$)/i.test('/api/proxy?url=https%3A%2F%2Fexample.com%2Flive%2Findex.m3u8&rewrite=1');
console.log('旧正则对代理 URL:', old, '(应为 false，证明旧逻辑误判)');
if (!ok) process.exit(1);
console.log('ALL HLS TESTS PASSED');
