import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  {
    from: path.join(root, 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
    to: path.join(root, 'public', 'vendor', 'hls.min.js'),
    name: 'hls.js'
  }
];

for (const job of jobs) {
  if (!fs.existsSync(job.from)) {
    console.warn(`[sync-assets] 跳过 ${job.name}：未找到 ${job.from}（先执行 npm install）`);
    continue;
  }
  fs.mkdirSync(path.dirname(job.to), { recursive: true });
  fs.copyFileSync(job.from, job.to);
  const size = (fs.statSync(job.to).size / 1024).toFixed(1);
  console.log(`[sync-assets] ${job.name} -> ${path.relative(root, job.to)} (${size} KB)`);
}
