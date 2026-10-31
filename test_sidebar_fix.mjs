// v1.1.8（待发）：桌面端菜单按钮必须能折叠侧边栏
import { readFileSync } from 'node:fs';
let ok = true;
const check = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) ok = false; };
const app = readFileSync('./public/js/app.js', 'utf-8');
const css = readFileSync('./public/css/layout.css', 'utf-8');
check('桌面端切 is-collapsed', app.includes("is-collapsed"));
check('移动端仍走 is-open 抽屉', app.includes("window.innerWidth <= 900") && app.includes("is-open"));
check('跳路由不把桌面折叠再打开', app.includes("if (force === false) return; // 桌面端跳路由不改变折叠状态"));
check('折叠状态持久化', app.includes('iptv-radio-panel:sidebar-collapsed'));
check('CSS 折叠规则只在桌面端生效', css.includes('@media (min-width: 901px)') && css.includes('.sidebar.is-collapsed'));
if (!ok) process.exit(1);
console.log('ALL SIDEBAR TESTS PASSED');
