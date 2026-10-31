import { createRouter } from '../router.js';
import * as channels from './api/channels.js';
import * as radio from './api/radio.js';
import * as epg from './api/epg.js';
import * as favorites from './api/favorites.js';
import * as history from './api/history.js';
import * as subscriptions from './api/subscriptions.js';
import * as proxy from './api/proxy.js';
import * as health from './api/health.js';
import * as sync from './api/sync.js';

const router = createRouter();

// 健康检查 / 状态
router.get('/api/health', health.status);

// 频道
router.get('/api/channels', channels.list);
router.get('/api/channels/facets', channels.facets);
router.get('/api/channels/:id', channels.detail);
router.post('/api/channels', channels.create);
router.put('/api/channels/:id', channels.update);
router.del('/api/channels/:id', channels.remove);
router.post('/api/channels/:id/play', channels.play);

// 广播
router.get('/api/radio/stations', radio.stations);
router.get('/api/radio/facets', radio.facets);

// EPG
router.get('/api/epg/:channelId', epg.programs);
router.del('/api/epg/:channelId', epg.clear);

// 收藏
router.get('/api/favorites', favorites.list);
router.post('/api/favorites', favorites.add);
router.del('/api/favorites/:channelId', favorites.remove);

// 播放历史
router.get('/api/history', history.list);
router.post('/api/history', history.add);
router.del('/api/history', history.clear);
router.del('/api/history/:channelId', history.remove);

// 订阅管理
router.get('/api/subscriptions', subscriptions.list);
router.post('/api/subscriptions', subscriptions.create);
router.put('/api/subscriptions/:id', subscriptions.update);
router.del('/api/subscriptions/:id', subscriptions.remove);
router.post('/api/subscriptions/:id/sync', subscriptions.syncOne);

// 流代理
router.get('/api/proxy', proxy.stream);

// 数据同步
router.get('/api/sync', sync.status);
router.post('/api/sync', sync.trigger);

export default router;
