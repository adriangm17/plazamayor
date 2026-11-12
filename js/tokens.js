/* ===== AJUSTES → TOKENS · v8.24 =====
   Cuenta de forma aproximada las peticiones que se gastan en los dos servicios gratuitos:
   - Numista: las cuenta la función de Supabase (compartido entre los dos usuarios), límite mensual.
   - Google (Gemini, pestaña Identificación): las cuenta este dispositivo, límite diario aproximado.
   No tiene que ser exacto: es una orientación para no pasarse de la capa gratuita. */
(function () {
  const LS = 'pm_google_uso';
  const GOOGLE_DAILY = 50;   // consultas gratuitas al día (aprox.; coincide con lo que dice la pestaña Identificación)
  let numista = null, numistaErr = '', loading = false;

  // El cupo de Google se renueva a medianoche (hora del Pacífico)
  const pacificDay = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  function readG() {
    let o = null; try { o = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {}
    const day = pacificDay(), month = day.slice(0, 7);
    if (!o || typeof o !== 'object') o = {};
    if (o.day !== day) { o.day = day; o.n = 0; }
    if (o.month !== month) { o.month = month; o.mn = 0; }
    return o;
  }
  function countGoogle() {
    const o = readG(); o.n = (o.n || 0) + 1; o.mn = (o.mn || 0) + 1;
    try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {}
    if (document.getElementById('xm-tokens') && !document.getElementById('xm-sub-tokens').classList.contains('hidden')) render();
  }

  const fmt = n => Number(n).toLocaleString('es-ES');
  function meter(title, icon, used, limit, line, note) {
    const left = Math.max(0, limit - used), pct = Math.min(100, Math.round(used / limit * 100));
    const cls = pct >= 90 ? 'xt-bad' : pct >= 70 ? 'xt-warn' : '';
    return `<div class="xt-meter ${cls}">
      <div class="xt-top"><span class="xt-t"><i class="fa-solid fa-${icon}"></i>${title}</span><span class="xt-left"><b>${fmt(left)}</b> quedan</span></div>
      <div class="xt-track"><i style="width:${pct}%"></i></div>
      <div class="xt-line">${line}</div>${note ? `<div class="xt-note">${note}</div>` : ''}
    </div>`;
  }
  function render() {
    const box = document.getElementById('xm-tokens'); if (!box) return;
    const g = readG();
    let n;
    if (numista) n = meter('Numista', 'chart-line', numista.usadas, numista.limite, `${fmt(numista.usadas)} de ${fmt(numista.limite)} peticiones este mes`, 'Compartido entre los dos usuarios. Se reinicia cada mes.');
    else n = `<div class="xt-meter"><div class="xt-top"><span class="xt-t"><i class="fa-solid fa-chart-line"></i>Numista</span></div><div class="xt-line">${loading ? 'Consultando…' : (numistaErr || '—')}</div></div>`;
    const gm = meter('Google (fotos)', 'camera', g.n || 0, GOOGLE_DAILY, `${fmt(g.n || 0)} de ~${GOOGLE_DAILY} consultas hoy · ${fmt(g.mn || 0)} este mes`, 'Aproximado: solo cuenta las de este dispositivo. Se renueva a las 9:00 (hora de España).');
    box.innerHTML = n + gm;
  }
  async function refresh() {
    render();
    if (!window.NumistaValor || !NumistaValor.fetchUsage) return;
    loading = true; numistaErr = ''; render();
    try { numista = await NumistaValor.fetchUsage(); }
    catch (e) { numistaErr = 'No disponible ahora mismo'; }
    loading = false; render();
  }
  window.PMTokens = { countGoogle, refresh, render, noteNumista(u) { if (u && u.usadas != null) { numista = { usadas: u.usadas, limite: u.limite }; render(); } } };
})();
