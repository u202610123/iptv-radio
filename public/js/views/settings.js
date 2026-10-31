import { html, raw, $, on, icon, fromNow } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { toastSuccess, toastError } from '../components/toast.js';
import { emptyState } from '../components/channel-card.js';

const state = { container: null, status: null, subs: [] };

export default {
  id: 'settings',
  title: '设置与订阅',

  async render(container) {
    state.container = container;
    container.innerHTML = html`
      <section class="section glass">
        <div class="page-head">
          <div class="page-head__title"><h1>设置与订阅</h1></div>
          <div class="page-head__meta"><span>数据源、订阅与偏好设置</span></div>
        </div>
        <div class="stat-grid" style="margin-top:16px" id="stat-grid">
          <div class="skeleton" style="height:78px"></div>
          <div class="skeleton" style="height:78px"></div>
          <div class="skeleton" style="height:78px"></div>
        </div>
        <div class="filter-row" style="margin-top:16px">
          <button class="btn btn--primary" data-action="sync" data-target="all">${raw(icon('refresh', 14))} 同步全部</button>
          <button class="btn" data-action="sync" data-target="iptv">同步 IPTV</button>
          <button class="btn" data-action="sync" data-target="radio">同步广播</button>
          <button class="btn" data-action="sync" data-target="subscriptions">同步订阅</button>
          <span class="muted" id="sync-hint"></span>
        </div>
      </section>

      <section class="section glass" style="margin-top:16px">
        <div class="section__head"><h2>M3U 订阅</h2><span class="muted">支持远程地址或粘贴文本</span></div>
        <div class="field">
          <label class="field__label" for="sub-name">订阅名称</label>
          <input id="sub-name" placeholder="例如：我的直播源" />
        </div>
        <div class="field">
          <label class="field__label" for="sub-url">订阅地址（M3U / M3U8）</label>
          <input id="sub-url" placeholder="https://example.com/list.m3u" />
          <span class="field__hint">服务端会抓取并解析，频道写入 D1；同源重复频道自动覆盖更新。</span>
        </div>
        <div class="field">
          <label class="field__label" for="sub-text">或直接粘贴 M3U 文本</label>
          <textarea id="sub-text" rows="4" placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;&quot; group-title=&quot;News&quot;,Channel&#10;https://..."></textarea>
        </div>
        <div class="filter-row">
          <button class="btn btn--primary" data-action="add-sub">${raw(icon('plus', 14))} 添加订阅</button>
          <button class="btn btn--ghost" data-action="clear-form">清空输入</button>
        </div>
        <div class="card-list" id="sub-list" style="margin-top:16px"></div>
      </section>

      <section class="section glass" style="margin-top:16px">
        <div class="section__head"><h2>手动添加频道</h2></div>
        <div class="field">
          <label class="field__label" for="ch-name">频道名称</label>
          <input id="ch-name" placeholder="频道名" />
        </div>
        <div class="field">
          <label class="field__label" for="ch-url">播放地址</label>
          <input id="ch-url" placeholder="https://.../index.m3u8" />
        </div>
        <div class="filter-row">
          <select id="ch-kind" class="select">
            <option value="iptv">电视</option>
            <option value="radio">广播</option>
          </select>
          <input id="ch-country" class="select" placeholder="国家代码 如 US" style="max-width:160px" />
          <input id="ch-category" class="select" placeholder="分类 如 News" style="max-width:180px" />
          <button class="btn btn--primary" data-action="add-channel">${raw(icon('plus', 14))} 添加</button>
        </div>
      </section>

      <section class="section glass" style="margin-top:16px">
        <div class="section__head"><h2>偏好设置</h2></div>
        <div class="card-list">
          <div class="setting-card">
            <div class="setting-card__main">
              <div class="setting-card__title">主题</div>
              <div class="setting-card__meta">当前：${store.prefs.theme === 'dark' ? '深色' : '浅色'}</div>
            </div>
            <button class="btn" data-action="toggle-theme">切换</button>
          </div>
          <div class="setting-card">
            <div class="setting-card__main">
              <div class="setting-card__title">IPTV 流代理</div>
              <div class="setting-card__meta">
                ${store.prefs.useProxy ? '已开启：直播流经服务端转发，可绕过防盗链与跨域限制' : '已关闭：直连播放，速度更快但部分源可能失败'}
              </div>
            </div>
            <button class="btn" data-action="toggle-proxy">${store.prefs.useProxy ? '关闭' : '开启'}</button>
          </div>
          <div class="setting-card">
            <div class="setting-card__main">
              <div class="setting-card__title">清空播放历史</div>
              <div class="setting-card__meta">删除全部最近播放记录</div>
            </div>
            <button class="btn btn--danger" data-action="clear-history">清空</button>
          </div>
        </div>
      </section>
    `;

    bind(container);
    await Promise.all([loadStatus(container), loadSubscriptions(container)]);
  }
};

