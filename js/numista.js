/* ===== VALOR ORIENTATIVO (Numista) · v8.21 =====
   Cada tipo de Numista (N#) lleva un valor calculado en la nube: mediana de TODOS los precios de todos los años y estados.
   - Lo calcula la función "numista-valor" de Supabase (solo el administrador) y lo guarda en la tabla numista_valores.
   - Aquí solo se lee esa tabla (la ven los dos usuarios), se guarda una copia para verla sin conexión y se pinta.
   - El N# sale del enlace de Numista de cada ficha. Si no hay enlace o Numista no tiene precios, no hay valor (no se inventa). */
(function () {
  const LS_KEY = 'pm_numista_valores';
  const GKEY = { F: 'f', VF: 'vf', XF: 'xf', AU: 'au', UNC: 'unc' };   // estado de la app → estado de Numista
  const map = new Map();       // numista_id → fila
  let loaded = false, loading = null, usage = null, batch = null;

  const sb = () => (window.PMSync && PMSync.enabled && PMSync.client) ? PMSync.client() : null;
  const isAdmin = () => !!(window.PMSync && PMSync.role && PMSync.role() === 'admin');
  const eur = v => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toLocaleString('es-ES') + ' €';

  /* ---- N# a partir del enlace: numista.com/12345 · numista.com/catalogue/pieces12345.html ---- */
  function idOf(coin) {
    const u = String((coin && coin.numistaUrl) || '').trim();
    if (!u) return null;
    const m = u.match(/numista\.com\/(?:catalogue\/pieces)?(\d{1,9})(?:\.html)?(?:[/?#]|$)/i);
    return m ? Number(m[1]) : null;
  }

  /* ---- copia local ---- */
  function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify([...map.values()])); } catch (e) {} }
  function loadLocal() {
    try { (JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []).forEach(r => map.set(Number(r.numista_id), r)); } catch (e) {}
  }
  loadLocal();

  /* ---- leer la tabla de la nube (por páginas) ---- */
  function load(force) {
    if (loaded && !force) return Promise.resolve();
    if (loading) return loading;
    const c = sb();
    if (!c || !navigator.onLine) return Promise.resolve();
    loading = (async () => {
      try {
        const page = 1000; let from = 0, fresh = new Map();
        for (;;) {
          const { data, error } = await c.from('numista_valores').select('*').order('numista_id').range(from, from + page - 1);
          if (error) throw error;
          (data || []).forEach(r => fresh.set(Number(r.numista_id), r));
          if (!data || data.length < page) break;
          from += page;
        }
        map.clear(); fresh.forEach((v, k) => map.set(k, v));
        loaded = true; saveLocal();
        if (typeof refreshNumistaViews === 'function') refreshNumistaViews();
      } catch (e) { /* sin conexión o tabla sin crear: se usa la copia local */ }
      finally { loading = null; }
    })();
    return loading;
  }

  /* ---- valor de una ficha ---- */
  function rowOf(coin) { const id = idOf(coin); return id ? (map.get(id) || null) : null; }
  // Mejor estado "en tu ejemplar": devuelve la mediana en ese estado si Numista la tiene, o la general
  function estimate(coin, grade) {
    const r = rowOf(coin);
    if (!r || r.estado !== 'ok' || !(Number(r.mediana) > 0)) return null;
    const g = GKEY[String(grade || '').trim()];
    const pe = g && r.por_estado && r.por_estado[g];
    if (pe && Number(pe.mediana) > 0) return { value: Number(pe.mediana), scope: 'estado', n: pe.n, row: r };
    return { value: Number(r.mediana), scope: 'general', n: r.n, row: r };
  }

  /* ---- total de la colección (cada ejemplar con estado cuenta; usa su estado si Numista lo tiene) ---- */
  function collectionTotal() {
    let total = 0, withValue = 0, items = 0;
    (coins || []).forEach(c => {
      const rows = (Array.isArray(c.items) ? c.items : []).filter(i => i && typeof i === 'object');
      const owned = rows.some(i => String(i.grade || '').trim() !== '') ? rows : [];
      owned.forEach(i => {
        items++;
        const e = estimate(c, i.grade);
        if (e) { total += e.value; withValue++; }
      });
    });
    return { total, withValue, items };
  }

  /* ---- llamar a la función ---- */
  async function call(payload) {
    const c = sb(); if (!c) throw new Error('Sin conexión con la nube');
    const { data, error } = await c.functions.invoke('numista-valor', { body: payload });
    if (error) {
      let msg = error.message || 'Error';
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return data;
  }
  function note(res) { if (res && res.usadas != null) usage = { usadas: res.usadas, limite: res.limite }; }

  async function computeOne(coin, force) {
    const id = idOf(coin);
    if (!id) throw new Error('Esta ficha no tiene un enlace de Numista válido');
    const res = await call({ numista_id: id, forzar: !!force });
    note(res);
    if (res.ok && res.fila) { map.set(id, res.fila); saveLocal(); }
    return res;
  }

  /* Botón "Calcular" de la ficha */
  async function computeFromModal() {
    const coin = (coins || []).find(x => x.id === activeCoinId); if (!coin) return;
    const box = document.getElementById('nv-box'); if (box) box.classList.add('nv-busy');
    try {
      const res = await computeOne(coin, true);
      if (!res.ok) alert(motivoTxt(res));
    } catch (e) { alert('No se pudo calcular el valor:\n' + e.message); }
    renderModal(coin);
    if (typeof refreshNumistaViews === 'function') refreshNumistaViews();
  }
  function motivoTxt(res) {
    if (res.motivo === 'cuota') return `Se alcanzaría el límite gratuito de Numista de este mes (${res.usadas} de ${res.limite} peticiones usadas${res.necesarias ? `; este tipo necesita ${res.necesarias}` : ''}). Se podrá calcular el mes que viene.`;
    if (res.motivo === 'demasiadas') return `Este tipo tiene ${res.emisiones} emisiones en Numista: gastaría demasiada cuota y no se calcula.`;
    return 'No se pudo calcular.';
  }

  /* ---- ficha (ventana de la moneda) ---- */
  function renderModal(coin) {
    const box = document.getElementById('nv-box'); if (!box) return;
    box.classList.remove('nv-busy');
    const id = idOf(coin);
    if (!id) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const r = map.get(id);
    const btn = isAdmin() ? `<button type="button" class="nv-btn" onclick="NumistaValor.computeFromModal()">${r ? '<i class="fa-solid fa-rotate"></i>' : 'Calcular'}</button>` : '';
    let html;
    if (!r) {
      html = `<div class="nv-main"><span class="nv-none">Sin calcular</span>${btn}</div>`;
    } else if (r.estado !== 'ok') {
      html = `<div class="nv-main"><span class="nv-none">Numista no tiene precios para este tipo</span>${btn}</div>`;
    } else {
      const grades = (Array.isArray(coin.items) ? coin.items : []).map(i => String((i && i.grade) || '').trim()).filter(g => GKEY[g]);
      const best = grades.sort((a, b) => GRADES.indexOf(b) - GRADES.indexOf(a))[0];
      const mine = best ? estimate(coin, best) : null;
      html = `<div class="nv-main"><b class="nv-val">${eur(Number(r.mediana))}</b>
          <span class="nv-sub">mediana · ${eur(Number(r.minimo))} – ${eur(Number(r.maximo))}</span>${btn}</div>
        <div class="nv-meta">${r.n} ${r.n === 1 ? 'precio' : 'precios'} · ${r.emisiones} ${r.emisiones === 1 ? 'emisión' : 'emisiones'}${mine && mine.scope === 'estado' ? ` · <b>en ${esc(best)}: ${eur(mine.value)}</b>` : ''}</div>`;
    }
    box.innerHTML = `<div class="nv-head"><i class="fa-solid fa-chart-line"></i> VALOR ORIENTATIVO <span>Numista</span></div>${html}`;
  }

  /* ---- cálculo por tandas (solo administrador) ---- */
  function pendingList(onlyOwned) {
    const seen = new Set(), out = [];
    (coins || []).forEach(c => {
      const id = idOf(c); if (!id || seen.has(id) || map.has(id)) return;
      const owned = c.acquired || (Array.isArray(c.items) && c.items.some(i => i && String(i.grade || '').trim()));
      if (onlyOwned && !owned) return;
      seen.add(id); out.push({ id, coin: c, owned: !!owned });
    });
    out.sort((a, b) => (b.owned - a.owned));   // primero las tuyas
    return out;
  }
  function bar(text, cancel) {
    let el = document.getElementById('nv-progress');
    if (!el) { el = document.createElement('div'); el.id = 'nv-progress'; document.body.appendChild(el); }
    el.innerHTML = `<span>${text}</span>${cancel ? '<button type="button" onclick="NumistaValor.cancelBatch()">Parar</button>' : '<button type="button" onclick="document.getElementById(\'nv-progress\').remove()">Cerrar</button>'}`;
  }
  function cancelBatch() { if (batch) batch.cancel = true; }

  async function startBatch(onlyOwned) {
    if (!isAdmin()) { alert('Solo el administrador puede calcular valores.'); return; }
    if (batch) { alert('Ya hay un cálculo en marcha.'); return; }
    await load(true);
    const list = pendingList(onlyOwned);
    if (!list.length) { alert(onlyOwned ? 'Todas tus monedas con enlace de Numista ya tienen valor calculado.' : 'Todas las fichas con enlace de Numista ya tienen valor calculado.'); return; }
    let u = null; try { u = await call({ accion: 'uso' }); note(u); } catch (e) { alert('No se pudo hablar con la función de Supabase:\n' + e.message + '\n\n¿Está desplegada "numista-valor" y puesto el secreto NUMISTA_API_KEY?'); return; }
    const left = Math.max(0, (u.limite || 1900) - (u.usadas || 0));
    if (!confirm(`Hay ${list.length} tipos de Numista sin calcular${onlyOwned ? ' entre tus monedas' : ''}.\n\nPeticiones gratuitas de este mes: te quedan ${left} de ${u.limite}. Cada tipo gasta 1 + el número de años/cecas que tenga.\n\nSe irán calculando de una en una hasta acabar la lista o el cupo del mes (puedes parar cuando quieras). ¿Empezar?`)) return;
    batch = { cancel: false };
    let done = 0, noPrice = 0, skipped = 0, stop = '';
    for (const it of list) {
      if (batch.cancel) { stop = 'Parado.'; break; }
      bar(`Calculando valores… ${done + skipped} de ${list.length} · ${usage ? usage.usadas + '/' + usage.limite + ' peticiones' : ''}`, true);
      try {
        const res = await computeOne(it.coin, false);
        if (res.ok) { done++; if (res.fila && res.fila.estado !== 'ok') noPrice++; }
        else if (res.motivo === 'cuota') {
          // este tipo no cabe en lo que queda; si queda poco cupo se corta, si no se sigue con tipos más cortos
          if (res.necesarias == null || (usage && usage.limite - usage.usadas < 5)) { stop = 'Cupo mensual de Numista agotado: se continúa el mes que viene.'; break; }
          skipped++;
        } else skipped++;
      } catch (e) { stop = 'Error: ' + e.message; break; }
    }
    batch = null;
    if (typeof refreshNumistaViews === 'function') refreshNumistaViews();
    bar(`${stop || 'Terminado.'} Calculados ${done}${noPrice ? ` (${noPrice} sin precios en Numista)` : ''}${skipped ? ` · saltados ${skipped}` : ''}${usage ? ` · ${usage.usadas}/${usage.limite} peticiones este mes` : ''}`, false);
  }

  window.NumistaValor = { idOf, load, rowOf, estimate, collectionTotal, renderModal, computeFromModal, startBatch, cancelBatch, fmt: eur, isAdmin, usage: () => usage, pending: pendingList };
})();

/* Cuando cambian los valores se repinta lo que esté a la vista */
function refreshNumistaViews() {
  try {
    const m = document.getElementById('coin-modal');
    if (m && !m.classList.contains('hidden') && activeCoinId) { const c = coins.find(x => x.id === activeCoinId); if (c) NumistaValor.renderModal(c); }
    const st = document.getElementById('estadisticas-content');
    if (st && st.offsetParent !== null && typeof renderEstadisticas === 'function') renderEstadisticas();
  } catch (e) {}
}
