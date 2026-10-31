# 优化记录（v1.1.0）

## 已改动（本地，测试通过）

### 性能：D1 写入
- `src/db/repositories/channels.js`：`upsertMany` 先按 id 批量读回现有行，只写新增或字段有变化的行；无变化时跳过。读的额度（免费 500 万行/天）远比写（10 万行/天）宽松。
- `src/db/repositories/epg.js`：`replaceForChannel` 先比对现有节目（标题/描述/起止时间），完全一致时跳过先删后插。
- `src/config.js` + `wrangler.jsonc`：同步量从每轮 24 国 + 10 页电台，降到 8 国 + 4 页电台；EPG 缓存从 6 小时延长到 12 小时。注意：只改代码默认值不够，`wrangler.jsonc` 里的变量会覆盖默认值，所以两处同步改了。
- `src/router.js`：服务端错误不再把原始错误透传给前端，页面上不再直接露出 `D1_ERROR` 原文；原始错误仍由服务端日志记录。

### 佛教专题：筛选与去重
- `src/db/repositories/channels.js`：专题查询先用 SQL 宽匹配取候选，再在内存里打分、去重、分页，总数与列表保持一致。
- 强词（buddha / dharma / 佛 / 佛教 / 念佛等）命中即保留；弱词（zen / chant / lotus / temple / mantra 等）必须按词边界命中才保留，子串命中（如 Citizen、Plzen、Concertzender、Chante）直接排除。
- 同 kind、同归一化名（去掉清晰度、[Geo-blocked] 等后缀）只保留第一条。

### 界面：配色不变
- `public/css/components.css`：筛选标签从纵向堆叠改成单行横向滚动，不再是一堵墙，标签和颜色不变。
- `public/js/components/channel-card.js`：字面量 `Undefined` 分类直接隐藏，不再占一个标签位。
- `public/js/views/buddhist.js`：顶栏全局搜索原来在佛教页无效，现在接到本页搜索；“加载更多”原来会把上一页替换掉，现在是追加累积。

## 验证
- `node test_optimizations.mjs`：10 项全过（专题去重与排除、计数一致、无变化不写、EPG 无变化跳过与有变化重写）。
- 前端改动文件通过 `node --check` 语法检查。
- 本版本只推送到 GitHub，Worker 线上部署待单独确认后进行。

## 尚未动的高风险项（需用户单独决定）
- 流代理分片直连 + 失败回代理：能省大量 Worker 请求，但部分源会因跨域/地域/防盗链失败，需实测播放后才能定。
- 前端打包压缩：现在是 20 多个模块文件分开加载，主要是首屏慢，不是烧 D1；改动涉及构建流程，单独做更稳妥。
