// S-08 Penonton Bahan: pratonton Drive dalam iframe, muat turun, buka tab baharu, skrin penuh.
import { h, clear, button, badge, emptyState, errorBanner, skeletonRows, fmtDateTime, fmtSize } from '../ui.js';
import { icon } from '../icons.js';
import { commentsPanel } from '../comments-panel.js';
import { api } from '../api.js';

export function render(container, { user, params }) {
  const host = h('div');
  container.append(host);
  const back = () => h('p', { class: 'back' }, h('a', { href: '#/meetings/' + encodeURIComponent(params.id) }, icon('prev', 16), ' Kembali ke mesyuarat'));

  async function load() {
    clear(host).append(skeletonRows(3));
    let m;
    try { m = await api('meetings.get', { id: params.id }); }
    catch (e) { clear(host).append(back(), e.code === 403 ? emptyState('Anda tidak dijemput ke mesyuarat ini') : errorBanner(e.message, load)); return; }
    const mat = m.materials.find((x) => x.id === params.mid);
    if (!mat) { clear(host).append(back(), h('section', { class: 'card' }, emptyState('Bahan tidak dijumpai', 'Ia mungkin telah diarkibkan atau anda tiada akses.'))); return; }

    api('materials.logOpen', { id: mat.id }).catch(() => { /* rekod audit tidak patut menghalang bacaan */ });

    const id = encodeURIComponent(mat.drive_file_id);
    const frame = h('iframe', { class: 'viewer-frame', title: 'Pratonton ' + mat.title, src: `https://drive.google.com/file/d/${id}/preview`, allow: 'fullscreen', referrerpolicy: 'no-referrer-when-downgrade' });
    clear(host).append(back(),
      h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'small muted', text: `${mat.type} · ${m.title}` }),
        h('h1', {}, mat.title, ' ', mat.version > 1 ? badge('v' + mat.version, 'info') : null, ' ', mat.restricted ? badge('Terhad', 'warning') : null))),
      h('div', { class: 'viewer-bar' },
        h('p', { class: 'muted small', text: `${mat.file_name}${mat.size_bytes ? ' · ' + fmtSize(mat.size_bytes) : ''} · ${mat.uploaded_by_name}, ${fmtDateTime(mat.uploaded_at)}` }),
        h('div', { class: 'viewer-actions' },
          h('a', { class: 'btn btn-secondary', href: `https://drive.google.com/uc?export=download&id=${id}`, target: '_blank', rel: 'noopener noreferrer' }, icon('upload', 18).cloneNode(true), h('span', { text: 'Muat turun' })),
          h('a', { class: 'btn btn-secondary', href: `https://drive.google.com/file/d/${id}/view`, target: '_blank', rel: 'noopener noreferrer' }, h('span', { text: 'Buka dalam tab baharu' })),
          button('Skrin penuh', { kind: 'secondary', onClick: () => { if (frame.requestFullscreen) frame.requestFullscreen(); } }))),
      frame,
      h('section', { class: 'card section viewer-comments' }, h('h2', { text: 'Komen & Cadangan untuk bahan ini' }), commentsPanel({ m, user, target: { type: 'Bahan', id: mat.id } }).el),
      h('p', { class: 'viewer-hint' }, `Jika pratonton tidak muncul, pastikan pelayar ini sudah log masuk ke akaun Google ${user.email}, atau guna "Buka dalam tab baharu".`));
  }
  load();
}
