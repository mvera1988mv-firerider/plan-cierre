/**
 * Plan de Cierre · servidor de la app (Google Apps Script)
 * Lee la hoja MASTER del pipeline (solo lectura) y el tablero de monday,
 * guarda lo que registras en la app en una hoja propia y envía los correos
 * de las 8:10 y 17:40 los días hábiles.
 *
 * Instalación: ver GUIA en el repositorio. Resumen:
 *  1. Pega este archivo como Code.gs en un proyecto nuevo de script.google.com
 *  2. Configuración del proyecto › Propiedades del script › MONDAY_TOKEN = tu token de monday
 *  3. Ejecuta la función setup() una vez y autoriza
 *  4. Implementar › Nueva implementación › Aplicación web (ejecutar como: yo; acceso: cualquier usuario)
 */

const CFG = {
  pipelineId: '1XnQFCmoGG_HW4g5N05xTwqfu5PbuvYyIBwfLU3_NLhs',
  masterSheet: 'MASTER',
  kam: 'MVera',
  mondayBoard: 8362049014,
  mondaySeller: 8373072329,
  stateName: 'Plan Cierre - Datos de la app',
  tz: 'America/Santiago',
  appUrl: 'https://mvera1988mv-firerider.github.io/plan-cierre/',
  deadline: '2026-12-20'
};

const MONDAY_QUERY = 'query { boards(ids: [' + CFG.mondayBoard + ']) { items_page(limit: 500, query_params: {rules: [{column_id: "conectar_tableros_mkmpf54b", compare_value: [' + CFG.mondaySeller + '], operator: any_of}, {column_id: "name", compare_value: ["PRO2026"], operator: contains_text}], operator: and}) { items { name column_values(ids: ["status","estado_mkmqxqnc","fecha_mkmq64sg","reflejo_mkmp4yyk","numbers","moneda_mkmtp6yh","_margen_esperado_mkmqb10q","probabilidad_cercana_mkmpb20c","date9","texto_mkmq2fwk"]) { id text ... on MirrorValue { display_value } } } } } }';

const COLS = ['config', 'ofertas', 'nuevos', 'contactos', 'dias'];

// ---------------------------------------------------------------- instalación
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('API_KEY')) p.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  let id = p.getProperty('STATE_ID');
  if (!id) {
    const ss = SpreadsheetApp.create(CFG.stateName);
    const sh = ss.getSheets()[0];
    sh.setName('estado');
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange(1, 1, 1, 4).setValues([['coleccion', 'id', 'json', 'actualizado']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    id = ss.getId();
    p.setProperty('STATE_ID', id);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['correoManana', 'correoTarde'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('correoManana').timeBased().atHour(8).nearMinute(10).everyDays(1).inTimezone(CFG.tz).create();
  ScriptApp.newTrigger('correoTarde').timeBased().atHour(17).nearMinute(40).everyDays(1).inTimezone(CFG.tz).create();

  const filas = leerPipeline_(true).length;
  let mon = 'falta MONDAY_TOKEN en Propiedades del script';
  if (p.getProperty('MONDAY_TOKEN')) {
    try { mon = leerMonday_().boards[0].items_page.items.length + ' ofertas'; } catch (e) { mon = 'error: ' + e.message; }
  }
  Logger.log('LISTO');
  Logger.log('Filas del pipeline con KAM ' + CFG.kam + ': ' + filas);
  Logger.log('monday: ' + mon);
  Logger.log('Hoja de datos de la app: https://docs.google.com/spreadsheets/d/' + id);
  Logger.log('CLAVE DE LA APP: ' + p.getProperty('API_KEY'));
  Logger.log('Después de implementar como aplicación web, ejecuta enviarEnlaceConfiguracion() para recibir por correo el enlace que configura cada equipo.');
}

/** Envía por correo el enlace que configura la app en cada equipo (ejecutar después de implementar). */
function enviarEnlaceConfiguracion() {
  const api = prop_('WEBAPP_URL') || ScriptApp.getService().getUrl();
  if (!api) throw new Error('Primero implementa el proyecto como aplicación web.');
  if (!/\/exec$/.test(api)) throw new Error('La dirección no termina en /exec. Copia la URL de la aplicación web desde Implementar › Gestionar implementaciones y guárdala en Propiedades del script como WEBAPP_URL; luego vuelve a ejecutar esta función.');
  const cfg = Utilities.base64EncodeWebSafe(JSON.stringify({ api: api, key: prop_('API_KEY') }));
  const link = CFG.appUrl + '#cfg=' + cfg;
  const html = '<p>Abre este enlace en cada equipo (Mac, Windows, iPhone y Honor) para dejar la app configurada:</p>' +
    '<p><a href="' + link + '">Configurar Plan de Cierre en este equipo</a></p>' +
    '<p>En el iPhone ábrelo en Safari y luego Compartir › Agregar a inicio. En el Honor, ábrelo en Chrome y luego menú › Instalar app. En Mac y Windows, ábrelo en Chrome o Edge y usa el ícono de instalar en la barra de direcciones.</p>' +
    '<p style="color:#888">Este enlace contiene tu clave. No lo reenvíes.</p>';
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Plan de Cierre: enlace de configuración', htmlBody: html });
  Logger.log('Enlace enviado a ' + Session.getEffectiveUser().getEmail());
}

// ---------------------------------------------------------------- API web
function doGet(e) {
  const prm = (e && e.parameter) || {};
  if (!prm.action) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Servidor de Plan de Cierre activo. Abre la app en ' + CFG.appUrl + '</p>');
  }
  if (!clave_(prm.key)) return json_({ error: 'clave' });
  if (prm.action === 'all') {
    return json_({
      at: new Date().toISOString(),
      pipeline: seguro_(function () { return leerPipeline_(prm.fresh === '1'); }),
      monday: seguro_(leerMonday_),
      state: leerEstado_()
    });
  }
  if (prm.action === 'state') return json_({ at: new Date().toISOString(), state: leerEstado_() });
  return json_({ error: 'accion' });
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ error: 'formato' }); }
  if (!clave_(b.key)) return json_({ error: 'clave' });
  const ops = Array.isArray(b.ops) ? b.ops : [b];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (COLS.indexOf(o.col) < 0) return json_({ error: 'coleccion' });
    if (!/^[A-Za-z0-9_\-.:#]{1,80}$/.test(String(o.id))) return json_({ error: 'id' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = hojaEstado_();
    const last = sh.getLastRow();
    const keys = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
    const idx = {};
    keys.forEach(function (k, i) { idx[k[0] + '|' + k[1]] = i + 2; });
    const borrar = [];
    ops.forEach(function (o) {
      const k = o.col + '|' + String(o.id), row = idx[k];
      if (o.op === 'delete') { if (row) borrar.push(row); return; }
      const vals = [[o.col, String(o.id), JSON.stringify(o.data || {}), new Date()]];
      if (row) sh.getRange(row, 1, 1, 4).setValues(vals);
      else { sh.appendRow(vals[0]); idx[k] = sh.getLastRow(); }
    });
    borrar.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  } finally { lock.releaseLock(); }
  return json_({ ok: true, at: new Date().toISOString() });
}

