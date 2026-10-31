import { html, raw, on, debounce, icon } from '../lib/dom.js';

/**
 * 顶部筛选栏（搜索 + 国家 / 分类 / 波段 组合筛选）
 * 交互通过回调暴露，视图层负责数据加载
 */
export function filterBarHtml(options = {}) {
  const {
    title = '频道',
    subtitle = '',
    countries = [],
    categories = [],
    bands = [],
    selected = {},
    total = 0,
    showSearch = true
  } = options;

  const chip = (type, item) => {
    const active = String(selected[type] || '') === String(item.value) ? ' is-active' : '';
    return html`<button class="chip${raw(active)}" data-filter="${type}" data-value="${item.value}">
      ${item.label}<span class="chip__count">${item.count ?? ''}</span>
    </button>`;
  };

  return html`
    <section class="section glass">
      <div class="page-head">
        <div>
          <div class="page-head__title">
            <h1>${title}</h1>
            ${subtitle ? html`<span class="tag">${subtitle}</span>` : ''}
          </div>
          <div class="page-head__meta" id="filter-summary">
            <span>共 ${total} 个条目</span>
          </div>
        </div>
      </div>

      <div class="filters" style="margin-top:16px">
        ${showSearch
          ? html`<div class="search-box" id="inline-search">
              <span class="search-box__icon">${raw(icon('search', 16))}</span>
              <input type="search" id="inline-search-input" placeholder="搜索频道名 / 分类 / 国家…"
                     value="${selected.q || ''}" autocomplete="off" />
            </div>`
          : ''}

        ${countries.length
          ? html`<div class="filter-row">
              <span class="filter-row__label">国家</span>
              <div class="filters__scroll">
                <button class="chip${raw(selected.country ? '' : ' is-active')}" data-filter="country" data-value="">全部</button>
                ${raw(countries.slice(0, 120).map((c) => chip('country', c)).join(''))}
              </div>
            </div>`
          : ''}

        ${categories.length
          ? html`<div class="filter-row">
              <span class="filter-row__label">分类</span>
              <div class="filters__scroll">
                <button class="chip${raw(selected.category ? '' : ' is-active')}" data-filter="category" data-value="">全部</button>
                ${raw(categories.slice(0, 80).map((c) => chip('category', c)).join(''))}
              </div>
            </div>`
          : ''}

        ${bands.length
          ? html`<div class="filter-row">
              <span class="filter-row__label">波段</span>
              <button class="chip${raw(selected.band ? '' : ' is-active')}" data-filter="band" data-value="">全部</button>
              ${raw(bands.map((b) => chip('band', b)).join(''))}
            </div>`
          : ''}
      </div>
    </section>
  `;
}

/**
 * 绑定筛选交互
 * @param {Element} root 容器
 * @param {(filters: object) => void} onChange
 */
export function bindFilterBar(root, onChange) {
  on(root, 'click', '[data-filter]', (event, target) => {
    event.preventDefault();
    const type = target.dataset.filter;
    const value = target.dataset.value || '';
    onChange({ [type]: value });
  });

  const input = root.querySelector('#inline-search-input');
  if (input) {
    const handler = debounce(() => onChange({ q: input.value.trim() }), 300);
    input.addEventListener('input', handler);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onChange({ q: input.value.trim() });
      }
    });
  }
}
