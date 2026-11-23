/* ===== COPIAS DE SEGURIDAD =====
   Formato v2: { version: 2, countries, periods, coins } con las imágenes incrustadas (base64).
   Se siguen aceptando copias v1 (monedas con país/período en texto + preferences). */
async function exportBackup() {
  // v8.54: fotos leídas varias a la vez, progreso en un cartel flotante visible y marcas hasFront/hasBack coherentes con lo exportado
  let toast = document.getElementById('bk-progress');
  if (!toast) { toast = document.createElement('div'); toast.id = 'bk-progress'; toast.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:300;padding:10px 18px;border-radius:999px;background:#2b1b2e;color:#fff;font:700 13px Inter,system-ui,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.45);max-width:90vw;text-align:center'; document.body.appendChild(toast); }
  const say = t => { toast.textContent = t; toast.style.display = 'block'; };
  try {
    const stored = await getAllFromStore('coins');
    const parts = [`{"version":2,"date":${JSON.stringify(new Date().toISOString())},"countries":${JSON.stringify(countries)},"periods":${JSON.stringify(periods)},"zones":${JSON.stringify(customZones)},"zoneOrder":${JSON.stringify(zoneOrder)},"zoneContinents":${JSON.stringify(zoneContinents)},"coins":[`];
    const total = stored.length, texts = new Array(total);
    let next = 0, done = 0, missing = 0;
    const one = async idx => {
      const c = stored[idx];
      const copy = { ...c, country: coinCountryName(c), period: coinPeriodName(c) };  // nombres solo por legibilidad
      for (const [flag, field, side] of [['hasFront', 'imgFront', 'front'], ['hasBack', 'imgBack', 'back']]) {
        copy[field] = '';
        if (c[flag]) {
          let blob = null;
          try { blob = await dbGetImage(imgKey(c.id, side)); } catch (e) { blob = null; }
          if (blob) copy[field] = await blobToDataURL(blob); else { copy[flag] = false; missing++; }
        }
      }
      texts[idx] = JSON.stringify(copy);
      done++; if (done % 10 === 0 || done === total) say(`Exportando copia… ${done}/${total}`);
    };
    const worker = async () => { while (next < total) { const idx = next++; await one(idx); } };
    say(`Exportando copia… 0/${total}`);
    await Promise.all(Array.from({ length: 6 }, worker));
    for (let i = 0; i < total; i++) { parts.push(i ? ',' : ''); parts.push(texts[i]); texts[i] = null; }
    parts.push(']}');
    const blob = new Blob(parts, { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `PlazaMayor_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    try { localStorage.setItem('numis_last_backup', new Date().toISOString()); } catch (e) {}
    say(missing ? `Copia lista (${missing} foto${missing === 1 ? '' : 's'} no disponible${missing === 1 ? '' : 's'})` : 'Copia lista ✓');
    setTimeout(() => { toast.style.display = 'none'; }, missing ? 6000 : 2500);
  } catch (err) {
    console.error('Exportar:', err);
    toast.style.display = 'none';
    alert('No se pudo exportar la copia:\n' + ((err && err.message) || err) + '\n\nSi se repite, cierra otras pestañas/apps y prueba desde el ordenador.');
  }
  updateBackupStatus();
}

function updateBackupStatus() {
  const ver = document.getElementById('app-version');
  if (ver) ver.textContent = 'v' + APP_VERSION;
  const el = document.getElementById('backup-status');
  if (!el) return;
  let last = null;
  try { last = localStorage.getItem('numis_last_backup'); } catch (e) {}
  if (!last) {
    el.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Sin copia de seguridad';
    el.className = 'xh-status xh-bad';
    return;
  }
  const when = new Date(last);
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  // v8.02: fecha y hora de la última copia (dd/mm/aaaa hh:mm)
  const fecha = isNaN(when.getTime()) ? '' : ' · ' + when.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (days >= 14) {
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Copia hace ${days}d${fecha}`;
    el.className = 'xh-status xh-warn';
  } else {
    el.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Copia: ${days === 0 ? 'hoy' : 'hace ' + days + 'd'}${fecha}`;
    el.className = 'xh-status xh-ok';
  }
}

function importBackup(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup || !Array.isArray(backup.coins)) { alert('Archivo no válido.'); input.value = ''; return; }
      if (!confirm('Restaurar reemplazaría toda tu colección actual. ¿Continuar?')) { input.value = ''; return; }
      window.__pmImporting = true;

      let list = backup.coins.filter(c => c && typeof c === 'object' && c.denom);
      list.forEach(c => { if (!c.id) c.id = newId(); });
      if (list.length === 0) { alert('El archivo no contiene monedas válidas.'); input.value = ''; return; }

      customZones = Array.isArray(backup.zones) ? backup.zones.filter(x => typeof x === 'string' && x.trim()) : [];
      saveCustomZones();
      zoneOrder = Array.isArray(backup.zoneOrder) ? backup.zoneOrder.filter(x => typeof x === 'string' && x.trim()) : [];
      saveZoneOrder();
      zoneContinents = (backup.zoneContinents && typeof backup.zoneContinents === 'object' && !Array.isArray(backup.zoneContinents)) ? backup.zoneContinents : {};
      saveZoneContinents();
      const isV2 = Number(backup.version) >= 2 && Array.isArray(backup.countries) && Array.isArray(backup.periods);
      if (isV2) {
        countries = backup.countries; periods = backup.periods; coins = list;
        repairReferences();
      } else {
        const res = migrateLegacy(list, backup.preferences);
        countries = res.countries; periods = res.periods; coins = res.coins;
      }
      await saveAllDataToDB({ coins, countries, periods }, { clearImages: true });
      try { localStorage.setItem('numis_seeded', '1'); } catch (e2) {}
      alert('Restaurado con éxito.');
      currentCountryId = null;
      await loadData();   // vuelve a leer de la BD y pasa las imágenes incrustadas al almacén de imágenes
    } catch (err) {
      console.error(err);
      alert('Error al leer el archivo de respaldo.');
      try { await loadData(); } catch (e3) {}
    } finally {
      window.__pmImporting = false;
      try { if (window.PMSync && PMSync.touch) PMSync.touch(); } catch (e4) {}
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}
