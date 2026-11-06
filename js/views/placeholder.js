// Skrin yang belum dibina: papar "Akan datang" (AFD/IPD 2.5).
import { h, emptyState } from '../ui.js';

export function render(container, { route }) {
  const m = route.meta || {};
  container.append(h('h1', { text: m.title || 'Akan datang' }),
    h('section', { class: 'card' }, emptyState('Akan datang', m.phase ? 'Skrin ini dibina pada ' + m.phase + '.' : undefined)));
}
