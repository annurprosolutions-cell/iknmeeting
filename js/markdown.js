// Pemapar Markdown kecil dan selamat untuk minit. Dibina dengan DOM (tiada innerHTML): teks sentiasa melalui text node.
// Disokong: # ## ### tajuk, perenggan, senarai bernombor (1. / 1) / a.), senarai titik (- / *), **tebal**, *condong*, ---.
import { h } from './ui.js';

function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('strong', { text: m[1] }) : h('em', { text: m[2] }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(src) {
  const root = h('div', { class: 'md' });
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let para = [], list = null;
  const flushPara = () => { if (para.length) { const p = h('p'); para.forEach((l, i) => { if (i) p.append(h('br')); p.append(...inline(l)); }); root.append(p); para = []; } };
  const flushList = () => { list = null; };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushPara(); flushList(); root.append(h('h' + (m[1].length + 1), {}, ...inline(m[2]))); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); root.append(h('hr')); continue; }
    if ((m = /^\s*(\d+|[a-z])[.)]\s+(.*)$/.exec(line))) {
      flushPara();
      if (!list || list.tag !== 'ol') { list = { tag: 'ol', el: h('ol') }; root.append(list.el); }
      const li = h('li', {}, ...inline(m[2])); if (/^\d+$/.test(m[1])) li.setAttribute('value', m[1]); list.el.append(li); continue;
    }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      flushPara();
      if (!list || list.tag !== 'ul') { list = { tag: 'ul', el: h('ul') }; root.append(list.el); }
      list.el.append(h('li', {}, ...inline(m[1]))); continue;
    }
    flushList(); para.push(line.trim());
  }
  flushPara();
  return root;
}