// ---------------------------------------------------------------- lectura de fuentes
function leerPipeline_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) { const hit = cache.get('pipe'); if (hit) return JSON.parse(hit); }
  const sh = SpreadsheetApp.openById(CFG.pipelineId).getSheetByName(CFG.masterSheet);
  if (!sh) throw new Error('No encuentro la hoja ' + CFG.masterSheet);
  const v = sh.getDataRange().getDisplayValues(); // lee todas las filas, haya o no filtros activos
  let hi = -1;
  for (let i = 0; i < Math.min(v.length, 10); i++) {
    const r = v[i].map(function (x) { return String(x).trim(); });
    if (r.indexOf('KAM') >= 0 && r.some(function (x) { return /PPTO/i.test(x); })) { hi = i; break; }
  }
  if (hi < 0) throw new Error('No encuentro la fila de encabezados en MASTER');
  const H = v[hi].map(function (x) { return String(x).trim(); });
  const col = function (n) { for (let i = 0; i < H.length; i++) if (H[i].toLowerCase() === n.toLowerCase()) return i; return -1; };
  const find = function (re) { for (let i = 0; i < H.length; i++) if (re.test(H[i])) return i; return -1; };
  const C = { id: find(/PPTO/i), fe: col('Fecha Envío'), ae: col('Año Envio'), mgan: col('Mes Ganada'), ag: col('Año Ganada'),
    kam: col('KAM'), cli: col('Cliente'), det: col('DETALLE'), man: col('Mandante'), est: col('Estado Cotización'),
    v: col('VENTA'), mg: col('Mg Esperado'), pr: find(/^Prob/i) };
  const g = function (r, k) { return C[k] >= 0 ? String(r[C[k]]).trim() : ''; };
  const out = [];
  for (let i = hi + 1; i < v.length; i++) {
    const r = v[i];
    if (g(r, 'kam') !== CFG.kam) continue;
    out.push({ row: i + 1, id: g(r, 'id'), fe: g(r, 'fe'), ae: g(r, 'ae'), mgan: g(r, 'mgan'), ag: g(r, 'ag'), cli: g(r, 'cli'),
      det: g(r, 'det'), man: g(r, 'man'), est: g(r, 'est'), v: g(r, 'v'), mg: g(r, 'mg'), pr: g(r, 'pr') });
  }
  try { cache.put('pipe', JSON.stringify(out), 60); } catch (e) { /* demasiado grande para el caché */ }
  return out;
}

