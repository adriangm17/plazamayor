/* ===== BASE DE DATOS (IndexedDB) E IMÁGENES =====
   Almacenes: coins, images (Blob), countries, periods, sync (v8.03: estado de la sincronización con la nube) */
const DB_NAME = 'NumismaticaDB';
const DB_VERSION = 4;
let db = null;

function initDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const instance = e.target.result;
      if (!instance.objectStoreNames.contains('coins')) instance.createObjectStore('coins', { keyPath: 'id' });
      if (!instance.objectStoreNames.contains('images')) instance.createObjectStore('images');
      if (!instance.objectStoreNames.contains('countries')) instance.createObjectStore('countries', { keyPath: 'id' });
      if (!instance.objectStoreNames.contains('periods')) instance.createObjectStore('periods', { keyPath: 'id' });
      if (!instance.objectStoreNames.contains('sync')) instance.createObjectStore('sync');
    };
    request.onsuccess = (e) => { db = e.target.result; db.onversionchange = () => { db.close(); db = null; }; resolve(db); };
    request.onerror = (e) => reject(e.target.error);
    request.onblocked = () => alert('Cierra otras pestañas de la app para actualizar la base de datos.');
  });
}

function getAllFromStore(name) {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const req = db.transaction(name, 'readonly').objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function putCoinsToDB(coinsList) {
  return new Promise((resolve, reject) => {
    if (!db || !coinsList || coinsList.length === 0) return resolve();
    const tx = db.transaction('coins', 'readwrite');
    const store = tx.objectStore('coins');
    coinsList.forEach(c => store.put(c));
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

// Sustituye países y períodos por completo (son pocos y pequeños)
function putMetaToDB(countriesList, periodsList) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const tx = db.transaction(['countries', 'periods'], 'readwrite');
    const cs = tx.objectStore('countries'), ps = tx.objectStore('periods');
    cs.clear(); ps.clear();
    countriesList.forEach(c => cs.put(c));
    periodsList.forEach(p => ps.put(p));
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function deleteCoinFromDB(id) {
  return new Promise((resolve) => {
    if (!db) return resolve();
    const tx = db.transaction(['coins', 'images'], 'readwrite');
    tx.objectStore('coins').delete(id);
    tx.objectStore('images').delete(imgKey(id, 'front'));
    tx.objectStore('images').delete(imgKey(id, 'back'));
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => resolve();
  });
}

// Guarda todo de una vez (restauración / migración). Todo o nada.
function saveAllDataToDB(data, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const stores = ['coins', 'countries', 'periods'];
    if (opts.clearImages) stores.push('images');
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());
    data.coins.forEach(c => tx.objectStore('coins').put(c));
    data.countries.forEach(c => tx.objectStore('countries').put(c));
    data.periods.forEach(p => tx.objectStore('periods').put(p));
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

/* ----- Imágenes (Blob en el almacén 'images', carga bajo demanda) ----- */
const imgUrlCache = new Map();

function imgKey(coinId, side) { return coinId + ':' + side; }

function dbGetImage(key) {
  return new Promise((resolve) => {
    if (!db) return resolve(null);
    const req = db.transaction('images', 'readonly').objectStore('images').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}
function dbPutImage(key, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
function dbDeleteImage(key) {
  return new Promise((resolve) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => resolve();
  });
}
function forgetImageUrl(key) {
  const u = imgUrlCache.get(key);
  if (u) { URL.revokeObjectURL(u); imgUrlCache.delete(key); }
}

function dataURLToBlob(u) {
  const comma = u.indexOf(',');
  const mime = (/^data:([^;,]+)/.exec(u) || [])[1] || 'application/octet-stream';
  const bin = atob(u.slice(comma + 1));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(b => resolve(b), 'image/webp', IMG_QUALITY));
}

async function shrinkBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, IMG_MAX_DIM / Math.max(w, h));
    if (scale === 1 && blob.size < 30000) return blob;
    w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const out = await canvasToBlob(canvas);
    return (out && out.size < blob.size) ? out : blob;
  } catch (e) {
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* v8.07: monedas con agujero (foto sobre fondo blanco). Si el centro de la imagen es blanco y forma un hueco redondo,
   centrado y cerrado (no toca los bordes), esos píxeles pasan a transparentes. Si algo no cuadra se deja la imagen tal cual. */
async function clearCoinHole(blob) {
  try {
    if (!blob || (blob.type && !/^image\//.test(blob.type)) || typeof createImageBitmap !== 'function') return blob;
    const bmp = await createImageBitmap(blob);
    const w = bmp.width, h = bmp.height;
    if (w < 40 || h < 40) return blob;
    const isW = (d, o, t) => d[o + 3] >= 200 && d[o] >= t && d[o + 1] >= t && d[o + 2] >= t;
    // Prueba rápida a baja resolución: ¿el centro es blanco?
    const sm = document.createElement('canvas'); sm.width = sm.height = 32;
    const sx = sm.getContext('2d', { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, 32, 32);
    const q = sx.getImageData(15, 15, 2, 2).data;
    for (let i = 0; i < 4; i++) if (!isW(q, i * 4, 232)) { bmp.close && bmp.close(); return blob; }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0); bmp.close && bmp.close();
    const im = cx.getImageData(0, 0, w, h), d = im.data;
    const reg = new Uint8Array(w * h), stack = [(h >> 1) * w + (w >> 1)];
    let area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, touches = false;
    while (stack.length) {
      const p = stack.pop();
      if (reg[p]) continue;
      const x = p % w, y = (p - x) / w;
      if (!isW(d, p * 4, 225)) continue;
      reg[p] = 1; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { touches = true; break; }
      if (area > w * h * 0.3) break;
      stack.push(p - 1, p + 1, p - w, p + w);
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const ok = !touches && area <= w * h * 0.3 && area > 25 &&
      bw / bh > 0.82 && bw / bh < 1.22 && area / (bw * bh) > 0.62 && area / (bw * bh) < 0.92 &&
      Math.abs((x0 + x1) / 2 - w / 2) < w * 0.15 && Math.abs((y0 + y1) / 2 - h / 2) < h * 0.15 &&
      bw < w * 0.7 && bh < h * 0.7;
    if (!ok) return blob;
    for (let y = Math.max(0, y0 - 2); y <= Math.min(h - 1, y1 + 2); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(w - 1, x1 + 2); x++) {
      const p = y * w + x;
      if (reg[p]) { d[p * 4 + 3] = 0; continue; }
      // 1 píxel de borde claro junto al hueco: se quita también para que no quede un halo blanco
      if ((reg[p - 1] || reg[p + 1] || reg[p - w] || reg[p + w]) && isW(d, p * 4, 190)) d[p * 4 + 3] = 0;
    }
    cx.putImageData(im, 0, 0);
    const out = await new Promise(res => cv.toBlob(b => res(b), 'image/webp', 0.95));
    return out || blob;
  } catch (e) { return blob; }
}

async function getImageUrl(key) {
  if (imgUrlCache.has(key)) return imgUrlCache.get(key);
  const blob = await clearCoinHole(await dbGetImage(key));   // v8.07: el hueco blanco central se vuelve transparente (solo al mostrar; el original no se toca)
  if (!blob) return null;
  if (imgUrlCache.has(key)) return imgUrlCache.get(key);
  const url = URL.createObjectURL(blob);
  imgUrlCache.set(key, url);
  return url;
}

function imgTag(coinId, side) {
  const key = imgKey(coinId, side);
  const u = imgUrlCache.get(key);
  return `<img ${u ? `src="${u}"` : ''} data-img="${esc(key)}" alt="" decoding="async">`;
}

function hydrateImages(root) {
  (root || document).querySelectorAll('img[data-img]').forEach(img => {
    if (img.getAttribute('src')) return;
    getImageUrl(img.dataset.img).then(u => { if (u) img.src = u; });
  });
}

// Migra imágenes base64 incrustadas en la ficha al almacén 'images' (y las aligera)
async function migrateImages(coinsList) {
  const changed = [];
  for (const c of coinsList) {
    let touched = false;
    for (const [field, flag, side] of [['imgFront', 'hasFront', 'front'], ['imgBack', 'hasBack', 'back']]) {
      const v = c[field];
      if (typeof v === 'string' && v.startsWith('data:')) {
        try {
          const blob = await shrinkBlob(dataURLToBlob(v));
          await dbPutImage(imgKey(c.id, side), blob);
          forgetImageUrl(imgKey(c.id, side));
          c[flag] = true;
          delete c[field];
          touched = true;
        } catch (e) { console.warn('No se pudo migrar imagen', c.id, side, e); }
      } else if (field in c) {
        if (c[flag] === undefined) c[flag] = false;
        delete c[field];
        touched = true;
      }
      if (c[flag] === undefined) { c[flag] = false; touched = true; }
    }
    if (touched) changed.push(c);
  }
  if (changed.length) await putCoinsToDB(changed);
}
