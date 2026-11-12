/* ===== SINCRONIZACIÓN EN LA NUBE (Supabase) · v8.03 =====
   - La app sigue funcionando sin conexión con IndexedDB; la nube es una copia compartida.
   - Catálogo (zonas, países, períodos, fichas + fotos): solo el administrador lo sube.
   - Colección (ejemplares marcados, coin.items): la suben y la ven los dos usuarios.
   - Se sube lo que cambia (por huella), se baja lo nuevo (por fecha) y los borrados viajan como "eliminado".
   - Las fotos del catálogo van a un almacén privado y se descargan bajo demanda al verlas.
   No toca el modelo de la app: los guardados siguen siendo los de db.js; aquí solo se engancha. */
(function () {
  const CFG = (typeof PM_CLOUD !== 'undefined') ? PM_CLOUD : null;
  const API = {
    enabled: !!(CFG && typeof supabase !== 'undefined' && supabase.createClient),
    boot, syncNow, login, logout, role: () => role, user: () => user, status: () => status,
    _test: {}
  };
  window.PMSync = API;
  if (!API.enabled) return;

  const OWN_FIELDS = ['items', 'acquired', 'grade', 'year'];                  // lo "tuyo" de cada moneda (colección)
  const DROP_FIELDS = ['country', 'period', 'imgFront', 'imgBack'];           // restos de formatos antiguos
  const NEG_TTL = 120000;                                                       // fotos no encontradas: no reintentar durante 2 min
  const LAST_UID_KEY = 'pm_last_user', ROLE_KEY = 'pm_role_';

  let sb = null, user = null, role = null, started = false, ready = false, loggingOut = false;
  let status = { state: 'off', text: 'Sin sesión' };
  let running = false, dirty = false, dirtyGen = 0, pushTimer = null, blockedDeletes = false, lastOkAt = 0, lastPullAt = 0;
  let syn = null, lastPull = null, pendingImg = null, imgRev = null;
  const negCache = new Map(), inflight = new Map();

  /* ---------- Guardado en IndexedDB ('sync') ---------- */
  function kvGet(k) { return new Promise(res => { try { const r = db.transaction('sync', 'readonly').objectStore('sync').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } }); }
  function kvPut(k, v) { return new Promise(res => { try { const tx = db.transaction('sync', 'readwrite'); tx.objectStore('sync').put(v, k); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); } catch (e) { res(false); } }); }
  function kvDel(k) { return new Promise(res => { try { const tx = db.transaction('sync', 'readwrite'); tx.objectStore('sync').delete(k); tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => res(); } catch (e) { res(); } }); }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  async function loadState() {
    await initDB();
    const uid = user ? user.id : '_';
    syn = (await kvGet('synced:' + uid)) || {};
    lastPull = (await kvGet('lastpull:' + uid)) || {};
    pendingImg = (await kvGet('pendingImg')) || {};
    imgRev = (await kvGet('imgRev')) || {};
  }
  const saveSyn = () => kvPut('synced:' + (user ? user.id : '_'), syn);
  const saveLastPull = () => kvPut('lastpull:' + (user ? user.id : '_'), lastPull);
  let tImg = null;
  function saveImgState(now) {
    clearTimeout(tImg);
    const go = () => { kvPut('pendingImg', pendingImg); kvPut('imgRev', imgRev); };
    if (now) go(); else tImg = setTimeout(go, 600);
  }

  /* ---------- Huellas ---------- */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : stable(x)).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const hashParts = (tipo, padre, datos) => cyrb53(stable([tipo, padre || null, datos]));
  const hashEntry = e => hashParts(e.tipo, e.padre, e.datos);

  /* ---------- Filas locales ---------- */
  function localCatalog() {
    const m = new Map();
    const add = (id, tipo, padre, datos) => m.set('catalogo:' + id, { tabla: 'catalogo', id, tipo, padre, datos });
    add('config:zonas', 'zona', null, { custom: customZones, order: zoneOrder, continents: zoneContinents });
    countries.forEach(c => add(c.id, 'pais', null, c));
    periods.forEach(p => { const d = { ...p }; delete d.collapsed; add(p.id, 'periodo', p.countryId, d); });   // "contraído" es de cada dispositivo
    coins.forEach(c => { const d = { ...c }; OWN_FIELDS.concat(DROP_FIELDS).forEach(k => delete d[k]); add(c.id, 'ficha', c.periodId, d); });
    return m;
  }
  function localCollection() {
    const m = new Map();
    coins.forEach(c => { if (Array.isArray(c.items) && c.items.length) m.set('coleccion:' + c.id, { tabla: 'coleccion', id: c.id, tipo: 'item', padre: c.id, datos: { items: c.items } }); });
    return m;
  }
  const toRow = e => e.tabla === 'catalogo'
    ? { id: e.id, tipo: e.tipo, padre_id: e.padre || null, datos: e.datos, eliminado: false }
    : { id: e.id, ficha_id: e.id, datos: e.datos, eliminado: false };
  function tombRow(key, rec) {
    const tabla = key.slice(0, key.indexOf(':')), id = key.slice(key.indexOf(':') + 1);
    return tabla === 'catalogo' ? { id, tipo: rec[1], padre_id: rec[2] || null, datos: {}, eliminado: true } : { id, ficha_id: id, datos: {}, eliminado: true };
  }
  function rowsBytes(rows) { let n = 0; rows.forEach(r => { n += JSON.stringify(r).length; }); return n; }
  function chunk(rows, maxRows, maxBytes) {
    const out = []; let cur = [], bytes = 0;
    rows.forEach(r => {
      const b = JSON.stringify(r).length;
      if (cur.length && (cur.length >= maxRows || bytes + b > maxBytes)) { out.push(cur); cur = []; bytes = 0; }
      cur.push(r); bytes += b;
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /* ---------- Estado visible ---------- */
  function setStatus(state, text) {
    status = { state, text: text || ({ ok: 'Sincronizado', busy: 'Sincronizando…', pending: 'Cambios por subir', offline: 'Sin conexión', error: 'Error de sincronización', paused: 'Sincronización en pausa', off: 'Sin sesión' }[state] || '') };
    paintStatus();
  }
  function paintStatus() {
    const dot = document.getElementById('sync-dot');
    if (dot) { dot.className = 'xs-dot xs-' + status.state; dot.title = status.text; }
    const acct = document.getElementById('xm-acct'), st = document.getElementById('xm-sync');
    if (acct) acct.innerHTML = user ? `<b>${esc(user.email || '')}</b>${role ? ` <span class="xs-role">${role === 'admin' ? 'admin' : 'miembro'}</span>` : ''}` : 'Sin sesión';
    if (st) {
      let when = '';
      if (lastOkAt) { const d = new Date(lastOkAt); const hoy = d.toDateString() === new Date().toDateString(); when = '<br>Última: ' + (hoy ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ') + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
      st.innerHTML = `<span class="xs-state xs-${status.state}">${esc(status.text)}</span>${when}`;
    }
  }

  /* ---------- Acceso (login) ---------- */
  function showLogin(msg) {
    ready = false;
    const o = document.getElementById('login-overlay');
    if (o) { o.classList.remove('hidden'); const e = document.getElementById('login-error'); if (e) e.textContent = msg || ''; setTimeout(() => { const i = document.getElementById('login-email'); if (i && !i.value) i.focus(); }, 50); }
    document.body.classList.add('xs-locked');
    setStatus('off');
  }
  function hideLogin() {
    const o = document.getElementById('login-overlay'); if (o) o.classList.add('hidden');
    document.body.classList.remove('xs-locked');
  }
  async function login(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    const email = (document.getElementById('login-email').value || '').trim();
    const pass = document.getElementById('login-pass').value || '';
    const err = document.getElementById('login-error'), btn = document.getElementById('login-btn');
    if (!email || !pass) { err.textContent = 'Escribe tu correo y tu contraseña.'; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      user = data.user; document.getElementById('login-pass').value = '';
      hideLogin();
      await afterLogin();
    } catch (e) {
      const m = String((e && e.message) || e);
      err.textContent = /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.' : (isNetErr(e) ? 'No hay conexión. Para entrar la primera vez hace falta internet.' : 'No se pudo entrar: ' + m);
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
  async function logout() {
    const pend = dirty || Object.keys(pendingImg || {}).length;
    if (pend && !confirm('Hay cambios que aún no se han subido a la nube. Si cierras sesión ahora seguirán guardados en este dispositivo, pero no estarán en la nube hasta que vuelvas a entrar. ¿Cerrar sesión?')) return;
    loggingOut = true;
    try { await sb.auth.signOut(); } catch (e) {}
    loggingOut = false;
    user = null; role = null; lsSet(LAST_UID_KEY, '');
    showLogin();
  }
  function isNetErr(e) {
    const m = String((e && (e.message || e.name)) || e || '');
    return !navigator.onLine || /failed to fetch|networkerror|network request|load failed|fetch|timeout|AuthRetryableFetchError|offline/i.test(m);
  }

  async function getSessionSafe() {
    try {
      const r = await Promise.race([sb.auth.getSession(), new Promise(res => setTimeout(() => res({ timeout: true }), 7000))]);
      if (r.timeout) return { session: null, unknown: true };
      if (r.error) return { session: null, unknown: isNetErr(r.error) };
      return { session: r.data && r.data.session };
    } catch (e) { return { session: null, unknown: true }; }
  }

  /* ---------- Arranque ---------- */
  async function boot(startApp) {
    API._startApp = startApp;
    sb = API._client || supabase.createClient(CFG.url, CFG.key, { auth: { storageKey: 'pm-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    API._client = sb;
    await initDB();
    const hadSession = !!lsGet('pm-auth');
    const { session, unknown } = await getSessionSafe();
    if (session) {
      user = session.user; lsSet(LAST_UID_KEY, JSON.stringify({ id: user.id, email: user.email }));
      await afterLogin();
    } else if (unknown && hadSession && lsGet(LAST_UID_KEY)) {
      try { user = JSON.parse(lsGet(LAST_UID_KEY)); } catch (e) { user = null; }
      if (user && user.id) { role = lsGet(ROLE_KEY + user.id) || null; await startLocal(); setStatus('offline', 'Sin conexión: trabajando con los datos de este dispositivo'); scheduleSync(4000); }
      else showLogin();
    } else showLogin();
    sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT' && user && !loggingOut) { user = null; role = null; showLogin('La sesión ha caducado. Vuelve a entrar.'); } });
    installTriggers();
  }
  async function startLocal() {
    await loadState();
    if (!started) { started = true; await API._startApp(); }
    ready = true; installGuards(); paintStatus();
  }
  async function afterLogin() {
    lsSet(LAST_UID_KEY, JSON.stringify({ id: user.id, email: user.email }));
    role = lsGet(ROLE_KEY + user.id) || role;
    await startLocal();
    paintStatus();
    syncNow({ pullToo: true, first: true });
  }

  /* ---------- Orquestación ---------- */
  function markDirty() { dirty = true; dirtyGen++; if (ready && user) { if (status.state === 'ok') setStatus('pending'); scheduleSync(2500); } }
  function scheduleSync(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncNow({ pullToo: false }), ms); }

  async function ensureRole() {
    try {
      const { data, error } = await sb.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
      if (error) throw error;
      role = (data && data.rol === 'admin') ? 'admin' : 'miembro';
      lsSet(ROLE_KEY + user.id, role);
    } catch (e) { if (!role) throw e; }
  }

  async function syncNow(opts) {
    opts = opts || {};
    if (running) { if (opts.pullToo) dirty = true; return; }
    if (!sb || !user || !ready) return;
    if (!navigator.onLine) { setStatus(dirty || Object.keys(pendingImg || {}).length ? 'pending' : 'offline', 'Sin conexión' + (dirty ? ': los cambios se subirán al volver' : '')); return; }
    running = true; clearTimeout(pushTimer);
    const gen = dirtyGen;
    setStatus('busy');
    try {
      const { session, unknown } = await getSessionSafe();
      if (!session) { if (unknown) throw new Error('offline'); user = null; showLogin('La sesión ha caducado. Vuelve a entrar.'); return; }
      await ensureRole();
      if (!(await ensureInit(opts.first))) return;
      await push();
      if (opts.pullToo !== false) { await pull(); lastPullAt = Date.now(); }
      if (dirtyGen === gen) dirty = false;
      lastOkAt = Date.now();
      setStatus(dirty ? 'pending' : 'ok');
      if (dirtyGen !== gen) scheduleSync(1500);
    } catch (e) {
      console.error('Sync:', e);
      if (isNetErr(e) || String(e && e.message) === 'offline') setStatus('pending', 'Sin conexión: los cambios se subirán al volver');
      else setStatus('error', 'Error: ' + String((e && e.message) || e).slice(0, 90));
      scheduleSync(60000);
    } finally { running = false; }
  }

  function installTriggers() {
    window.addEventListener('online', () => syncNow({ pullToo: true }));
    window.addEventListener('offline', () => setStatus('offline', 'Sin conexión'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user && Date.now() - lastPullAt > 60000) syncNow({ pullToo: true }); });
    setInterval(() => { if (document.visibilityState === 'visible' && user && ready && Date.now() - lastPullAt > 180000) syncNow({ pullToo: true }); }, 60000);
    window.addEventListener('beforeunload', e => { if (dirty && user) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* ---------- Primera sincronización de este dispositivo ---------- */
  async function ensureInit(first) {
    const flag = 'init:' + user.id;
    if (await kvGet(flag)) return true;
    const hasLocal = (coins.length + countries.length + periods.length) > 0;
    const { count, error } = await sb.from('catalogo').select('id', { count: 'exact', head: true }).eq('eliminado', false);
    if (error) throw error;
    if (count > 0 && hasLocal) {
      const useCloud = confirm('La nube ya tiene un catálogo guardado y este dispositivo también tiene datos propios.\n\nAceptar: sustituir los datos de ESTE dispositivo por los de la nube (recomendado). Antes se descargará una copia de seguridad por si acaso.\n\nCancelar: ver otras opciones.');
      if (useCloud) {
        setStatus('busy', 'Guardando copia de seguridad…');
        try { await exportBackup(); } catch (e) { console.warn('Copia previa:', e); }
        await wipeLocal();
      } else if (role === 'admin' && confirm('¿Subir los datos de ESTE dispositivo a la nube?\n\nSe mezclarán con los de la nube: lo que coincida se sobrescribe con lo de este dispositivo y lo que solo esté en la nube se conserva.')) {
        /* sigue: se sube lo local y luego se baja lo que falte */
      } else {
        setStatus('paused', 'Sincronización en pausa: no se ha tocado nada. Vuelve a abrir la app para decidir.');
        return false;
      }
    }
    await kvPut(flag, Date.now());
    return true;
  }
  async function wipeLocal() {
    coins = []; countries = []; periods = []; customZones = []; zoneOrder = []; zoneContinents = {};
    saveZonesLocal();
    await saveAllDataToDBRaw({ coins: [], countries: [], periods: [] }, { clearImages: true });
    syn = {}; lastPull = {}; pendingImg = {}; imgRev = {};
    await Promise.all([saveSyn(), saveLastPull()]); saveImgState(true);
    imgUrlCache.forEach((u, k) => forgetImageUrl(k));
    currentCountryId = null; albumPeriodId = ''; activeCoinId = null;
    render();
  }
  function saveZonesLocal() {
    lsSet('numis_custom_zones', JSON.stringify(customZones));
    lsSet('numis_zone_order', JSON.stringify(zoneOrder));
    lsSet('numis_zone_continents', JSON.stringify(zoneContinents));
  }

  /* ---------- SUBIR ---------- */
  async function prepareImages() {
    const changed = [];
    coins.forEach(c => {
      [['hasFront', 'imgFrontRev', 'front'], ['hasBack', 'imgBackRev', 'back']].forEach(([flag, field, side]) => {
        if (c[flag] && !c[field]) {
          c[field] = 1; imgRev[c.id + ':' + side] = 1;
          pendingImg[c.id + ':' + side] = { op: 'put', rev: 1 };
          if (!changed.includes(c)) changed.push(c);
        }
      });
    });
    if (changed.length) { await putCoinsToDBRaw(changed); saveImgState(true); }
  }

  async function push() {
    const admin = role === 'admin';
    if (admin) await prepareImages();
    const desired = new Map(localCollection());
    if (admin) localCatalog().forEach((v, k) => desired.set(k, v));
    const rows = { catalogo: [], coleccion: [] }, keyOf = new Map(), newRec = new Map(), tombs = [];
    desired.forEach((e, k) => {
      const h = hashEntry(e);
      if (!syn[k] || syn[k][0] !== h) { const r = toRow(e); rows[e.tabla].push(r); keyOf.set(r, k); newRec.set(k, [h, e.tipo, e.padre || null, h]); }
    });
    Object.keys(syn).forEach(k => {
      if (desired.has(k)) return;
      const tabla = k.slice(0, k.indexOf(':'));
      if (tabla === 'catalogo' && !admin) return;
      const r = tombRow(k, syn[k]); rows[tabla].push(r); keyOf.set(r, k); tombs.push(k);
    });
    // Freno de seguridad: muchos borrados de golpe casi siempre son un accidente
    const total = Object.keys(syn).length;
    if (tombs.length > 25 && tombs.length > total * 0.25 && !blockedDeletes) {
      const ok = confirm(`Se van a BORRAR ${tombs.length} elementos de la nube (fichas, períodos, países o ejemplares marcados).\n\n¿Es lo que quieres? Si no, pulsa Cancelar y no se borrará nada de la nube (conviene entonces restaurar una copia de seguridad en este dispositivo).`);
      if (!ok) { blockedDeletes = true; throw new Error('Borrado masivo cancelado: la nube no se ha tocado.'); }
    } else if (blockedDeletes && tombs.length) {
      throw new Error('Borrado masivo cancelado: la nube no se ha tocado.');
    }
    for (const tabla of ['catalogo', 'coleccion']) {
      const list = rows[tabla]; if (!list.length) continue;
      let done = 0;
      for (const part of chunk(list, 200, 1500000)) {
        const { error } = await sb.from(tabla).upsert(part, { onConflict: 'id' });
        if (error) throw error;
        part.forEach(r => { const k = keyOf.get(r); if (r.eliminado) delete syn[k]; else syn[k] = newRec.get(k); });
        done += part.length;
        if (list.length > 200) setStatus('busy', `Subiendo ${tabla === 'catalogo' ? 'catálogo' : 'colección'} ${done}/${list.length}`);
      }
      await saveSyn();
    }
    blockedDeletes = false;
    if (admin) await pushImages();
    else if (Object.keys(pendingImg).length) { pendingImg = {}; saveImgState(true); }
  }

  const splitKey = key => { const i = key.lastIndexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; };
  async function listFiles(st, coinId) { const { data } = await st.list(coinId, { limit: 100 }); return (data || []).map(f => f.name); }
  async function removeFiles(st, coinId, side) {
    const names = (await listFiles(st, coinId)).filter(n => side === '*' || n.startsWith(side + '-'));
    if (names.length) await st.remove(names.map(n => coinId + '/' + n));
  }
  function limiter(n) {
    let active = 0; const q = [];
    const next = () => { if (active >= n || !q.length) return; active++; const { fn, res, rej } = q.shift(); fn().then(res, rej).finally(() => { active--; next(); }); };
    return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
  }
  async function pushImages() {
    const keys = Object.keys(pendingImg); if (!keys.length) return;
    const st = sb.storage.from(CFG.bucket), up = limiter(4);
    let done = 0, failed = 0, firstErr = null;
    await Promise.all(keys.map(key => up(async () => {
      const e = pendingImg[key]; const [coinId, side] = splitKey(key);
      try {
        if (e.op === 'put') {
          const blob = await rawGetImage(key);
          if (blob) {
            const name = `${side}-${e.rev}.webp`;
            const { error } = await st.upload(`${coinId}/${name}`, blob, { upsert: true, contentType: blob.type || 'image/webp', cacheControl: '31536000' });
            if (error) throw error;
            try { (await listFiles(st, coinId)).filter(n => n.startsWith(side + '-') && n !== name).forEach(n => st.remove([coinId + '/' + n])); } catch (e2) {}
            imgRev[key] = e.rev;
          }
        } else { await removeFiles(st, coinId, side); }
        if (pendingImg[key] === e) delete pendingImg[key];
      } catch (err) { failed++; firstErr = firstErr || err; }
      done++;
      if (keys.length > 8) setStatus('busy', `Subiendo imágenes ${done}/${keys.length}`);
    })));
    saveImgState(true);
    if (failed) throw firstErr;
  }

  /* ---------- BAJAR ---------- */
  async function fetchRows(tabla, since, page) {
    const out = []; let from = 0;
    for (;;) {
      let q = sb.from(tabla).select('*').order('actualizado', { ascending: true }).order('id', { ascending: true }).range(from, from + page - 1);
      if (since) q = q.gte('actualizado', since);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...data);
      if (data.length < page) break;
      from += page;
    }
    return out;
  }
  const sinceOf = tabla => lastPull[tabla] ? new Date(Date.parse(lastPull[tabla]) - 10 * 60000).toISOString() : null;   // solapamiento de 10 min por si otra subida tarda en confirmarse
  const maxStamp = (rows, prev) => rows.reduce((m, r) => (!m || Date.parse(r.actualizado) > Date.parse(m)) ? r.actualizado : m, prev || null);

  async function pull() {
    const cat = await fetchRows('catalogo', sinceOf('catalogo'), 300);
    const col = await fetchRows('coleccion', sinceOf('coleccion'), 500);
    const touchedKeys = [];
    let metaChanged = false, zonesChanged = false;
    const coinMap = new Map(coins.map(c => [c.id, c]));
    const changedCoins = new Set(), removed = [];
    const same = (k, h) => syn[k] && syn[k][3] === h;

    // catálogo: zonas → países → períodos → fichas
    const order = { zona: 0, pais: 1, periodo: 2, ficha: 3 };
    cat.sort((a, b) => (order[a.tipo] ?? 9) - (order[b.tipo] ?? 9));
    for (const r of cat) {
      const k = 'catalogo:' + r.id;
      const h = r.eliminado ? 'x' : hashParts(r.tipo, r.padre_id, r.datos);
      if (r.eliminado ? !syn[k] && !existsLocal(r, coinMap) : same(k, h)) { continue; }
      touchedKeys.push([k, r.eliminado ? null : h, r]);
      if (r.tipo === 'zona') {
        if (!r.eliminado) { const d = r.datos || {}; customZones = Array.isArray(d.custom) ? d.custom : []; zoneOrder = Array.isArray(d.order) ? d.order : []; zoneContinents = (d.continents && typeof d.continents === 'object') ? d.continents : {}; zonesChanged = true; }
      } else if (r.tipo === 'pais') {
        countries = countries.filter(c => c.id !== r.id); metaChanged = true;
        if (!r.eliminado) countries.push({ ...r.datos, id: r.id });
      } else if (r.tipo === 'periodo') {
        const old = periods.find(p => p.id === r.id);
        periods = periods.filter(p => p.id !== r.id); metaChanged = true;
        if (!r.eliminado) periods.push({ ...r.datos, id: r.id, collapsed: old ? !!old.collapsed : false });
      } else if (r.tipo === 'ficha') {
        const old = coinMap.get(r.id);
        if (r.eliminado) { if (old) { coinMap.delete(r.id); removed.push(r.id); } }
        else {
          const nc = { ...r.datos, id: r.id, items: old && Array.isArray(old.items) ? old.items : [] };
          if (old) { if ((old.imgFrontRev || 0) !== (nc.imgFrontRev || 0)) forgetImageUrl(imgKey(r.id, 'front')); if ((old.imgBackRev || 0) !== (nc.imgBackRev || 0)) forgetImageUrl(imgKey(r.id, 'back')); }
          coinMap.set(r.id, nc); changedCoins.add(r.id);
        }
      }
    }
    // colección: los ejemplares marcados
    for (const r of col) {
      const k = 'coleccion:' + r.id;
      const h = r.eliminado ? 'x' : hashParts('item', r.ficha_id, r.datos);
      if (r.eliminado ? !syn[k] && !(coinMap.get(r.ficha_id) || {}).items?.length : same(k, h)) continue;
      const c = coinMap.get(r.ficha_id);
      touchedKeys.push([k, r.eliminado ? null : h, r]);
      if (!c) continue;
      c.items = r.eliminado ? [] : (Array.isArray(r.datos && r.datos.items) ? r.datos.items : []);
      changedCoins.add(c.id);
    }

    if (touchedKeys.length) {
      coins = Array.from(coinMap.values());
      normalizeCoins();
      if (zonesChanged) saveZonesLocal();
      if (metaChanged) await putMetaToDBRaw(countries, periods);
      const list = coins.filter(c => changedCoins.has(c.id));
      if (list.length) await putCoinsToDBRaw(list);
      for (const id of removed) { forgetImageUrl(imgKey(id, 'front')); forgetImageUrl(imgKey(id, 'back')); await deleteCoinFromDBRaw(id); delete imgRev[id + ':front']; delete imgRev[id + ':back']; }
      // anota lo que ya está en común para no volver a subirlo ni a bajarlo
      const lc = localCatalog(), lcol = localCollection();
      for (const [k, h, r] of touchedKeys) {
        const e = lc.get(k) || lcol.get(k);
        if (h === null || !e) { delete syn[k]; continue; }
        syn[k] = [hashEntry(e), e.tipo, e.padre || null, h];
      }
      await saveSyn(); saveImgState();
      render();
    }
    lastPull.catalogo = maxStamp(cat, lastPull.catalogo);
    lastPull.coleccion = maxStamp(col, lastPull.coleccion);
    await saveLastPull();
  }
  function existsLocal(r, coinMap) {
    if (r.tipo === 'pais') return countries.some(c => c.id === r.id);
    if (r.tipo === 'periodo') return periods.some(p => p.id === r.id);
    if (r.tipo === 'ficha') return coinMap.has(r.id);
    return false;
  }

  /* ---------- Enganches en la capa de datos (no se toca el resto de la app) ---------- */
  const putCoinsToDBRaw = putCoinsToDB, putMetaToDBRaw = putMetaToDB, deleteCoinFromDBRaw = deleteCoinFromDB, saveAllDataToDBRaw = saveAllDataToDB;
  const rawPutImage = dbPutImage, rawDelImage = dbDeleteImage, rawGetImage = dbGetImage;
  const wrap = (name, after) => {
    const orig = window[name];
    window[name] = function (...args) {
      const r = orig.apply(this, args);
      if (r && typeof r.then === 'function') return r.then(v => { after(args); return v; });
      after(args); return r;
    };
  };
  function installHooks() {
    wrap('putCoinsToDB', () => markDirty());
    wrap('putMetaToDB', () => markDirty());
    wrap('saveAllDataToDB', () => markDirty());
    wrap('saveCustomZones', () => markDirty());
    wrap('saveZoneOrder', () => markDirty());
    wrap('saveZoneContinents', () => markDirty());
    window.deleteCoinFromDB = function (id) {
      const r = deleteCoinFromDBRaw(id);
      if (role !== 'miembro') { Object.keys(pendingImg || {}).forEach(k => { if (k.startsWith(id + ':')) delete pendingImg[k]; }); if (pendingImg) pendingImg[id + ':*'] = { op: 'del' }; saveImgState(); }
      markDirty(); return r;
    };
    window.dbPutImage = function (key, blob) {
      if (role !== 'miembro' && pendingImg) {
        const [coinId, side] = splitKey(key), c = coins.find(x => x.id === coinId), rev = Date.now();
        if (c) c[side === 'front' ? 'imgFrontRev' : 'imgBackRev'] = rev;
        pendingImg[key] = { op: 'put', rev }; imgRev[key] = rev; saveImgState();
      }
      return rawPutImage(key, blob).then(v => { markDirty(); return v; });
    };
    window.dbDeleteImage = function (key) {
      if (role !== 'miembro' && pendingImg) { pendingImg[key] = { op: 'del' }; delete imgRev[key]; saveImgState(); }
      return rawDelImage(key).then(v => { markDirty(); return v; });
    };
    // Lectura de fotos: primero la copia local; si falta o está anticuada, se baja de la nube
    window.dbGetImage = async function (key) {
      const local = await rawGetImage(key);
      if (!user || !sb || !ready || !navigator.onLine) return local;
      const [coinId, side] = splitKey(key), c = coins.find(x => x.id === coinId);
      const rev = c ? c[side === 'front' ? 'imgFrontRev' : 'imgBackRev'] : 0;
      if (!rev || !c[side === 'front' ? 'hasFront' : 'hasBack']) return local;
      if (local && (imgRev[key] === rev || (pendingImg && pendingImg[key]))) return local;
      const fromCloud = await downloadImage(key, coinId, side, rev);
      return fromCloud || local;
    };
  }
  const dl = limiter(5);
  function downloadImage(key, coinId, side, rev) {
    const nk = key + '#' + rev;
    if (negCache.has(nk) && Date.now() - negCache.get(nk) < NEG_TTL) return Promise.resolve(null);
    if (inflight.has(nk)) return inflight.get(nk);
    const p = dl(async () => {
      try {
        const { data, error } = await sb.storage.from(CFG.bucket).download(`${coinId}/${side}-${rev}.webp`);
        if (error || !data) { negCache.set(nk, Date.now()); return null; }
        await rawPutImage(key, data);
        imgRev[key] = rev; saveImgState();
        return data;
      } catch (e) { negCache.set(nk, Date.now()); return null; }
    }).finally(() => inflight.delete(nk));
    inflight.set(nk, p);
    return p;
  }

  /* ---------- Solo el administrador edita el catálogo ---------- */
  function installGuards() {
    if (installGuards.done) return; installGuards.done = true;
    const guard = (name, silent) => {
      const f = window[name]; if (typeof f !== 'function') return;
      window[name] = function (...a) {
        if (role === 'miembro') { if (!silent) alert('Solo el administrador puede editar el catálogo. Tú puedes marcar tus monedas.'); return; }
        return f.apply(this, a);
      };
    };
    ['openCreateModal', 'openEditCountryModal', 'openAddPeriodModal', 'openEditPeriodModal', 'openEditZoneModal', 'openImportModal', 'openAdvancedEditFromModal', 'addZone', 'toggleAddZoneRow', 'importBackup'].forEach(n => guard(n));
    guard('zoneDragStart', true);
  }

  installHooks();
  Object.assign(API._test, { localCatalog, localCollection, hashEntry, hashParts, stable, push, pull, getSyn: () => syn, getPending: () => pendingImg, loadState, ensureInit, setUser: u => { user = u; }, setRole: r => { role = r; }, setReady: v => { ready = v; } });
})();