async function loadStatus(container) {
  const grid = container.querySelector('#stat-grid');
  try {
    const status = await api.syncStatus();
    state.status = status;
    grid.innerHTML = html`
      <div class="stat">
        <div class="stat__value grad-text">${status.counts?.iptv ?? 0}</div>
        <div class="stat__label">IPTV 频道</div>
      </div>
      <div class="stat">
        <div class="stat__value grad-text">${status.counts?.radio ?? 0}</div>
        <div class="stat__label">广播电台</div>
      </div>
      <div class="stat">
        <div class="stat__value">${status.last ? fromNow(status.last.finishedAt) : '从未'}</div>
        <div class="stat__label">最近同步</div>
      </div>
      <div class="stat">
        <div class="stat__value">${status.last?.durationMs ? `${Math.round(status.last.durationMs / 100) / 10}s` : '-'}</div>
        <div class="stat__label">同步耗时</div>
      </div>
    `;
    const hint = container.querySelector('#sync-hint');
    if (hint) hint.textContent = status.last ? `上次同步目标：${status.last.target}` : '尚未同步过数据';
  } catch (err) {
    grid.innerHTML = html`<p class="muted">状态加载失败：${err.message}</p>`;
  }
}

async function loadSubscriptions(container) {
  const list = container.querySelector('#sub-list');
  try {
    const data = await api.subscriptions();
    state.subs = data.items || [];
    if (!state.subs.length) {
      list.innerHTML = html`<div class="empty-state"><p class="muted">暂无订阅，添加一个试试</p></div>`;
      return;
    }
    list.innerHTML = html`${raw(
      state.subs
        .map(
          (sub) => html`<div class="setting-card">
          <div class="setting-card__main">
            <div class="setting-card__title">${sub.name}</div>
            <div class="setting-card__meta">
              <span class="status-dot${raw(sub.last_error ? ' status-dot--error' : '')}"></span>
              ${sub.url || '文本导入'} · ${sub.channel_count} 个频道 ·
              ${sub.last_sync_at ? `同步于 ${fromNow(sub.last_sync_at)}` : '尚未同步'}
              ${sub.last_error ? html`<br /><span style="color:var(--c-danger)">${sub.last_error}</span>` : ''}
            </div>
          </div>
          <button class="btn btn--sm" data-action="sync-sub" data-id="${sub.id}">同步</button>
          <button class="btn btn--sm" data-action="toggle-sub" data-id="${sub.id}">
            ${sub.enabled ? '停用' : '启用'}
          </button>
          <button class="btn btn--sm btn--danger" data-action="del-sub" data-id="${sub.id}">删除</button>
        </div>`
        )
        .join('')
    )}`;
  } catch (err) {
    list.innerHTML = html`<p class="muted">订阅加载失败：${err.message}</p>`;
  }
}

