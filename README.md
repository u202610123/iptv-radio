# Global IPTV & Radio Panel

部署在 **Cloudflare Workers** 上的「全球 IPTV + 全球广播（FM / AM / SW）」聚合播放面板。
服务端与前端全部模块化拆分，可单独替换数据源、存储层或播放器。

## 在线地址

- 面板首页：**https://iptv-radio-panel.u20260317.workers.dev**
- 健康检查：https://iptv-radio-panel.u20260317.workers.dev/api/health
- 手动触发同步：`POST https://iptv-radio-panel.u20260317.workers.dev/api/sync?target=all`

已部署资源：

| 资源 | 名称 / ID |
| --- | --- |
| Worker | `iptv-radio-panel`（`*.workers.dev` 子域 `u20260317`） |
| D1 数据库 | `iptv-radio-db`（binding `DB`，11 张表已建） |
| Cron | `17 */6 * * *`（每 6 小时增量同步内置源） |

## 功能

- IPTV：内置 iptv-org 全球列表，按国家 / 语言 / 分类浏览，HLS（m3u8）播放
- 广播：内置 radio-browser 全球电台，按 FM / AM / SW 波段分类，即点即听
- 自定义：粘贴 M3U / M3U8 订阅地址或文本导入，支持手动添加频道
- 检索：关键词搜索（FTS5，失败自动回退 LIKE）+ 国家 / 分类 / 波段组合筛选
- 收藏 / 最近播放 / EPG 电子节目单 / 流代理（解决 Referer 防盗链与跨域，支持 Range）
- 定时同步：Cron 增量拉取内置源，游标续跑，断批不丢进度
- 深色主题 + 移动端适配

## 目录结构

```
src/
├── index.js            Worker 入口（fetch + scheduled）
├── config.js           环境变量与常量
├── router.js           路由注册与匹配
├── handlers/api/       HTTP 层：channels / radio / epg / favorites / history / subscriptions / proxy / health
├── services/           业务层：iptv / radio / epg / importer / proxy / sync
├── db/                 schema.sql + D1 封装 + repositories（channels/favorites/history/epg/subscriptions/meta）
└── lib/                http / validate(SSRF) / m3u / xmltv / cache / log
public/                 前端 SPA（原生 ES Modules，无构建）：views / components / lib / vendor
scripts/sync-assets.mjs 复制 hls.js 到 public/vendor
```

分层依赖单向：`handlers → services → repositories → D1`，逐层可替换。

## 本地开发

```powershell
npm install
npm run d1:local                 # 本地 D1 建表
npm run dev                      # http://127.0.0.1:8787
curl "http://127.0.0.1:8787/api/health"
curl "http://127.0.0.1:8787/api/sync?target=all"   # 手动触发一次数据同步
```

## 部署

```powershell
$env:CLOUDFLARE_API_TOKEN="<token>"
$env:CLOUDFLARE_ACCOUNT_ID="3a2ef6773ead5e36187060053d5565c4"
npm run d1:remote                # 远程 D1 建表
npm run deploy                   # 部署到 *.workers.dev
```

当前线上版本即由上述命令产出，访问地址：
https://iptv-radio-panel.u20260317.workers.dev

> 本机 wrangler 的 shim 损坏，所有脚本均通过 `node ./node_modules/wrangler/bin/wrangler.js` 调用；
> 不要使用 `wrangler login`（OAuth 回调在本机不可用），一律用 API Token。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 + 同步状态 |
| GET | `/api/channels` | 频道列表（kind/country/category/band/q/page/pageSize） |
| GET | `/api/channels/facets` | 国家 / 分类 / 波段聚合 |
| GET | `/api/channels/:id` | 频道详情 |
| POST/PUT/DELETE | `/api/channels` `/api/channels/:id` | 自定义频道增删改 |
| GET | `/api/radio/stations` | 电台列表（band 过滤） |
| GET | `/api/epg/:channelId` | 节目单（当前 + 即将播出） |
| GET/POST/DELETE | `/api/favorites` `/api/favorites/:channelId` | 收藏 |
| GET/POST/DELETE | `/api/history` | 播放历史（自动裁剪 100 条） |
| GET/POST/PUT/DELETE | `/api/subscriptions` | M3U 订阅管理 |
| POST | `/api/subscriptions/:id/sync` | 立即同步某订阅 |
| GET | `/api/proxy?url=...` | 流代理 |
| POST | `/api/sync` | 手动触发内置源同步 |

## 免责声明

本项目仅做公开频道索引聚合与播放入口，不托管、不转存任何受版权保护的内容；
自定义频道由使用者自行维护并自行承担合规责任。
