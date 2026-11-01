/* ===== PRECIO Y VALOR DE LA PLATA ===== */
// Precio en €/g de plata fina. Fuentes, por orden:
//   1) precio manual fijado por el usuario (solo si lo ha puesto él; se puede quitar)
//   2) cotización en directo (varias fuentes de respaldo)
//   3) última cotización real guardada (si no hay conexión)
//   4) valor aproximado fijo (último recurso)
let currentSilverPricePerGram = 1.56;
let silverPriceSource = 'fallback';   // 'api' | 'manual' | 'cache' | 'fallback'
let silverPriceTime = 0;              // momento (ms) de la última cotización real obtenida
const SILVER_REFRESH_MS = 10 * 60 * 1000;
const TROY_OZ_G = 31.1034768;

function computeCoinSilverValue(coin) {
  if (!coin || !coin.rarity || coin.rarity.toUpperCase() !== 'PLATA') return null;
  const weight = parseFloat(coin.silverWeight) || 0;
  let purity = parseFloat(coin.silverPurity) || 0;
  if (purity > 0 && purity <= 1) purity = purity * 1000;
  if (weight > 0 && purity > 0) {
    const val = weight * (purity / 1000) * currentSilverPricePerGram;
    return `${val.toFixed(2).replace('.', ',')} €`;
  }
  return '0,00 €';
}

function fmtSilverTime(ts) {
  const d = new Date(ts), now = new Date();
  const hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
}

function updateSilverDisplay() {
  const display = document.getElementById('silver-price-rate-display');
  if (!display) return;
  const price = currentSilverPricePerGram.toFixed(2).replace('.', ',');
  let txt = `Plata: ${price} €/g`;
  let tip = 'Pulsa para fijar un precio manual (déjalo vacío para volver al automático)';
  if (silverPriceSource === 'api') {
    txt += ` · ${fmtSilverTime(silverPriceTime)}`;
    tip = 'Cotización de mercado actualizada a las ' + fmtSilverTime(silverPriceTime) + '. ' + tip;
  } else if (silverPriceSource === 'cache') {
    txt += ` · último ${fmtSilverTime(silverPriceTime)} · sin conexión`;
  } else if (silverPriceSource === 'manual') {
    txt += ' · manual · editar';
  } else {
    txt += ' · aprox. · editar';
  }
  display.innerText = txt;
  display.title = tip;
}

function editSilverPrice() {
  const current = currentSilverPricePerGram.toFixed(2).replace('.', ',');
  const input = prompt('Precio de la plata fina (€/g).\nDeja el campo vacío para volver al precio automático de mercado:', current);
  if (input === null) return;
  if (String(input).trim() === '') {   // volver a automático
    try { localStorage.removeItem('numis_silver_price'); } catch (e) {}
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('numis_silver_cache') || 'null'); } catch (e) {}
    if (cached && cached.price > 0) { currentSilverPricePerGram = cached.price; silverPriceTime = cached.ts; silverPriceSource = 'cache'; }
    else { currentSilverPricePerGram = 1.56; silverPriceTime = 0; silverPriceSource = 'fallback'; }
    updateSilverDisplay();
    fetchSilverPrice(true);
    return;
  }
  const value = parseFloat(String(input).replace(',', '.'));
  if (!isFinite(value) || value <= 0) { alert('Introduce un valor numérico válido.'); return; }
  currentSilverPricePerGram = value;
  silverPriceSource = 'manual';
  try { localStorage.setItem('numis_silver_price', String(value)); } catch (e) {}
  updateSilverDisplay();
  calculateSilverValue(false);
  render();
}

/* ---- red ---- */
async function fetchJSON(url, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

// Plata en USD por onza troy (se prueba cada fuente hasta que una responda con un valor razonable)
async function getSilverUsdPerOz() {
  const sources = [
    async () => (await fetchJSON('https://api.gold-api.com/price/XAG')).price,
    async () => {
      const d = await fetchJSON('https://api.metals.live/v1/spot/silver');
      return Array.isArray(d) ? (d[0].silver ?? d[0].price) : d.price;
    },
    async () => (await fetchJSON('https://data-asg.goldprice.org/dbXRates/USD')).items[0].xagPrice
  ];
  for (const src of sources) {
    try {
      const v = parseFloat(await src());
      if (isFinite(v) && v > 1 && v < 2000) return v;
    } catch (e) { console.warn('Fuente de plata no disponible:', e.message || e); }
  }
  throw new Error('Ninguna fuente de cotización de la plata respondió');
}

// Conversión USD → EUR
async function getUsdToEur() {
  const sources = [
    async () => (await fetchJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR')).rates.EUR,
    async () => (await fetchJSON('https://open.er-api.com/v6/latest/USD')).rates.EUR,
    async () => (await fetchJSON('https://api.frankfurter.app/latest?from=USD&to=EUR')).rates.EUR
  ];
  for (const src of sources) {
    try {
      const v = parseFloat(await src());
      if (isFinite(v) && v > 0.3 && v < 3) {
        try { localStorage.setItem('numis_usd_eur', String(v)); } catch (e) {}
        return v;
      }
    } catch (e) { console.warn('Fuente de cambio no disponible:', e.message || e); }
  }
  let saved = 0;
  try { saved = parseFloat(localStorage.getItem('numis_usd_eur')); } catch (e) {}
  return (isFinite(saved) && saved > 0.3) ? saved : 0.92;
}

let silverFetching = false;
async function fetchSilverPrice(force = false) {
  if (silverFetching) return;

  if (!force && silverPriceTime === 0) {   // primera carga: manual guardado o última cotización real
    try {
      const saved = parseFloat(localStorage.getItem('numis_silver_price'));
      if (isFinite(saved) && saved > 0) { currentSilverPricePerGram = saved; silverPriceSource = 'manual'; }
      else {
        const c = JSON.parse(localStorage.getItem('numis_silver_cache') || 'null');
        if (c && c.price > 0) { currentSilverPricePerGram = c.price; silverPriceTime = c.ts; silverPriceSource = 'cache'; }
      }
    } catch (e) {}
  }

  if (silverPriceSource === 'manual') {   // el precio fijado a mano manda sobre la cotización automática
    updateSilverDisplay();
    calculateSilverValue(false);
    render();
    return;
  }

  silverFetching = true;
  const before = currentSilverPricePerGram;
  try {
    const [usdOz, usdToEur] = await Promise.all([getSilverUsdPerOz(), getUsdToEur()]);
    const eurPerGram = usdOz * usdToEur / TROY_OZ_G;
    if (isFinite(eurPerGram) && eurPerGram > 0.3 && eurPerGram < 100) {
      currentSilverPricePerGram = eurPerGram;
      silverPriceSource = 'api';
      silverPriceTime = Date.now();
      try { localStorage.setItem('numis_silver_cache', JSON.stringify({ price: eurPerGram, ts: silverPriceTime })); } catch (e) {}
    }
  } catch (err) {
    console.warn('No se pudo obtener la cotización de la plata:', err);
  } finally { silverFetching = false; }

  updateSilverDisplay();
  calculateSilverValue(false);
  const a = document.activeElement;
  const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if (force || currentSilverPricePerGram !== before) { if (!typing) render(); }
}

// Refresco automático: cada 10 min y al volver a la app
setInterval(() => { if (silverPriceSource !== 'manual') fetchSilverPrice(true); }, SILVER_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && silverPriceSource !== 'manual' && Date.now() - silverPriceTime > SILVER_REFRESH_MS / 2) fetchSilverPrice(true);
});