function bind(container) {
  on(container, 'click', '[data-action="sync"]', async (event, button) => {
    const target = button.dataset.target;
    const hint = container.querySelector('#sync-hint');
    button.disabled = true;
    if (hint) hint.textContent = `正在同步 ${target}…`;
    try {
      await api.triggerSync(target);
      toastSuccess('同步任务已启动');
      setTimeout(async () => {
        await loadStatus(container);
        if (hint) hint.textContent = '同步完成，可刷新列表查看';
      }, 4000);
    } catch (err) {
      toastError(err.message || '同步失败');
    } finally {
      button.disabled = false;
    }
  });

  on(container, 'click', '[data-action="add-sub"]', async () => {
    const name = container.querySelector('#sub-name').value.trim();
    const url = container.querySelector('#sub-url').value.trim();
    const text = container.querySelector('#sub-text').value.trim();
    if (!url && !text) {
      toastError('请填写订阅地址或粘贴 M3U 文本');
      return;
    }
    try {
      await api.addSubscription({ name: name || url || '自定义订阅', url: url || undefined, text: text || undefined });
      toastSuccess('订阅导入成功');
      container.querySelector('#sub-url').value = '';
      container.querySelector('#sub-text').value = '';
      container.querySelector('#sub-name').value = '';
      await loadSubscriptions(container);
    } catch (err) {
      toastError(err.message || '导入失败');
    }
  });

  on(container, 'click', '[data-action="clear-form"]', () => {
    ['#sub-name', '#sub-url', '#sub-text'].forEach((sel) => {
      container.querySelector(sel).value = '';
    });
  });

  on(container, 'click', '[data-action="sync-sub"]', async (event, button) => {
    try {
      const result = await api.syncSubscription(button.dataset.id);
      toastSuccess(`同步完成，导入 ${result.imported} 个频道`);
      await loadSubscriptions(container);
    } catch (err) {
      toastError(err.message || '同步失败');
    }
  });

  on(container, 'click', '[data-action="toggle-sub"]', async (event, button) => {
    const sub = state.subs.find((s) => s.id === button.dataset.id);
    if (!sub) return;
    try {
      await api.updateSubscription(sub.id, { enabled: sub.enabled ? 0 : 1 });
      await loadSubscriptions(container);
    } catch (err) {
      toastError(err.message || '操作失败');
    }
  });

  on(container, 'click', '[data-action="del-sub"]', async (event, button) => {
    try {
      await api.removeSubscription(button.dataset.id);
      toastSuccess('订阅已删除');
      await loadSubscriptions(container);
    } catch (err) {
      toastError(err.message || '删除失败');
    }
  });

  on(container, 'click', '[data-action="add-channel"]', async () => {
    const payload = {
      name: container.querySelector('#ch-name').value.trim(),
      stream_url: container.querySelector('#ch-url').value.trim(),
      kind: container.querySelector('#ch-kind').value,
      country_code: container.querySelector('#ch-country').value.trim(),
      category: container.querySelector('#ch-category').value.trim()
    };
    if (!payload.stream_url) {
      toastError('请填写播放地址');
      return;
    }
    try {
      await api.addChannel(payload);
      toastSuccess('频道已添加');
      ['#ch-name', '#ch-url', '#ch-country', '#ch-category'].forEach((sel) => {
        container.querySelector(sel).value = '';
      });
    } catch (err) {
      toastError(err.message || '添加失败');
    }
  });

  on(container, 'click', '[data-action="toggle-theme"]', () => {
    store.toggleTheme();
    toastSuccess('主题已切换');
    setTimeout(() => state.container && renderSettings(state.container), 100);
  });

  on(container, 'click', '[data-action="toggle-proxy"]', () => {
    store.setUseProxy(!store.prefs.useProxy);
    toastSuccess(store.prefs.useProxy ? '已开启流代理' : '已关闭流代理');
    setTimeout(() => state.container && renderSettings(state.container), 100);
  });

  on(container, 'click', '[data-action="clear-history"]', async () => {
    try {
      await api.clearHistory();
      toastSuccess('播放历史已清空');
    } catch (err) {
      toastError(err.message || '操作失败');
    }
  });
}

async function renderSettings(container) {
  const view = (await import('./settings.js')).default;
  await view.render(container);
}
