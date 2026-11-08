/* ===== MAPA MUNDIAL (pestaña Estadísticas) =====
   Pinta todos los países del mundo y colorea los que tienen monedas: cuantas más, más oscuro (colores del tema activo).
   Las fronteras salen del paquete "world-atlas" (Natural Earth, TopoJSON). Se descargan de internet la primera vez y el
   service worker las guarda, así que después funcionan sin conexión. Aquí se decodifican y se proyectan (Natural Earth). */
const WORLD_URLS = [
  'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json',
  'https://unpkg.com/world-atlas@2.0.2/countries-50m.json'
];
// código numérico ISO → código de 2 letras (Kosovo no tiene numérico: se identifica por su nombre)
const ISO_NUM2A2 = (() => { const m = {}; '004:AF,008:AL,010:AQ,012:DZ,016:AS,020:AD,024:AO,028:AG,031:AZ,032:AR,036:AU,040:AT,044:BS,048:BH,050:BD,051:AM,052:BB,056:BE,060:BM,064:BT,068:BO,070:BA,072:BW,074:BV,076:BR,084:BZ,086:IO,090:SB,092:VG,096:BN,100:BG,104:MM,108:BI,112:BY,116:KH,120:CM,124:CA,132:CV,136:KY,140:CF,144:LK,148:TD,152:CL,156:CN,158:TW,162:CX,166:CC,170:CO,174:KM,175:YT,178:CG,180:CD,184:CK,188:CR,191:HR,192:CU,196:CY,203:CZ,204:BJ,208:DK,212:DM,214:DO,218:EC,222:SV,226:GQ,231:ET,232:ER,233:EE,234:FO,238:FK,239:GS,242:FJ,246:FI,248:AX,250:FR,254:GF,258:PF,260:TF,262:DJ,266:GA,268:GE,270:GM,275:PS,276:DE,288:GH,292:GI,296:KI,300:GR,304:GL,308:GD,312:GP,316:GU,320:GT,324:GN,328:GY,332:HT,334:HM,336:VA,340:HN,344:HK,348:HU,352:IS,356:IN,360:ID,364:IR,368:IQ,372:IE,376:IL,380:IT,384:CI,388:JM,392:JP,398:KZ,400:JO,404:KE,408:KP,410:KR,414:KW,417:KG,418:LA,422:LB,426:LS,428:LV,430:LR,434:LY,438:LI,440:LT,442:LU,446:MO,450:MG,454:MW,458:MY,462:MV,466:ML,470:MT,474:MQ,478:MR,480:MU,484:MX,492:MC,496:MN,498:MD,499:ME,500:MS,504:MA,508:MZ,512:OM,516:NA,520:NR,524:NP,528:NL,531:CW,533:AW,534:SX,535:BQ,540:NC,548:VU,554:NZ,558:NI,562:NE,566:NG,570:NU,574:NF,578:NO,580:MP,581:UM,583:FM,584:MH,585:PW,586:PK,591:PA,598:PG,600:PY,604:PE,608:PH,612:PN,616:PL,620:PT,624:GW,626:TL,630:PR,634:QA,638:RE,642:RO,643:RU,646:RW,652:BL,654:SH,659:KN,660:AI,662:LC,663:MF,666:PM,670:VC,674:SM,678:ST,682:SA,686:SN,688:RS,690:SC,694:SL,702:SG,703:SK,704:VN,705:SI,706:SO,710:ZA,716:ZW,724:ES,728:SS,729:SD,732:EH,740:SR,744:SJ,748:SZ,752:SE,756:CH,760:SY,762:TJ,764:TH,768:TG,772:TK,776:TO,780:TT,784:AE,788:TN,792:TR,795:TM,796:TC,798:TV,800:UG,804:UA,807:MK,818:EG,826:GB,831:GG,832:JE,833:IM,834:TZ,840:US,850:VI,854:BF,858:UY,860:UZ,862:VE,876:WF,882:WS,887:YE,894:ZM'.split(',').forEach(p => { m[p.slice(0, 3)] = p.slice(4); }); m['Kosovo'] = 'XK'; return m; })();
const ISO_A22NUM = (() => { const m = {}; Object.keys(ISO_NUM2A2).forEach(k => { m[ISO_NUM2A2[k]] = k; }); return m; })();
// Estados históricos sin país actual: suman al territorio que hoy ocupa su parte principal
const HISTORIC_TO_A2 = { 'urss': 'RU', 'union sovietica': 'RU', 'imperio ruso': 'RU', 'yugoslavia': 'RS', 'checoslovaquia': 'CZ', 'rda': 'DE', 'alemania oriental': 'DE',
  'prusia': 'DE', 'sacro imperio romano': 'DE', 'rodesia': 'ZW', 'zaire': 'CD', 'austria hungria': 'AT', 'imperio austrohungaro': 'AT', 'imperio otomano': 'TR', 'imperio romano': 'IT' };

