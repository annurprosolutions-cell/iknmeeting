import { h, emptyState } from '../ui.js';

export function render(container, { reason }) {
  container.append(h('h1', { text: reason === 'notfound' ? 'Halaman tidak dijumpai' : 'Tiada akses' }),
    h('section', { class: 'card' }, emptyState(
      reason === 'notfound' ? 'Halaman yang anda cari tidak wujud.' : 'Anda tidak dibenarkan membuka halaman ini.',
      'Gunakan menu untuk kembali ke Dashboard.')));
}
