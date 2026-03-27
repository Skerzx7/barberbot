const Anthropic = require('@anthropic-ai/sdk');

const ADMIN_PWD  = process.env.ADMIN_PASSWORD || '1307';
const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';

function normalizarTel(tel) {
  return tel.replace(/\D/g, '').replace(/^521?/, '').slice(-10);
}

// ── Timezone Mexico ───────────────────────────────────────────────
function hoyMX() {
  const mx = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  mx.setHours(0, 0, 0, 0);
  return mx;
}

// ── Firestore REST ────────────────────────────────────────────────
const PID     = () => process.env.FIREBASE_PROJECT_ID;
const APIKEY  = () => process.env.VITE_FIREBASE_API_KEY;
const BASEURL = () => `https://firestore.googleapis.com/v1/projects/${PID()}/databases/(default)/documents`;

async function fsGet(path) {
  const res = await fetch(`${BASEURL()}/${path}?key=${APIKEY()}`);
  return res.json();
}
async function fsSet(path, fields) {
  const res = await fetch(`${BASEURL()}/${path}?key=${APIKEY()}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}
async function fsPost(path, fields) {
  const res = await fetch(`${BASEURL()}/${path}?key=${APIKEY()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

function parseDoc(doc) {
  if (!doc?.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue    !== undefined) obj[k] = v.stringValue;
    if (v.integerValue   !== undefined) obj[k] = Number(v.integerValue);
    if (v.doubleValue    !== undefined) obj[k] = v.doubleValue;
    if (v.booleanValue   !== undefined) obj[k] = v.booleanValue;
    if (v.timestampValue !== undefined) obj[k] = v.timestampValue;
  }
  return obj;
}

function toFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string')  f[k] = { stringValue: v };
    if (typeof v === 'number')  f[k] = { integerValue: v };
    if (typeof v === 'boolean') f[k] = { booleanValue: v };
  }
  return f;
}

// ── Twilio ────────────────────────────────────────────────────────
async function enviarWA(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth  = Buffer.from(`${sid}:${token}`).toString('base64');
  const toWA  = to.startsWith('whatsapp:') ? to : `whatsapp:+52${to}`;
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: NUMERO_BOT, To: toWA, Body: body }),
    });
  } catch(e) { console.error('enviarWA error:', e); }
}

async function notificarAdmins(msg) {
  const tels = [process.env.ADMIN_TEL_ZAIRA, process.env.ADMIN_TEL_JUAN].filter(Boolean);
  for (const t of tels) await enviarWA(t, msg);
}

// ── Admin ─────────────────────────────────────────────────────────
async function esAdmin(tel) {
  try { const res = await fsGet(`admin_sesion/${tel}`); return parseDoc(res)?.activo === true; } catch { return false; }
}
async function setAdmin(tel, activo) { await fsSet(`admin_sesion/${tel}`, toFields({ activo })); }
async function getAdminBotOn(tel) {
  try { const res = await fsGet(`admin_bot/${tel}`); return parseDoc(res)?.activo === true; } catch { return false; }
}
async function setAdminBotOn(tel, activo) { await fsSet(`admin_bot/${tel}`, toFields({ activo })); }
async function getAdminModoPrueba(tel) {
  try { const res = await fsGet(`admin_bot/${tel}`); return parseDoc(res)?.modoPrueba === true; } catch { return false; }
}
async function setAdminModoPrueba(tel, activo) {
  await fsSet(`admin_bot/${tel}`, toFields({ activo: true, modoPrueba: activo }));
}

// ── Estado conversación ───────────────────────────────────────────
async function getEstado(clienteId) {
  try {
    const res = await fsGet(`conversacion_estado/${clienteId}`);
    const doc = parseDoc(res);
    if (doc) return doc;
  } catch {}
  return { paso: 'inicio', ultimoMensaje: '' };
}
async function setEstado(clienteId, estado) {
  await fsSet(`conversacion_estado/${clienteId}`, toFields({
    paso:          estado.paso      || 'inicio',
    servicio:      estado.servicio  || '',
    precio:        Number(estado.precio || 0),
    emoji:         estado.emoji     || '',
    fechaStr:      estado.fechaStr  || '',
    hora:          estado.hora      || '',
    ultimoMensaje: new Date().toISOString(),
  }));
}

// ── Guardar mensaje ───────────────────────────────────────────────
async function guardarMsg(clienteId, de, texto) {
  if (!clienteId) return;
  await fsPost(`clientes/${clienteId}/mensajes`, {
    de:        { stringValue: de },
    texto:     { stringValue: texto },
    canal:     { stringValue: 'whatsapp' },
    timestamp: { timestampValue: new Date().toISOString() },
  });
}