let worldMap = null, worldMapLoading = null, worldMapError = false;
let statsMapView = null;   // zona visible del mapa en coordenadas del lienzo: { x, y, w } (null = todo el mundo)
const MAP_MAXZ = 8;        // zoom máximo
let statsMapSel = '';      // país tocado
let statsMapData = null;   // { byKey, unplaced } del último pintado

// Proyección Natural Earth (la de d3.geoNaturalEarth1): grados → plano
function neProject(lon, lat) {
  const l = lon * Math.PI / 180, f = lat * Math.PI / 180, f2 = f * f, f4 = f2 * f2;
  return [l * (0.8707 - 0.131979 * f2 + f4 * (-0.013791 + f4 * (0.003971 * f2 - 0.001529 * f4))),
    -f * (1.007226 + f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4)))];
}

// TopoJSON → [{ key, name, d, cx, cy, size }] en un lienzo de 1000 de ancho
function buildWorld(topo) {
  const obj = topo.objects.countries || topo.objects[Object.keys(topo.objects)[0]];
  const tr = topo.transform;
  const arcs = topo.arcs.map(a => {
    let x = 0, y = 0;
    return a.map(p => { if (tr) { x += p[0]; y += p[1]; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; } return [p[0], p[1]]; });
  });
  const ringPts = idx => {
    const pts = [];
    idx.forEach(i => {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
    });
    return pts;
  };
  const XE = neProject(180, 0)[0];   // el mapa ocupa de -180° a 180°: el ancho sale del ecuador
  let minY = Infinity, maxY = -Infinity;
  const feats = [];
  obj.geometries.forEach(g => {
    const name = (g.properties && g.properties.name) || '';
    if (String(g.id) === '010' || name === 'Antarctica') return;   // la Antártida no es un país y estorba
    const key = g.id != null && g.id !== '' ? String(g.id).padStart(3, '0') : name;
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    const rings = [];
    polys.forEach(poly => poly.forEach(r => {
      // Un contorno que cruza la línea de fecha (Rusia, Fiyi…) salta de +180° a -180°: se "desenrolla" para que sea continuo
      // y se dibuja también desplazado una vuelta, de modo que el trozo que se sale por un borde reaparece en el otro.
      const un = []; let prev = null, off = 0, lo = Infinity, hi = -Infinity;
      ringPts(r).forEach(pt => {
        let lon = pt[0] + off;
        if (prev !== null) { while (lon - prev > 180) { lon -= 360; off -= 360; } while (prev - lon > 180) { lon += 360; off += 360; } }
        prev = lon; un.push([lon, pt[1]]);
        if (lon < lo) lo = lon; if (lon > hi) hi = lon;
      });
      const offs = [0]; if (hi > 180) offs.push(-360); if (lo < -180) offs.push(360);
      offs.forEach(o => {
        const pr = un.map(pt => neProject(pt[0] + o, pt[1]));
        pr.forEach(q => { if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; });
        rings.push({ pr, base: o === 0 });
      });
    }));
    if (rings.length) feats.push({ key, name, rings });
  });
  const minX = -XE, k = 1000 / (2 * XE), W = 1000, H = (maxY - minY) * k;
  const out = feats.map(f => {
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, d = '';
    f.rings.forEach(({ pr, base }) => {
      let last = '';
      const seg = [];
      pr.forEach(p => {
        const x = +((p[0] - minX) * k).toFixed(1), y = +((p[1] - minY) * k).toFixed(1), s = x + ',' + y;
        if (s === last) return; last = s; seg.push(s);
        if (base) { const cx = Math.min(W, Math.max(0, x)); if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      });
      if (seg.length > 2) d += 'M' + seg.join('L') + 'Z';
    });
    return { key: f.key, name: f.name, d, cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2, size: Math.max(bx1 - bx0, by1 - by0) };
  }).filter(f => f.d);
  return { feats: out, W, H };
}

function loadWorldMap() {
  if (worldMap) return Promise.resolve(worldMap);
  if (worldMapLoading) return worldMapLoading;
  worldMapError = false;
  worldMapLoading = (async () => {
    let lastErr;
    for (const u of WORLD_URLS) {
      try {
        const r = await fetch(u);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        worldMap = buildWorld(await r.json());
        return worldMap;
      } catch (e) { lastErr = e; }
    }
    worldMapError = true; throw lastErr;
  })().finally(() => { worldMapLoading = null; });
  return worldMapLoading;
}

// Monedas por país del mapa: { clave: { n, ids: [idsDePaísDeLaApp] } } + los países que no se han podido ubicar
function mapCountsByKey(byCountry) {
  const byKey = {}, unplaced = [];
  countries.forEach(c => {
    const n = byCountry[c.id] || 0;
    let a2 = (typeof flagCode === 'function' ? flagCode(c) : '').slice(0, 2).toUpperCase();
    if (!a2 && typeof flagLookup === 'function') a2 = HISTORIC_TO_A2[flagLookup(c.name).key] || '';
    const key = a2 ? ISO_A22NUM[a2] : '';
    if (!key) { if (n) unplaced.push(prettyName(c.name)); return; }
    const e = (byKey[key] ||= { n: 0, ids: [] });
    e.n += n; if (n) e.ids.push(c.id);
  });
  return { byKey, unplaced };
}

// Degradado del tema: arena (poco) → naranja → ciruela (mucho). t entre 0 y 1
function mapColor(t) {
  return t <= 0.5 ? `color-mix(in srgb, var(--xp-orange) ${Math.round(t * 200)}%, var(--xp-sand))`
    : `color-mix(in srgb, var(--xp-plum) ${Math.round((t - 0.5) * 200)}%, var(--xp-orange))`;
}
const mapT = (n, max) => 0.14 + 0.86 * Math.sqrt(n / max);

function regionName(key, fallback) {
  const a2 = ISO_NUM2A2[key];
  try { if (a2) return new Intl.DisplayNames(['es'], { type: 'region' }).of(a2) || fallback; } catch (e) {}
  return fallback;
}

function statsMapInner() {
  if (worldMapError) return `<div class="xp-empty-msg" style="padding:24px 0">No se pudo cargar el mapa (la primera vez hace falta conexión).<br><button onclick="retryStatsMap()" class="xs-btn2" style="margin-top:12px"><i class="fa-solid fa-rotate-right mr-1"></i>Reintentar</button></div>`;
  if (!worldMap) return `<div class="xp-empty-msg" style="padding:24px 0"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Cargando mapa…</div>`;
  const { byKey, unplaced } = mapCountsByKey((statsMapData && statsMapData.byCountry) || {});
  statsMapData = { ...(statsMapData || {}), byKey, unplaced, names: {} };
  const vals = Object.values(byKey).map(e => e.n), max = Math.max(1, ...vals), have = vals.filter(n => n > 0).length;
  let paths = '', dots = '';
  worldMap.feats.forEach(f => {
    const e = byKey[f.key], n = e ? e.n : 0, sel = statsMapSel === f.key ? ' xm-sel' : '';
    statsMapData.names[f.key] = f.name;
    if (n > 0) {
      const fill = mapColor(mapT(n, max));
      paths += `<path class="xm-c${sel}" data-k="${esc(f.key)}" d="${f.d}" style="fill:${fill}"/>`;
      if (f.size < 7) dots += `<circle class="xm-c xm-dot${sel}" data-k="${esc(f.key)}" cx="${f.cx.toFixed(1)}" cy="${f.cy.toFixed(1)}" r="5.5" style="fill:${fill}"/>`;   // países diminutos: un punto para que se vean
    } else paths += `<path class="xm-c xm-0${sel}" data-k="${esc(f.key)}" d="${f.d}"/>`;
  });
  const legend = `<div class="xm-legend"><span class="xm-sw0"></span><span>Sin monedas</span><span class="xm-sp"></span><span>1</span><i class="xm-bar" style="background:linear-gradient(90deg,${mapColor(mapT(1, max))},var(--xp-orange),var(--xp-plum))"></i><span>${fmtN(max, 0)}</span></div>`;
  const v = mapViewNow();
  return `
    <div class="xm-tools"><span id="stats-map-cap" class="xm-cap">${have ? `${have} ${have === 1 ? 'país con monedas' : 'países con monedas'} · toca uno para ver el detalle` : 'Aún no hay monedas con país en el mapa'}</span>
      <span class="xm-zoom"><button onclick="zoomStatsMap(1/1.6)" aria-label="Alejar"><i class="fa-solid fa-minus"></i></button><button onclick="zoomStatsMap(1.6)" aria-label="Acercar"><i class="fa-solid fa-plus"></i></button></span></div>
    <div class="xm-scroll"><svg id="stats-map-svg" viewBox="${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${(v.w * worldMap.H / worldMap.W).toFixed(1)}" role="img" aria-label="Mapa mundial con los países de tu colección">${paths}${dots}</svg></div>
    ${legend}
    ${unplaced.length ? `<p class="xs-hint" style="margin-top:8px">Sin ubicar en el mapa: ${unplaced.map(esc).join(', ')}. Pon su código de bandera en «Editar país» para que aparezcan.</p>` : ''}`;
}

/* ----- Zoom y desplazamiento: pellizcar (o Ctrl + rueda) para ampliar, arrastrar para moverse ----- */
function mapViewNow() { return statsMapView || { x: 0, y: 0, w: worldMap.W }; }
function clampMapView(v) {
  const W = worldMap.W, H = worldMap.H;
  v.w = Math.min(W, Math.max(W / MAP_MAXZ, v.w));
  const h = v.w * H / W;
  v.x = Math.min(W - v.w, Math.max(0, v.x)); v.y = Math.min(H - h, Math.max(0, v.y));
  return v;
}
function applyMapView() {
  const svg = document.getElementById('stats-map-svg'); if (!svg || !worldMap) return;
  const v = statsMapView = clampMapView({ ...mapViewNow() }), W = worldMap.W, H = worldMap.H, zoom = W / v.w;
  svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${(v.w * H / W).toFixed(2)}`);
  svg.classList.toggle('xm-zoomed', zoom > 1.001);   // ampliado: un dedo mueve el mapa; sin ampliar: sigue desplazándose la página
  const r = (5.5 / Math.pow(zoom, 0.6)).toFixed(2);
  svg.querySelectorAll('.xm-dot').forEach(c => c.setAttribute('r', r));
  const b = document.querySelectorAll('#stats-map-box .xm-zoom button');
  if (b[0]) b[0].disabled = zoom <= 1.001; if (b[1]) b[1].disabled = zoom >= MAP_MAXZ - 0.001;
}
// Cambia el zoom manteniendo fijo el punto (fx, fy) (fracciones 0–1 del recuadro del mapa)
function zoomStatsMap(factor, fx = 0.5, fy = 0.5) {
  if (!worldMap) return;
  const v = { ...mapViewNow() }, W = worldMap.W, H = worldMap.H;
  const nw = Math.min(W, Math.max(W / MAP_MAXZ, v.w / factor));
  const px = v.x + fx * v.w, py = v.y + fy * (v.w * H / W);
  statsMapView = { x: px - fx * nw, y: py - fy * (nw * H / W), w: nw };
  applyMapView();
}

function attachMapGestures(svg) {
  const ptrs = new Map(); let moved = 0, prevD = 0, prevMid = null;
  const rect = () => svg.getBoundingClientRect();
  const mid = () => { const a = [...ptrs.values()]; return a.length === 2 ? { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) } : a.length === 1 ? { x: a[0].x, y: a[0].y, d: 0 } : null; };
  const pan = (dx, dy) => {   // dx, dy en píxeles de pantalla
    const r = rect(), v = { ...mapViewNow() };
    v.x -= dx * v.w / r.width; v.y -= dy * v.w / r.width;
    statsMapView = v; applyMapView();
  };
  const onMove = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = mid(); if (!m || !prevMid) return;
    const dx = m.x - prevMid.x, dy = m.y - prevMid.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2 && prevD > 0) { const r = rect(); zoomStatsMap(m.d / prevD, (m.x - r.left) / r.width, (m.y - r.top) / r.height); moved += 10; }
    if (moved > 6 || ptrs.size === 2) pan(dx, dy);   // (con un solo dedo y sin ampliar no se mueve nada: el mapa ya cabe entero)
    prevMid = { x: m.x, y: m.y }; prevD = m.d;
  };
  const onUp = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); setTimeout(() => { svg.dataset.drag = ''; }, 0); }
    else { const m = mid(); prevMid = m ? { x: m.x, y: m.y } : null; prevD = m ? m.d : 0; }
  };
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ptrs.size === 0) { moved = 0; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp); }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = mid(); prevMid = m ? { x: m.x, y: m.y } : null; prevD = m ? m.d : 0;
  });
  svg.addEventListener('click', e => { if (moved > 6) { e.stopImmediatePropagation(); moved = 0; } }, true);   // un arrastre no cuenta como toque
  svg.addEventListener('wheel', e => {   // Ctrl + rueda (o pellizco del panel táctil del portátil)
    if (!e.ctrlKey) return;
    e.preventDefault();
    const r = rect(); zoomStatsMap(Math.exp(-e.deltaY * 0.01), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
}

function paintStatsMap() {
  const box = document.getElementById('stats-map-box'); if (!box) return;
  box.innerHTML = statsMapInner();
  const svg = document.getElementById('stats-map-svg'); if (!svg) return;
  attachMapGestures(svg);
  applyMapView();
  svg.addEventListener('click', e => {
    const t = e.target.closest('[data-k]'); if (!t) return;
    statsMapSel = statsMapSel === t.dataset.k ? '' : t.dataset.k;
    svg.querySelectorAll('.xm-sel').forEach(x => x.classList.remove('xm-sel'));
    const cap = document.getElementById('stats-map-cap'); if (!cap) return;
    if (!statsMapSel) { paintStatsMap(); return; }
    svg.querySelectorAll(`[data-k="${CSS.escape(statsMapSel)}"]`).forEach(x => x.classList.add('xm-sel'));
    const k = statsMapSel, e2 = (statsMapData.byKey || {})[k], n = e2 ? e2.n : 0, nm = regionName(k, (statsMapData.names || {})[k] || k);
    cap.innerHTML = n && e2.ids.length
      ? `<b>${esc(nm)}</b> · ${n} ${n === 1 ? 'moneda' : 'monedas'} <button class="xm-go" onclick="jumpToCountry('${jsArg(e2.ids[0])}')">Ver <i class="fa-solid fa-arrow-right"></i></button>`
      : `<b>${esc(nm)}</b> · sin monedas`;
  });
}

function ensureWorldMap() {
  if (worldMap) { paintStatsMap(); return; }
  loadWorldMap().then(paintStatsMap).catch(paintStatsMap);
}
function retryStatsMap() { worldMapError = false; paintStatsMap(); ensureWorldMap(); }
