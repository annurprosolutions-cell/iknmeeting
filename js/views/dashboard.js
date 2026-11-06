// S-02 Dashboard (Fasa 1: kerangka. Kad sebenar masuk pada Fasa 2 dan 5.)
import { h, badge, emptyState } from '../ui.js';

export function render(container, { user }) {
  container.append(
    h('h1', { text: 'Dashboard' }),
    h('p', { class: 'lead' }, 'Selamat datang, ', h('strong', { text: user.name }), '. ', badge(user.role, 'info')),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h2', { text: 'Mesyuarat akan datang' }), emptyState('Tiada mesyuarat akan datang')),
      h('section', { class: 'card' }, h('h2', { text: 'Tindakan tertunggak' }), emptyState('Tiada tindakan tertunggak'))));
}
