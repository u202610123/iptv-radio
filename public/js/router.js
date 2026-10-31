/**
 * 前端 hash 路由：#/iptv、#/radio、#/favorites、#/history、#/settings
 * 视图模块只需导出 { id, title, render(container) }
 */
const routes = new Map();
let fallbackRoute = 'iptv';
let onChange = () => {};

export function registerRoute(view) {
  routes.set(view.id, view);
  return view;
}

export function setFallback(id) {
  fallbackRoute = id;
}

export function onRouteChange(fn) {
  onChange = fn;
}

export function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const id = hash.split('?')[0] || fallbackRoute;
  return routes.has(id) ? id : fallbackRoute;
}

export function getRoute(id) {
  return routes.get(id);
}

export function allRoutes() {
  return Array.from(routes.values());
}

export function navigate(id) {
  if (currentRoute() === id) {
    onChange(id);
    return;
  }
  location.hash = `#/${id}`;
}

export function startRouter() {
  window.addEventListener('hashchange', () => onChange(currentRoute()));
  onChange(currentRoute());
}