function leerMonday_() {
  const t = prop_('MONDAY_TOKEN');
  if (!t) throw new Error('Falta MONDAY_TOKEN en Propiedades del script');
  const r = UrlFetchApp.fetch('https://api.monday.com/v2', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: t, 'API-Version': '2024-10' },
    payload: JSON.stringify({ query: MONDAY_QUERY })
  });
  const j = JSON.parse(r.getContentText());
  if (j.errors || j.error_message) throw new Error('monday: ' + JSON.stringify(j.errors || j.error_message).slice(0, 300));
  return j.data;
}

// ---------------------------------------------------------------- estado de la app
function hojaEstado_() {
  const id = prop_('STATE_ID');
  if (!id) throw new Error('Ejecuta setup() primero');
  return SpreadsheetApp.openById(id).getSheetByName('estado');
}
function leerEstado_() {
  const sh = hojaEstado_(), last = sh.getLastRow(), s = {};
  if (last < 2) return s;
  sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) {
    if (!r[0]) return;
    try { (s[r[0]] = s[r[0]] || {})[String(r[1])] = JSON.parse(r[2] || '{}'); } catch (e) { }
  });
  return s;
}

// ---------------------------------------------------------------- correos diarios
function correoManana() {
  if (!habil_()) return;
  const d = resumen_();
  const L = [];
  L.push('<p><b>Faltan $' + mm_(d.falta) + ' MM</b> para la meta · brecha sin cubrir $' + mm_(d.brecha) + ' MM · ' + d.dias + ' días al 20-dic.</p>');
  if (d.compromiso) L.push('<p><b>Tu compromiso de ayer:</b> ' + esc_(d.compromiso) + '</p>');
  if (!d.ayerCompleto) L.push('<p style="color:#b0352b">Ayer la rutina quedó incompleta.</p>');
  if (d.atrasadas.length) L.push('<p><b>Atrasadas</b></p><ul>' + d.atrasadas.map(li_).join('') + '</ul>');
  if (d.hoy.length) L.push('<p><b>Para hoy</b></p><ul>' + d.hoy.map(li_).join('') + '</ul>');
  if (d.empujar.length) L.push('<p><b>Empujar</b></p><ul>' + d.empujar.map(function (o) { return '<li>' + esc_(o.det) + ' · $' + mm_(o.v) + ' MM · ' + o.p + '%</li>'; }).join('') + '</ul>');
  L.push('<p><b>Negocio nuevo:</b> registra al menos una conversación hoy con ' + d.cliHoy + '.</p>');
  L.push('<p><a href="' + CFG.appUrl + '">Abrir mi rutina</a></p>');
  const n = d.atrasadas.length + d.hoy.length;
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Plan de cierre · ' + (n ? n + ' tareas para hoy' : 'tu rutina de hoy'), htmlBody: L.join('') });
}

function correoTarde() {
  if (!habil_()) return;
  const st = leerEstado_(), hoy = hoy_(), dia = (st.dias || {})[hoy] || {};
  if (dia.complete) {
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Plan de cierre · rutina completa',
      htmlBody: '<p>Rutina de hoy completa.' + (dia.cierre && dia.cierre.comp ? ' Mañana: ' + esc_(dia.cierre.comp) : '') + '</p>' });
    return;
  }
  const falt = [];
  const chk = dia.chk || {}, plan = dia.plan || {}, res = dia.res || {}, ofs = st.ofertas || {};
  if (!(chk.brecha && chk.leccion)) falt.push('Paso 1: revisar la brecha y la lección');
  const pend = function (ids) { return (ids || []).filter(function (id) { const r = res[id]; if (!r) return true; if (r.r === 'cae') return false; const o = ofs[id] || {}; return !(o.accion && o.para); }); };
  const p2 = pend(plan.s2), p3 = pend(plan.s3);
  if (!dia.plan) falt.push('No abriste la rutina hoy');
  if (p2.length) falt.push('Paso 2: registrar resultado y próximo paso de ' + p2.join(', '));
  if (p3.length) falt.push('Paso 3: rescatar ' + p3.join(', '));
  const contactos = Object.keys(st.contactos || {}).filter(function (k) { return (st.contactos[k].fecha || '') === hoy; }).length;
  if (!contactos) falt.push('Paso 4: una conversación de negocio nuevo');
  if (!(dia.cierre && dia.cierre.txt && dia.cierre.comp)) falt.push('Paso 6: cierre del día');
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Plan de cierre · te faltan ' + falt.length + ' pasos',
    htmlBody: '<ul>' + falt.map(function (x) { return '<li>' + esc_(x) + '</li>'; }).join('') + '</ul><p><a href="' + CFG.appUrl + '">Terminar la rutina</a></p>' });
}

