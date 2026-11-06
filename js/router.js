// Hash router mudah. Laluan: '/meetings/:id' -> params.id
const routes = [];
let handler = null;

export function define(path, opts) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  routes.push({ path, re, keys, ...opts });
}

export function currentPath() {
  const h = location.hash.replace(/^#/, '') || '/';
  return h.split('?')[0];
}

function resolve() {
  const path = currentPath();
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params, path };
    }
  }
  return { route: null, params: {}, path };
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) { run(); return; }
  if (replace) location.replace(target); else location.hash = target;
}

function run() { if (handler) handler(resolve()); }

export function start(onRoute) {
  handler = onRoute;
  window.addEventListener('hashchange', run);
  run();
}