// ── Historial ─────────────────────────────────────────────────────
async function getHistorial(clienteId) {
  try {
    const res  = await fsGet(`clientes/${clienteId}/mensajes`);
    const docs = (res.documents || []).map(parseDoc).filter(Boolean);
    return docs
      .sort((a, b) => new Date(a.timestamp||0) - new Date(b.timestamp||0))
      .slice(-10)
      .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content: m.texto }))
      .filter(m => m.content?.trim());
  } catch { return []; }
}

// ── Fecha/hora ────────────────────────────────────────────────────
function parsearFecha(texto) {
  const t   = texto.toLowerCase().trim();
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const dias = { lunes:1, martes:2, 'miércoles':3, miercoles:3, jueves:4, viernes:5, 'sábado':6, sabado:6 };

  if (t.includes('hoy')) return formatFecha(hoy);
  if (t.includes('pasado mañana') || t.includes('pasado manana')) {
    const m = new Date(hoy); m.setDate(m.getDate()+2); return formatFecha(m);
  }
  if (t.includes('mañana') || t.includes('manana')) {
    const m = new Date(hoy); m.setDate(m.getDate()+1); return formatFecha(m);
  }
  for (const [nombre, num] of Object.entries(dias)) {
    if (t.includes(nombre)) {
      const d       = new Date(hoy);
      const proximo = t.includes('próximo') || t.includes('proximo') || t.includes('que viene') || t.includes('siguiente');
      const diff    = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff + (proximo ? 7 : 0));
      return formatFecha(d);
    }
  }
  const meses = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
  for (const [mes, num] of Object.entries(meses)) {
    if (t.includes(mes)) {
      const match = t.match(/(\d{1,2})/);
      if (match) {
        const d = new Date(hoy.getFullYear(), num, parseInt(match[1]));
        // FIX: si la fecha ya pasó, ir al siguiente año
        if (d < hoy) d.setFullYear(d.getFullYear()+1);
        return formatFecha(d);
      }
    }
  }
  const soloNum = t.match(/^(\d{1,2})$/) || t.match(/\bel\s+(\d{1,2})\b/);
  if (soloNum) {
    const dia = parseInt(soloNum[1]);
    const d   = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
    if (d < hoy) d.setMonth(d.getMonth()+1);
    return formatFecha(d);
  }
  return null;
}

function formatFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fechaLegible(fs) {
  const d    = new Date(fs + 'T12:00:00');
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const mes  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${dias[d.getDay()]} ${d.getDate()} de ${mes[d.getMonth()]}`;
}

// FIX: validar que fecha no sea pasada usando timezone Mexico
function fechaEsPasada(fechaStr) {
  const d    = new Date(fechaStr + 'T12:00:00');
  return d < hoyMX();
}

function parsearHora(texto) {
  const t = texto.toLowerCase().replace(/\s/g, '');
  let m;
  m = t.match(/(\d{1,2}):(\d{2})/);
  if (m) { const h = parseInt(m[1]); if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:${m[2]}`; }
  m = t.match(/(\d{1,2})am/);
  if (m) { const h = parseInt(m[1]); if (h>=9&&h<=12) return `${String(h).padStart(2,'0')}:00`; }
  m = t.match(/(\d{1,2})pm/);
  if (m) { let h = parseInt(m[1]); if (h!==12) h+=12; if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:00`; }
  m = t.match(/(?:alas|las)(\d{1,2})/);
  if (m) { let h = parseInt(m[1]); if (h>=1&&h<=7) h+=12; if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:00`; }
  m = t.match(/^(\d{1,2})$/);
  if (m) { let h = parseInt(m[1]); if (h>=1&&h<=7) h+=12; if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:00`; }
  return null;
}

function horaLegible(hora) {
  if (!hora) return '';
  const [h, mn] = hora.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h > 12 ? h-12 : h === 0 ? 12 : h;
  return mn === 0 ? `${h12}${ampm}` : `${h12}:${String(mn).padStart(2,'0')}${ampm}`;
}

function extraerInfoCita(texto, servicios) {
  const info  = {};
  const fecha = parsearFecha(texto);
  if (fecha) info.fechaStr = fecha;
  const hora = parsearHora(texto);
  if (hora) info.hora = hora;
  for (const svc of servicios) {
    const palabras = svc.nombre.toLowerCase().split(' ');
    if (palabras.some(p => p.length > 3 && texto.toLowerCase().includes(p))) {
      info.servicio = svc.nombre;
      info.precio   = svc.precio;
      info.emoji    = svc.emoji || '✂️';
      break;
    }
  }
  return info;
}

async function verificarDisponibilidad(fechaStr, hora) {
  const res   = await fsGet('citas');
  const citas = (res.documents || []).map(parseDoc).filter(Boolean);
  return !citas.some(c => c.fechaStr === fechaStr && c.hora === hora && c.estado !== 'cancelled');
}

async function crearCita(clienteId, nombre, servicio, precio, fechaStr, hora) {
  return fsPost('citas', toFields({
    clientId: clienteId || '', clienteNombre: nombre || 'Clienta',
    servicio: servicio || '', precio: Number(precio) || 0,
    duracion: 30, hora: hora || '', fechaStr: fechaStr || '',
    estado: 'confirmed', creadoEn: new Date().toISOString(),
  }));
}

async function cancelarCitasPendientes(clienteId) {
  const res  = await fsGet('citas');
  const pend = (res.documents || []).map(parseDoc).filter(Boolean)
    .filter(c => c.clientId === clienteId && c.estado === 'confirmed');
  for (const c of pend) await fsSet(`citas/${c.id}`, toFields({ ...c, estado: 'cancelled' }));
  return pend.length;
}

// ── Claude para mensajes complejos ────────────────────────────────
async function respuestaInteligente(mensaje, historial, cliente, estado, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const svcsInfo  = servicios.map(s => `${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const estadoInfo = estado.paso !== 'inicio'
    ? `Paso actual: ${estado.paso}. Servicio: ${estado.servicio||'ninguno'}. Fecha: ${estado.fechaStr||'ninguna'}. Hora: ${estado.hora||'ninguna'}.`
    : '';

  const hoyStr = formatFecha(new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })));

  const system = `Eres Zai, asistente de WhatsApp de Barbería Zaira en México.

SERVICIOS:
${svcsInfo}

HORARIO: Lunes a sábado 9am a 7pm.
HOY ES: ${hoyStr}
CLIENTE: ${cliente.nombre}
${estadoInfo}

REGLAS:
- Habla en español mexicano natural, sin exagerar
- NUNCA menciones links ni páginas web
- NUNCA inventes precios que no estén en la lista
- Las fechas NUNCA pueden ser anteriores a hoy (${hoyStr})
- Si quieren cancelar o reagendar, detecta la intención
- Responde SOLO con JSON sin texto adicional:
{
  "intencion": "cancelar" | "reagendar" | "agendar" | "cambiar_servicio" | "disponibilidad" | "info" | "saludo" | "otro",
  "servicio": "nombre exacto del servicio o null",
  "fechaStr": "YYYY-MM-DD o null (nunca anterior a hoy)",
  "hora": "HH:MM o null",
  "respuesta": "mensaje corto para el cliente, máximo 2 oraciones"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 300, system,
      messages: [...historial, { role: 'user', content: mensaje }],
    });
    const text  = response.content[0]?.text?.trim() || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // FIX: validar que la fecha que devuelve Claude no sea pasada
    if (parsed.fechaStr && fechaEsPasada(parsed.fechaStr)) {
      parsed.fechaStr = null;
    }
    return parsed;
  } catch(e) {
    console.error('Claude error:', e);
    return { intencion: 'otro', respuesta: '¿Me puedes repetir? No te entendí bien.' };
  }
}

function esPreguntaDisponibilidad(t) {
  return (
    (t.includes('tendr') || t.includes('hay') || t.includes('tienen') || t.includes('habrá') || t.includes('habra')) &&
    (t.includes('cita') || t.includes('lugar') || t.includes('espacio') || t.includes('horario') || t.includes('disponib'))
  );
}

// ── Comandos admin ────────────────────────────────────────────────
async function procesarComandoAdmin(cmd, tel) {
  const c = cmd.trim().toLowerCase();
  if (c === '/on')    { await setAdminBotOn(tel, true);  await setAdminModoPrueba(tel, false); return '✅ Bot ON — te respondo como IA y se guarda en la app.'; }
  if (c === '/off')   { await setAdminBotOn(tel, false); await setAdminModoPrueba(tel, false); return '⛔ Bot OFF — te ignoro completamente.'; }
  if (c === '/prueba'){ await setAdminModoPrueba(tel, true); return '🧪 Modo prueba ON — te respondo en WhatsApp pero NO se guarda en la app.'; }
  if (c === '/salir') { await setAdmin(tel, false); await setAdminBotOn(tel, false); await setAdminModoPrueba(tel, false); return '👋 Sesión admin cerrada.'; }
  if (c === '/citas') {
    const hoyStr = formatFecha(new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })));
    const res    = await fsGet('citas');
    const lista  = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === hoyStr && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!lista.length) return '📅 No hay citas para hoy.';
    return `📅 Citas hoy (${lista.length}):\n\n` + lista.map(c => `⏰ ${horaLegible(c.hora)} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (c === '/mañana' || c === '/manana') {
    const mx = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    mx.setDate(mx.getDate()+1);
    const str = formatFecha(mx);
    const res = await fsGet('citas');
    const lista = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === str && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!lista.length) return '📅 No hay citas para mañana.';
    return `📅 Citas mañana (${lista.length}):\n\n` + lista.map(c => `⏰ ${horaLegible(c.hora)} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (c === '/clientes') { const res = await fsGet('clientes'); return `👥 Clientas registradas: ${(res.documents||[]).length}`; }
  if (c === '/ayuda') return `Comandos:\n\n/on — Bot te responde y guarda en app\n/off — Bot te ignora\n/prueba — Bot responde en WA sin guardar en app\n/citas — Citas de hoy\n/mañana — Citas de mañana\n/clientes — Total clientas\n/salir — Cerrar sesión\n/ayuda — Esta lista`;
  return `Comando no reconocido. Escribe /ayuda.`;
}

// ── Bot para clientes ─────────────────────────────────────────────
async function procesarMensaje(mensaje, estado, cliente, servicios, historial) {
  const t     = mensaje.toLowerCase().trim();
  const ahora = new Date();

  const minutos   = estado.ultimoMensaje
    ? (ahora.getTime() - new Date(estado.ultimoMensaje).getTime()) / 60000
    : 999;
  const saludar     = !estado.ultimoMensaje || minutos > 240;
  const esDesconocido = !cliente?.nombre || cliente.nombre === 'Desconocid@';
  const nombre      = !esDesconocido ? ` ${cliente.nombre.split(' ')[0]}` : '';
  const saludo      = saludar ? `Hola${nombre}! 😊\n\n` : '';

  const svcs      = servicios.filter(s => s.nombre);
  // FIX: lista sin precio en los flujos, solo nombre y emoji
  const listaSvcs      = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const listaSvcsSinPrecio = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}`).join('\n');
  const infoEx    = extraerInfoCita(mensaje, svcs);

  // Helpers de confirmación
  const confirmarCita = (emoji, servicio, fechaStr, hora, precio, conPrecio = true) =>
    `Confirma tu cita:\n\n${emoji||'✂️'} ${servicio}\n📅 ${fechaLegible(fechaStr)}\n⏰ ${horaLegible(hora)}${conPrecio ? `\n💰 $${precio}` : ''}\n\n¿Va? (sí/no)`;

  // ── Disponibilidad ────────────────────────────────────────────
  if (esPreguntaDisponibilidad(t)) {
    const fecha = parsearFecha(t);
    if (fecha) {
      const d = new Date(fecha + 'T12:00:00');
      if (d.getDay() === 0) return `Los domingos no atendemos. De lunes a sábado de 9am a 7pm 😊`;
      if (fechaEsPasada(fecha)) return `Esa fecha ya pasó 😅 ¿Para cuándo quieres?`;
      return `Sí hay horarios disponibles el ${fechaLegible(fecha)} 😊 ¿Te agendo una cita?`;
    }
    return `Sí tenemos horarios disponibles de lunes a sábado de 9am a 7pm 😊 ¿Para qué día quieres?`;
  }

  // ── ESPERANDO SERVICIO ────────────────────────────────────────
  if (estado.paso === 'esperando_servicio') {
    const numMatch = t.match(/^(\d+)$/);
    let svc = null;
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < svcs.length) svc = svcs[idx];
    } else {
      svc = svcs.find(s => s.nombre.toLowerCase().split(' ').some(p => p.length > 3 && t.includes(p)));
      if (!svc && (t.includes('niño') || t.includes('nino') || t.includes('morrito') || t.includes('chamaco') || t.includes('chavo') || t.includes('morro'))) {
        svc = svcs.find(s => s.nombre.toLowerCase().includes('niño') || s.nombre.toLowerCase().includes('nino'));
      }
    }
    if (!svc) {
      if (t.includes('tinte') || t.includes('color') || t.includes('permanente') || t.includes('keratina') || t.includes('especial') || t.includes('otro')) {
        await setEstado(cliente.id, { paso:'inicio' });
        await notificarAdmins(`💬 Servicio especial de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
        return `Para eso Zaira te atiende directo. En breve se pone en contacto 🙏`;
      }
      if (infoEx.fechaStr) {
        await setEstado(cliente.id, { ...estado, fechaStr: infoEx.fechaStr });
        return `No entendí el servicio 😅 ¿Cuál te interesa?\n\n${listaSvcsSinPrecio}`;
      }
      return `No entendí el servicio 😅 Elige un número o escribe el nombre:\n\n${listaSvcsSinPrecio}`;
    }
    const nuevo = { paso:'esperando_fecha', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️' };
    if (estado.fechaStr) nuevo.fechaStr = estado.fechaStr;
    if (estado.hora)     nuevo.hora     = estado.hora;
    if (nuevo.fechaStr && nuevo.hora) {
      const ok = await verificarDisponibilidad(nuevo.fechaStr, nuevo.hora);
      if (!ok) { nuevo.paso = 'esperando_hora'; nuevo.hora = ''; await setEstado(cliente.id, nuevo); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
      nuevo.paso = 'confirmando';
      await setEstado(cliente.id, nuevo);
      return confirmarCita(nuevo.emoji, nuevo.servicio, nuevo.fechaStr, nuevo.hora, nuevo.precio);
    }
    await setEstado(cliente.id, nuevo);
    return nuevo.fechaStr
      ? `${svc.emoji||'✂️'} ${svc.nombre} anotado!\n\n¿A qué hora? De 9am a 7pm.`
      : `${svc.emoji||'✂️'} ${svc.nombre} anotado!\n\n¿Para qué día? (lunes a sábado)`;
  }

  // ── ESPERANDO FECHA ───────────────────────────────────────────
  if (estado.paso === 'esperando_fecha') {
    const fechaStr = parsearFecha(t);
    if (!fechaStr) {
      const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios);
      if (ia.fechaStr) {
        if (fechaEsPasada(ia.fechaStr)) return `Esa fecha ya pasó 😅 ¿Cuándo te viene bien?`;
        const d2 = new Date(ia.fechaStr + 'T12:00:00');
        if (d2.getDay() === 0) return `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)`;
        await setEstado(cliente.id, {...estado, fechaStr: ia.fechaStr, paso:'esperando_hora'});
        return `📅 ${fechaLegible(ia.fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`;
      }
      return `No entendí la fecha 😅 Di "el viernes", "mañana" o "el 28".`;
    }
    // FIX: rechazar fechas pasadas
    if (fechaEsPasada(fechaStr)) return `Esa fecha ya pasó 😅 ¿Cuándo te viene bien?`;
    const d = new Date(fechaStr + 'T12:00:00');
    if (d.getDay() === 0) return `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)`;
    if (estado.hora) {
      const ok = await verificarDisponibilidad(fechaStr, estado.hora);
      if (!ok) { await setEstado(cliente.id, {...estado, fechaStr, paso:'esperando_hora', hora:''}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
      await setEstado(cliente.id, {...estado, fechaStr, paso:'confirmando'});
      return confirmarCita(estado.emoji, estado.servicio, fechaStr, estado.hora, estado.precio);
    }
    await setEstado(cliente.id, {...estado, fechaStr, paso:'esperando_hora'});
    return `📅 ${fechaLegible(fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`;
  }

  // ── ESPERANDO HORA ────────────────────────────────────────────
  if (estado.paso === 'esperando_hora') {
    const hora = parsearHora(t);
    if (!hora) return `No entendí la hora 😅 Di "11am", "3pm" o "a las 2".`;
    const [h] = hora.split(':').map(Number);
    if (h < 9 || h > 19) return `Atendemos de 9am a 7pm. ¿Qué hora te viene?`;
    const ok = await verificarDisponibilidad(estado.fechaStr, hora);
    if (!ok) return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`;
    await setEstado(cliente.id, {...estado, hora, paso:'confirmando'});
    return confirmarCita(estado.emoji, estado.servicio, estado.fechaStr, hora, estado.precio);
  }

  // ── CONFIRMANDO ───────────────────────────────────────────────
  if (estado.paso === 'confirmando') {
    if (t.match(/^(sí|si|yes|confirmo|dale|ok|claro|va|órale|orale|perfecto|listo|ándale|andale|sale|np|simon|simón)$/)) {
      await crearCita(cliente.id, cliente.nombre, estado.servicio, estado.precio, estado.fechaStr, estado.hora);
      await setEstado(cliente.id, { paso:'inicio' });
      await notificarAdmins(`📅 Nueva cita!\n👤 ${cliente.nombre}\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n📱 ${cliente.telefono||'Sin tel'}`);
      return `Cita confirmada! 🎉\n\nTe esperamos el ${fechaLegible(estado.fechaStr)} a las ${horaLegible(estado.hora)}.\n\nSi necesitas cancelar o cambiar avísanos 🙏`;
    }
    if (t.match(/^(no|cancel|mejor no|nop|nel|nope)$/)) {
      await setEstado(cliente.id, { paso:'inicio' });
      return `Va, sin problema. Si quieres para otro día aquí estoy 😊`;
    }

    // FIX: detectar cambio de servicio o fecha estando en confirmando
    const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios);

    if (ia.intencion === 'cambiar_servicio') {
      await setEstado(cliente.id, { paso:'esperando_servicio', fechaStr: estado.fechaStr, hora: estado.hora });
      return `¿Qué servicio quieres?\n\n${listaSvcsSinPrecio}`;
    }
    if (ia.intencion === 'cancelar') {
      await setEstado(cliente.id, { paso:'inicio' });
      return `Sale, cancelamos 😊 ¿Quieres para otro día?`;
    }
    if (ia.intencion === 'reagendar' && ia.fechaStr) {
      if (fechaEsPasada(ia.fechaStr)) return `Esa fecha ya pasó 😅 ¿Para cuándo la quieres?`;
      await setEstado(cliente.id, { ...estado, fechaStr: ia.fechaStr, hora: ia.hora||'', paso: ia.hora ? 'confirmando' : 'esperando_hora' });
      return ia.hora
        ? confirmarCita(estado.emoji, estado.servicio, ia.fechaStr, ia.hora, estado.precio)
        : `¿A qué hora el ${fechaLegible(ia.fechaStr)}? De 9am a 7pm.`;
    }
    return `¿Confirmas la cita? Responde sí o no.`;
  }

  // ── MENSAJES COMPLEJOS ────────────────────────────────────────
  const esComplejo =
    t.includes('equivoc') || t.includes('cancel') || t.includes('cambiar') ||
    t.includes('cambio') || t.includes('reagendar') || t.includes('mover') ||
    t.includes('quita') || t.includes('otro día') || t.includes('otro dia') ||
    t.includes('próximo') || t.includes('proximo') || t.includes('siguiente') ||
    t.includes('no era') || t.includes('me confundi');

  if (esComplejo) {
    const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios);
    console.log('Claude IA:', JSON.stringify(ia));

    if (ia.intencion === 'cancelar') {
      const n = await cancelarCitasPendientes(cliente.id);
      await setEstado(cliente.id, { paso:'inicio' });
      await notificarAdmins(`⚠️ ${cliente.nombre} canceló su cita.\n📱 ${cliente.telefono||'Sin tel'}`);
      return n > 0 ? `Va, cita cancelada 👍 Si quieres agendar otra aquí estoy.` : `No encontré citas activas. ¿Quieres agendar una?`;
    }

    if (ia.intencion === 'reagendar') {
      await cancelarCitasPendientes(cliente.id);
      const svcNombre  = ia.servicio || estado.servicio;
      const svc        = svcs.find(s => s.nombre === svcNombre) || svcs.find(s => s.nombre.toLowerCase().includes((svcNombre||'').toLowerCase().split(' ')[0]));
      const nuevaFecha = ia.fechaStr || parsearFecha(mensaje);
      const nuevaHora  = ia.hora     || parsearHora(mensaje);

      // FIX: validar fecha no pasada
      if (nuevaFecha && fechaEsPasada(nuevaFecha)) {
        await setEstado(cliente.id, { paso:'esperando_fecha', servicio: svc?.nombre||'', precio: svc?.precio||0, emoji: svc?.emoji||'✂️' });
        return `Esa fecha ya pasó 😅 ¿Para cuándo la quieres? (lunes a sábado)`;
      }
      if (nuevaFecha && new Date(nuevaFecha+'T12:00:00').getDay() === 0) {
        await setEstado(cliente.id, { paso:'esperando_fecha', servicio: svc?.nombre||'', precio: svc?.precio||0, emoji: svc?.emoji||'✂️' });
        return `Los domingos no atendemos. ¿Qué otro día?`;
      }

      if (svc && nuevaFecha && nuevaHora) {
        const ok = await verificarDisponibilidad(nuevaFecha, nuevaHora);
        if (!ok) {
          await setEstado(cliente.id, { paso:'esperando_hora', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:nuevaFecha });
          return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`;
        }
        await setEstado(cliente.id, { paso:'confirmando', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:nuevaFecha, hora:nuevaHora });
        return `Cita anterior cancelada ✓\n\n` + confirmarCita(svc.emoji, svc.nombre, nuevaFecha, nuevaHora, svc.precio);
      }
      if (svc && nuevaFecha) {
        await setEstado(cliente.id, { paso:'esperando_hora', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:nuevaFecha });
        return `Cita anterior cancelada ✓\n\n¿A qué hora el ${fechaLegible(nuevaFecha)}? De 9am a 7pm.`;
      }
      await setEstado(cliente.id, { paso:'esperando_servicio' });
      return `Cita anterior cancelada ✓\n\n¿Qué servicio quieres?\n\n${listaSvcsSinPrecio}`;
    }

    if (ia.respuesta) return ia.respuesta;
  }

  // FIX: detectar arrepentimiento con contexto del historial
  const esArrepentimiento =
    t.includes('mera hora') || t.includes('al final') || t.includes('la quiero') ||
    t.includes('si la') || t.includes('sí la') || t.includes('perdon') || t.includes('perdón');

  if (esArrepentimiento && historial.length > 0) {
    const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios);
    if ((ia.intencion === 'agendar' || ia.intencion === 'reagendar') && ia.servicio) {
      const svc = svcs.find(s => s.nombre === ia.servicio);
      if (svc && ia.fechaStr && ia.hora && !fechaEsPasada(ia.fechaStr)) {
        const ok = await verificarDisponibilidad(ia.fechaStr, ia.hora);
        if (ok) {
          await setEstado(cliente.id, { paso:'confirmando', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:ia.fechaStr, hora:ia.hora });
          return confirmarCita(svc.emoji, svc.nombre, ia.fechaStr, ia.hora, svc.precio);
        }
      }
      await setEstado(cliente.id, { paso:'esperando_servicio' });
      return `¿Qué servicio quieres?\n\n${listaSvcsSinPrecio}`;
    }
  }

  // ── QUIERE AGENDAR ────────────────────────────────────────────
  const quiereAgendar =
    t.includes('cita') || t.includes('agendar') || t.includes('reservar') || t.includes('apartar') ||
    (t.includes('quiero') && (t.includes('corte') || t.includes('servicio') || t.includes('cita'))) ||
    (t.includes('me puedes') && t.includes('cita'));

  if (quiereAgendar) {
    if (infoEx.servicio && infoEx.fechaStr && infoEx.hora) {
      if (fechaEsPasada(infoEx.fechaStr)) {
        await setEstado(cliente.id, { paso:'esperando_fecha', ...infoEx, fechaStr:'' });
        return `Esa fecha ya pasó 😅 ¿Para cuándo la quieres?`;
      }
      const d = new Date(infoEx.fechaStr + 'T12:00:00');
      if (d.getDay() === 0) { await setEstado(cliente.id, { paso:'esperando_fecha', ...infoEx }); return `Los domingos no atendemos. ¿Qué otro día?`; }
      const [h] = infoEx.hora.split(':').map(Number);
      if (h < 9 || h > 19) { await setEstado(cliente.id, { paso:'esperando_hora', ...infoEx, hora:'' }); return `Atendemos de 9am a 7pm. ¿Qué hora te viene?`; }
      const ok = await verificarDisponibilidad(infoEx.fechaStr, infoEx.hora);
      if (!ok) { await setEstado(cliente.id, { paso:'esperando_hora', ...infoEx, hora:'' }); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
      await setEstado(cliente.id, { paso:'confirmando', ...infoEx });
      return confirmarCita(infoEx.emoji, infoEx.servicio, infoEx.fechaStr, infoEx.hora, infoEx.precio);
    }
    const nuevo = { paso:'esperando_servicio', ...infoEx };
    if (infoEx.servicio) nuevo.paso = infoEx.fechaStr ? 'esperando_hora' : 'esperando_fecha';
    await setEstado(cliente.id, nuevo);
    if (infoEx.servicio && infoEx.fechaStr) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio} el ${fechaLegible(infoEx.fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`;
    if (infoEx.servicio) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio}!\n\n¿Para qué día? (lunes a sábado)`;
    return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre.`;
  }

  // ── RESPUESTAS SIMPLES ────────────────────────────────────────
  if (t.includes('precio') || t.includes('cuánto') || t.includes('cuanto') || t.includes('cuesta') || t.includes('cobran') || t.includes('servicios')) {
    return `${saludo}Nuestros servicios:\n\n${listaSvcs}`;
  }
  if (t.includes('horario') || t.includes('abren') || t.includes('atienden') || t.includes('días') || t.includes('dias')) {
    return `${saludo}Atendemos de lunes a sábado de 9am a 7pm.`;
  }
  if (t.match(/^(hola|buenas|buenos|buen|hi|hey|saludos|ola|buenas tardes|buenas noches|buenos días|buenos dias|qué onda|que onda|quiubo|quiúbo)/) || t.length <= 5) {
    await setEstado(cliente.id, { paso:'inicio' });
    return `${saludo}Bienvenid@ a Barbería Zaira 💅\n\n¿En qué te puedo ayudar?\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horario`;
  }
  if (t.match(/^(gracias|ok|okey|de nada|hasta luego|bye|adios|adiós|listo|perfecto|excelente|genial|👍|np|sale|va)$/)) {
    return `Con gusto! Que te vaya bien 😊`;
  }

  // ── MENSAJE NO RECONOCIDO — Claude ────────────────────────────
  const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios);
  if (ia.intencion === 'disponibilidad') {
    if (ia.fechaStr && !fechaEsPasada(ia.fechaStr)) {
      const d = new Date(ia.fechaStr + 'T12:00:00');
      if (d.getDay() === 0) return `Los domingos no atendemos. De lunes a sábado 9am-7pm 😊`;
      return `Sí hay espacio el ${fechaLegible(ia.fechaStr)} 😊 ¿Te agendo una cita?`;
    }
    return `Sí tenemos horarios disponibles 😊 ¿Para qué día quieres?`;
  }
  if (ia.intencion === 'saludo' && saludo) return `${saludo}Bienvenid@ a Barbería Zaira 💅\n\n¿En qué te puedo ayudar?`;
  if (ia.respuesta) {
    await notificarAdmins(`❓ Mensaje de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
    return ia.respuesta;
  }

  await notificarAdmins(`❓ Sin respuesta de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
  return `Ahorita no tengo respuesta para eso 😅 Zaira te puede ayudar, en breve se pone en contacto 🙏`;
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method not allowed' };

  try {
    const params  = new URLSearchParams(event.body);
    const mensaje = params.get('Body')?.trim() || '';
    const from    = params.get('From') || '';
    const tel     = normalizarTel(from.replace('whatsapp:', ''));

    if (!mensaje) return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };

    console.log(`MSG de ${from} (${tel}): ${mensaje}`);

    if (mensaje.trim() === `/admin${ADMIN_PWD}`) {
      await setAdmin(tel, true);
      await setAdminBotOn(tel, false);
      await setAdminModoPrueba(tel, false);
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>✅ Sesión admin iniciada!\n\nEscribe /ayuda para ver los comandos.</Body></Message></Response>` };
    }

    const adminActivo = await esAdmin(tel);
    if (adminActivo) {
      if (mensaje.startsWith('/')) {
        const resp = await procesarComandoAdmin(mensaje, tel);
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${resp}</Body></Message></Response>` };
      }
      const modoPrueba = await getAdminModoPrueba(tel);
      if (modoPrueba) {
        const estado = await getEstado(`prueba_${tel}`);
        const svcsJson = await fsGet('servicios');
        const servicios = (svcsJson.documents||[]).map(parseDoc).filter(Boolean).filter(s => s.nombre);
        const clientePrueba = { id:`prueba_${tel}`, nombre:'Admin (prueba)', telefono: tel };
        const respuesta = await procesarMensaje(mensaje, estado, clientePrueba, servicios, []);
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>` };
      }
      const botOn = await getAdminBotOn(tel);
      if (!botOn) return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response  = await anthropic.messages.create({
        model:'claude-sonnet-4-20250514', max_tokens:300,
        system:`Eres Zai, asistente de Barbería Zaira. Hablas con un administrador. Responde útil y directo en español.`,
        messages:[{ role:'user', content:mensaje }],
      });
      const resp = response.content[0]?.text?.trim() || 'No entendí.';
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${resp}</Body></Message></Response>` };
    }

    let cliente = null;
    const clientesJson = await fsGet('clientes');
    for (const doc of (clientesJson.documents||[])) {
      const c = parseDoc(doc);
      if (!c) continue;
      const telDoc = normalizarTel(c.telefono||'');
      if (telDoc.length >= 8 && telDoc === tel) { cliente = c; break; }
    }

    if (!cliente) {
      const ref = await fsPost('clientes', {
        nombre:   { stringValue: 'Desconocid@' }, telefono: { stringValue: tel },
        email:    { stringValue: '' }, notas: { stringValue: 'Registrad@ automáticamente por WhatsApp' },
        visitas:  { integerValue: 0 }, puntos: { integerValue: 0 },
        creadoEn: { timestampValue: new Date().toISOString() },
      });
      if (ref?.name) {
        cliente = { id: ref.name.split('/').pop(), nombre: 'Desconocid@', telefono: tel };
        await notificarAdmins(`👤 Nuev@ contacto!\n📱 +52${tel}\nEdítalo en la app.`);
      }
    }

    if (!cliente) return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>Hola! Bienvenid@ a Barbería Zaira 💅</Body></Message></Response>` };

    const botRes = await fsGet(`config_bot/${cliente.id}`);
    const botDoc = parseDoc(botRes);
    if (botDoc?.activo === false) {
      await guardarMsg(cliente.id, 'client', mensaje);
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
    }

    const estado    = await getEstado(cliente.id);
    const historial = await getHistorial(cliente.id);
    const svcsJson  = await fsGet('servicios');
    const servicios = (svcsJson.documents||[]).map(parseDoc).filter(Boolean).filter(s => s.nombre);

    await guardarMsg(cliente.id, 'client', mensaje);
    const respuesta = await procesarMensaje(mensaje, estado, cliente, servicios, historial);
    console.log(`Respuesta: ${respuesta}`);
    await guardarMsg(cliente.id, 'bot', respuesta);

    return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>` };

  } catch (err) {
    console.error('Error en webhook:', err);
    return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Ahorita no puedo responder. Intenta más tarde 🙏</Body></Message></Response>` };
  }
};