function resumen_() {
  const st = leerEstado_(), hoy = hoy_(), ofs = st.ofertas || {};
  const cfg = (st.config || {}).plan || { meta: 900, mode: 'new' };
  const pipe = leerPipeline_(false);
  let mon = {};
  try { leerMonday_().boards[0].items_page.items.forEach(function (it) {
    const c = {}; it.column_values.forEach(function (x) { c[x.id] = x.display_value || x.text || ''; });
    mon[String(it.name).trim().toUpperCase()] = { p: parseFloat(c.probabilidad_cercana_mkmpb20c), fc: c.date9 };
  }); } catch (e) { mon = {}; }
  const num = function (s) { const t = String(s || '').replace(/[^\d-]/g, ''); return t && t !== '-' ? parseFloat(t) : 0; };
  let ganado = 0; const abiertas = [];
  pipe.forEach(function (r) {
    const id = String(r.id).trim().toUpperCase(), e = String(r.est).trim().toUpperCase();
    if (e === 'GANADA' && String(r.ag) === '2026') ganado += num(r.v);
    if (id.indexOf('PRO2026') === 0 && (e === 'OFERTADA' || e === 'PRESUPUESTO')) {
      const ov = ofs[id] || {};
      if (ov.st === 'lost' || ov.st === 'won') return;
      const m = mon[id] || {};
      let p = ov.p != null && ov.p !== '' ? +ov.p : (!isNaN(m.p) ? m.p : (r.pr ? parseFloat(r.pr) * 10 : 50));
      if (isNaN(p)) p = 50;
      abiertas.push({ id: id, det: r.det, v: num(r.v), p: p });
    }
  });
  const esperado = abiertas.reduce(function (a, o) { return a + o.v * o.p / 100; }, 0);
  const nuevos = Object.keys(st.nuevos || {}).reduce(function (a, k) { const n = st.nuevos[k]; return a + (+n.monto || 0) * 1e6 * ((n.p == null ? 50 : +n.p) / 100); }, 0);
  const falta = Math.max(0, (cfg.meta || 900) * 1e6 - (cfg.mode === 'acc' ? ganado : 0));
  const brecha = Math.max(0, falta - esperado - nuevos);
  const tareas = Object.keys(ofs).filter(function (id) { return ofs[id].para && ofs[id].accion && ofs[id].st !== 'lost' && ofs[id].st !== 'won'; })
    .map(function (id) { const a = abiertas.find(function (o) { return o.id === id; }) || {}; return { id: id, accion: ofs[id].accion, para: ofs[id].para, det: a.det || '' }; });
  const ayer = diaHabilAnterior_(), dAyer = (st.dias || {})[ayer] || {};
  const dow = Number(Utilities.formatDate(new Date(), CFG.tz, 'u'));
  return {
    falta: falta, brecha: brecha,
    dias: Math.max(0, Math.round((new Date(CFG.deadline + 'T23:59:00-03:00') - new Date()) / 864e5)),
    atrasadas: tareas.filter(function (t) { return t.para < hoy; }),
    hoy: tareas.filter(function (t) { return t.para === hoy; }),
    empujar: abiertas.filter(function (o) { return o.p >= 75; }).sort(function (a, b) { return b.v * b.p - a.v * a.p; }).slice(0, 3),
    compromiso: dAyer.cierre && dAyer.cierre.comp, ayerCompleto: !!dAyer.complete || !dAyer.plan,
    cliHoy: [1, 3, 5].indexOf(dow) >= 0 ? 'WOM' : 'Claro'
  };
}

// ---------------------------------------------------------------- utilidades
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function clave_(k) { const real = prop_('API_KEY'); return !!real && k === real; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function seguro_(fn) { try { return fn(); } catch (e) { return { error: String(e.message || e) }; } }
function hoy_() { return Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd'); }
function habil_() { const d = Number(Utilities.formatDate(new Date(), CFG.tz, 'u')); return d >= 1 && d <= 5; }
function diaHabilAnterior_() { const d = new Date(); do { d.setDate(d.getDate() - 1); } while (['6', '7'].indexOf(Utilities.formatDate(d, CFG.tz, 'u')) >= 0); return Utilities.formatDate(d, CFG.tz, 'yyyy-MM-dd'); }
function mm_(v) { return (v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: v >= 1e8 ? 0 : 1 }); }
function esc_(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function li_(t) { return '<li>' + esc_(t.accion) + ' <span style="color:#888">(' + esc_(t.id) + (t.det ? ' · ' + esc_(t.det) : '') + ' · ' + t.para + ')</span></li>'; }
