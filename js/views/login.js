// S-01 Login
import { h, clear, errorBanner } from '../ui.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { API_URL } from '../../config.js';
import { renderLoginButton, isConfigured, getSettings } from '../auth.js';

export function render(container, { onLoggedIn }) {
  clear(container);
  const msg = h('div', { class: 'login-msg', 'aria-live': 'polite' });
  const btnHost = h('div', { class: 'login-btn' });
  const status = h('p', { class: 'conn muted', 'aria-live': 'polite', text: 'Menyemak sambungan ke server…' });

  container.append(h('main', { class: 'login-page', id: 'main', tabindex: '-1' },
    h('div', { class: 'login-card' },
      h('div', { class: 'login-brand' }, h('span', { class: 'brand-mark brand-mark-lg', 'aria-hidden': 'true' }, icon('calendar', 28))),
      h('h1', { text: getSettings().app_name }),
      h('p', { class: 'muted', text: 'Mesyuarat tanpa kertas' }),
      btnHost, msg,
      h('p', { class: 'muted small', text: 'Gunakan akaun Google yang didaftarkan oleh Setiausaha atau Admin.' }),
      status)));

  if (!isConfigured() || !API_URL) {
    msg.append(errorBanner('Konfigurasi belum lengkap. Isi API_URL dan GOOGLE_CLIENT_ID dalam config.js.'));
    status.textContent = 'Sambungan ke server: belum dikonfigurasi';
    return;
  }

  // Task 0.8: ping Apps Script dan papar status sambungan
  api('ping', {}, { noAuth: true }).then(
    () => { status.textContent = 'Sambungan berjaya'; status.classList.add('conn-ok'); },
    (e) => { status.textContent = 'Sambungan gagal: ' + e.message; status.classList.add('conn-bad'); });

  renderLoginButton(btnHost, (r) => {
    clear(msg);
    if (r.error) msg.append(errorBanner(r.error.message || 'Log masuk gagal.'));
    else onLoggedIn(r.user);
  }).catch((e) => msg.append(errorBanner(e.message)));
}
