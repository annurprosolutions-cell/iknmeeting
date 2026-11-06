// Dimuat segerak dalam <head> supaya mod gelap/cerah dipakai sebelum paparan (elak kelipan).
(function () {
  try {
    var m = localStorage.getItem('emi_theme');
    if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
  } catch (e) { /* localStorage tidak tersedia: ikut sistem */ }
})();
