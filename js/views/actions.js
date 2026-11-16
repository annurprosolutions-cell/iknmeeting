// S-12 Tindakan Saya: tindakan anda merentas mesyuarat. Staf boleh tukar ke Semua.
import { h } from '../ui.js';
import { actionsPanel } from '../actions-panel.js';

export function render(container, { user }) {
  container.append(h('h1', { text: 'Tindakan Saya' }),
    h('p', { class: 'muted', text: 'Tindakan susulan yang diberikan kepada anda. Kemas kini status dan maklum balas selepas dilaksanakan.' }),
    h('section', { class: 'card' }, actionsPanel({ user }).el));
}
