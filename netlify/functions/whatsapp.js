const Anthropic = require('@anthropic-ai/sdk');

// ── Config ────────────────────────────────────────────────────────
const ADMIN_PWD  = process.env.ADMIN_PASSWORD || '1307';
const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';

function normalizarTel(tel) {
  return tel.replace(/\D/g, '').replace(/^521?/, '').slice(-10);
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

// ── Sesión admin — SIEMPRE usa tel normalizado ────────────────────
async function esAdmin(tel) {
  try {
    const res = await fsGet(`admin_sesion/${tel}`);
    const doc = parseDoc(res);
    return doc?.activo === true;
  } catch { return false; }
}

async function setAdmin(tel, activo) {
  await fsSet(`admin_sesion/${tel}`, toFields({ activo }));
}

async function getAdminBotOn(tel) {
  try {
    const res = await fsGet(`admin_bot/${tel}`);
    const doc = parseDoc(res);
    return doc?.activo === true;
  } catch { return false; }
}

async function setAdminBotOn(tel, activo) {
  await fsSet(`admin_bot/${tel}`, toFields({ activo }));
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

// ── Obtener historial para memoria ────────────────────────────────
async function getHistorial(clienteId) {
  try {
    const res  = await fsGet(`clientes/${clienteId}/mensajes`);
    const docs = (res.documents || []).map(parseDoc).filter(Boolean);
    // Ordenar por timestamp y tomar los últimos 10
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
  const hoy = new Date();
  const dias = { lunes:1, martes:2, 'miércoles':3, miercoles:3, jueves:4, viernes:5, 'sábado':6, sabado:6 };

  if (t.includes('hoy')) return formatFecha(hoy);
  if (t.includes('mañana') || t.includes('manana')) {
    const m = new Date(hoy); m.setDate(m.getDate()+1); return formatFecha(m);
  }

  // "próximo viernes", "el viernes que viene"
  for (const [nombre, num] of Object.entries(dias)) {
    if (t.includes(nombre)) {
      const d    = new Date(hoy);
      // Si dice "próximo" o "que viene", saltar a la siguiente semana
      const proximo = t.includes('próximo') || t.includes('proximo') || t.includes('que viene') || t.includes('siguiente');
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff + (proximo && diff < 7 ? 7 : 0));
      return formatFecha(d);
    }
  }

  const meses = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
  for (const [mes, num] of Object.entries(meses)) {
    if (t.includes(mes)) {
      const match = t.match(/(\d{1,2})/);
      if (match) {
        const d = new Date(hoy.getFullYear(), num, parseInt(match[1]));
        if (d < hoy) d.setFullYear(d.getFullYear()+1);
        return formatFecha(d);
      }
    }
  }

  const soloNum = t.match(/^(\d{1,2})$/) || t.match(/el\s+(\d{1,2})/);
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

function parsearHora(texto) {
  const t = texto.toLowerCase().replace(/\s/g, '');
  let match;
  match = t.match(/(\d{1,2}):(\d{2})/);
  if (match) { const h = parseInt(match[1]); if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:${match[2]}`; }
  match = t.match(/(\d{1,2})am/);
  if (match) { const h = parseInt(match[1]); if (h>=9&&h<=12) return `${String(h).padStart(2,'0')}:00`; }
  match = t.match(/(\d{1,2})pm/);
  if (match) { let h = parseInt(match[1]); if (h!==12) h+=12; if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:00`; }
  match = t.match(/(?:alas|las)(\d{1,2})/);
  if (match) { let h = parseInt(match[1]); if (h>=1&&h<=7) h+=12; if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:00`; }
  match = t.match(/^(\d{1,2})$/);
  if (match) { let h = parseInt(match[1]); if (h>=1&&h<=7) h+=12; if (h>=9&&h<=19) return `${String(h).padStart(2,'0')}:00`; }
  return null;
}

function horaLegible(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  const ampm   = h >= 12 ? 'pm' : 'am';
  const h12    = h > 12 ? h-12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
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
    clientId:      clienteId || '',
    clienteNombre: nombre    || 'Clienta',
    servicio:      servicio  || '',
    precio:        Number(precio) || 0,
    duracion:      30,
    hora:          hora      || '',
    fechaStr:      fechaStr  || '',
    estado:        'confirmed',
    creadoEn:      new Date().toISOString(),
  }));
}

// ── Cancelar citas pendientes del cliente ─────────────────────────
async function cancelarCitasPendientes(clienteId) {
  const res   = await fsGet('citas');
  const citas = (res.documents || []).map(parseDoc).filter(Boolean);
  const pendientes = citas.filter(c => c.clientId === clienteId && c.estado === 'confirmed');
  for (const c of pendientes) {
    await fsSet(`citas/${c.id}`, toFields({ ...c, estado: 'cancelled' }));
  }
  return pendientes.length;
}

// ── Usar Claude para mensajes complejos con contexto ──────────────
async function respuestaInteligente(mensaje, historial, cliente, estado, servicios, listaSvcs) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const svcsInfo = servicios.map(s => `${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const estadoInfo = estado.paso !== 'inicio'
    ? `\nCONTEXTO ACTUAL: El cliente está en proceso de agendar. Paso: ${estado.paso}. Servicio: ${estado.servicio||'ninguno'}. Fecha: ${estado.fechaStr||'ninguna'}. Hora: ${estado.hora||'ninguna'}.`
    : '';

  const system = `Eres Zai, asistente de WhatsApp de Barbería Zaira en México.

SERVICIOS:
${svcsInfo}

HORARIO: Lunes a sábado de 9am a 7pm (última cita a las 7pm).
CLIENTE: ${cliente.nombre}
${estadoInfo}

REGLAS:
- Responde en español mexicano casual y corto (máximo 2 oraciones)
- NUNCA menciones links ni páginas web
- NUNCA inventes precios o servicios que no estén en la lista
- Si quieren cambiar/cancelar su cita, extrae la intención claramente
- Si quieren reagendar, primero cancela la cita anterior y luego agenda la nueva
- Responde SOLO con un JSON así:
{
  "intencion": "cancelar" | "reagendar" | "agendar" | "info" | "otro",
  "servicio": "nombre del servicio o null",
  "fechaStr": "YYYY-MM-DD o null",
  "hora": "HH:MM o null",
  "respuesta": "mensaje para el cliente"
}`;

  const messages = [
    ...historial,
    { role: 'user', content: mensaje }
  ];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system,
      messages,
    });
    const text = response.content[0]?.text?.trim() || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch(e) {
    console.error('Claude error:', e);
    return { intencion: 'otro', respuesta: 'Ahorita no pude entender bien. ¿Me puedes repetir?' };
  }
}

// ── Comandos admin ────────────────────────────────────────────────
async function procesarComandoAdmin(cmd, tel) {
  const c = cmd.trim().toLowerCase();

  if (c === '/on') {
    await setAdminBotOn(tel, true);
    return '✅ Bot ON — ahora respondo tus mensajes como IA.';
  }
  if (c === '/off') {
    await setAdminBotOn(tel, false);
    return '⛔ Bot OFF — ya no respondo tus mensajes.';
  }
  if (c === '/salir') {
    await setAdmin(tel, false);
    await setAdminBotOn(tel, false);
    return '👋 Sesión admin cerrada.';
  }
  if (c === '/citas') {
    const hoyStr = formatFecha(new Date());
    const res    = await fsGet('citas');
    const lista  = (res.documents || []).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === hoyStr && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!lista.length) return '📅 No hay citas para hoy.';
    return `📅 Citas hoy (${lista.length}):\n\n` + lista.map(c => `⏰ ${horaLegible(c.hora)} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (c === '/mañana' || c === '/manana') {
    const d   = new Date(); d.setDate(d.getDate()+1);
    const str = formatFecha(d);
    const res = await fsGet('citas');
    const lista = (res.documents || []).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === str && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!lista.length) return '📅 No hay citas para mañana.';
    return `📅 Citas mañana (${lista.length}):\n\n` + lista.map(c => `⏰ ${horaLegible(c.hora)} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (c === '/clientes') {
    const res = await fsGet('clientes');
    return `👥 Clientas registradas: ${(res.documents||[]).length}`;
  }
  if (c === '/ayuda') {
    return `Comandos disponibles:\n\n/on — Bot te responde como IA\n/off — Bot te ignora\n/citas — Citas de hoy\n/mañana — Citas de mañana\n/clientes — Total de clientas\n/salir — Cerrar sesión admin\n/ayuda — Esta lista`;
  }
  return `Comando no reconocido. Escribe /ayuda.`;
}

// ── Bot para clientes ─────────────────────────────────────────────
async function procesarMensaje(mensaje, estado, cliente, servicios, historial) {
  const t     = mensaje.toLowerCase().trim();
  const ahora = new Date();

  const minutos   = estado.ultimoMensaje
    ? (ahora.getTime() - new Date(estado.ultimoMensaje).getTime()) / 60000
    : 999;
  const saludar   = !estado.ultimoMensaje || minutos > 240;
  const esDesconocido = !cliente?.nombre || cliente.nombre === 'Desconocid@';
  const nombre    = !esDesconocido ? ` ${cliente.nombre.split(' ')[0]}` : '';
  const saludo    = saludar ? `Hola${nombre}! 😊\n\n` : '';

  const svcs      = servicios.filter(s => s.nombre);
  const listaSvcs = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const infoEx    = extraerInfoCita(mensaje, svcs);

  // ── FLUJO ESPERANDO SERVICIO ──────────────────────────────────
  if (estado.paso === 'esperando_servicio') {
    const numMatch = t.match(/^(\d+)$/);
    let svc = null;
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < svcs.length) svc = svcs[idx];
    } else {
      svc = svcs.find(s => s.nombre.toLowerCase().split(' ').some(p => p.length > 3 && t.includes(p)));
    }
    if (!svc) {
      if (t.includes('tinte') || t.includes('color') || t.includes('permanente') || t.includes('keratina') || t.includes('especial') || t.includes('otro')) {
        await setEstado(cliente.id, { paso:'inicio' });
        await notificarAdmins(`💬 Servicio especial de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
        return `Para ese servicio especial Zaira te atiende personalmente. En breve te contacta 🙏`;
      }
      return `No encontré ese servicio 😅 Elige un número o escribe el nombre:\n\n${listaSvcs}`;
    }
    const nuevo = { paso:'esperando_fecha', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️' };
    if (estado.fechaStr) nuevo.fechaStr = estado.fechaStr;
    if (estado.hora)     nuevo.hora     = estado.hora;
    if (nuevo.fechaStr && nuevo.hora) {
      const ok = await verificarDisponibilidad(nuevo.fechaStr, nuevo.hora);
      if (!ok) { nuevo.paso = 'esperando_hora'; nuevo.hora = ''; await setEstado(cliente.id, nuevo); return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 7pm.`; }
      nuevo.paso = 'confirmando';
      await setEstado(cliente.id, nuevo);
      return `Confirma tu cita:\n\n${nuevo.emoji} ${nuevo.servicio}\n📅 ${fechaLegible(nuevo.fechaStr)}\n⏰ ${horaLegible(nuevo.hora)}\n💰 $${nuevo.precio}\n\n¿Confirmas? (sí/no)`;
    }
    await setEstado(cliente.id, nuevo);
    return nuevo.fechaStr
      ? `${svc.emoji||'✂️'} ${svc.nombre}!\n\n¿A qué hora? Atendemos de 9am a 7pm.`
      : `${svc.emoji||'✂️'} ${svc.nombre}!\n\n¿Para qué día? (lunes a sábado)`;
  }

  // ── FLUJO ESPERANDO FECHA ─────────────────────────────────────
  if (estado.paso === 'esperando_fecha') {
    const fechaStr = parsearFecha(t);
    if (!fechaStr) return `No entendí la fecha 😅 Di "el viernes", "mañana" o "el 28".`;
    const d = new Date(fechaStr + 'T12:00:00');
    if (d.getDay() === 0) return `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)`;
    if (d < new Date(new Date().setHours(0,0,0,0))) return `Esa fecha ya pasó 😅 ¿Qué día te viene bien?`;
    if (estado.hora) {
      const ok = await verificarDisponibilidad(fechaStr, estado.hora);
      if (!ok) { await setEstado(cliente.id, {...estado, fechaStr, paso:'esperando_hora', hora:''}); return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 7pm.`; }
      await setEstado(cliente.id, {...estado, fechaStr, paso:'confirmando'});
      return `Confirma tu cita:\n\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n\n¿Confirmas? (sí/no)`;
    }
    await setEstado(cliente.id, {...estado, fechaStr, paso:'esperando_hora'});
    return `📅 ${fechaLegible(fechaStr)}\n\n¿A qué hora? Atendemos de 9am a 7pm.`;
  }

  // ── FLUJO ESPERANDO HORA ──────────────────────────────────────
  if (estado.paso === 'esperando_hora') {
    const hora = parsearHora(t);
    if (!hora) return `No entendí la hora 😅 Di "11am", "3pm" o "a las 2".`;
    const [h] = hora.split(':').map(Number);
    if (h < 9 || h > 19) return `Atendemos de 9am a 7pm. ¿Qué hora te viene bien?`;
    const ok = await verificarDisponibilidad(estado.fechaStr, hora);
    if (!ok) return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 7pm.`;
    await setEstado(cliente.id, {...estado, hora, paso:'confirmando'});
    return `Confirma tu cita:\n\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(hora)}\n💰 $${estado.precio}\n\n¿Confirmas? (sí/no)`;
  }

  // ── FLUJO CONFIRMANDO ─────────────────────────────────────────
  if (estado.paso === 'confirmando') {
    if (t.match(/^(sí|si|yes|confirmo|dale|ok|claro|va|órale|orale|perfecto|listo|ándale|andale|sale|np)$/)) {
      await crearCita(cliente.id, cliente.nombre, estado.servicio, estado.precio, estado.fechaStr, estado.hora);
      await setEstado(cliente.id, { paso:'inicio' });
      await notificarAdmins(`📅 Nueva cita!\n👤 ${cliente.nombre}\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n📱 ${cliente.telefono||'Sin tel'}`);
      return `Cita confirmada! 🎉\n\nTe esperamos el ${fechaLegible(estado.fechaStr)} a las ${horaLegible(estado.hora)}.\n\nSi necesitas cancelar o cambiar avísanos con tiempo 🙏`;
    }
    if (t.match(/^(no|cancel|mejor no|nop|nel|nope)$/)) {
      await setEstado(cliente.id, { paso:'inicio' });
      return `Sin problema! Si quieres agendar para otro día aquí estoy 😊`;
    }
    // Si dice algo diferente estando en confirmando — usar Claude para entender
    const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios, listaSvcs);
    if (ia.intencion === 'cancelar') {
      await setEstado(cliente.id, { paso:'inicio' });
      return `Entendido, cancelamos 😊 ¿Quieres agendar para otro día?`;
    }
    return `¿Confirmas la cita? Responde sí o no.`;
  }

  // ── MENSAJES COMPLEJOS — cancelar, reagendar, cambiar ─────────
  const esComplejo =
    t.includes('equivoc') || t.includes('cancel') || t.includes('cambiar') ||
    t.includes('cambio') || t.includes('reagendar') || t.includes('mover') ||
    t.includes('quita') || t.includes('otro día') || t.includes('otro dia') ||
    t.includes('próximo') || t.includes('proximo') || t.includes('siguiente');

  if (esComplejo) {
    const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios, listaSvcs);
    console.log('Claude IA:', JSON.stringify(ia));

    if (ia.intencion === 'cancelar') {
      const n = await cancelarCitasPendientes(cliente.id);
      await setEstado(cliente.id, { paso:'inicio' });
      await notificarAdmins(`⚠️ ${cliente.nombre} canceló su cita.\n📱 ${cliente.telefono||'Sin tel'}`);
      return n > 0
        ? `Cita cancelada. Si quieres agendar otra aquí estoy 😊`
        : `No encontré citas activas tuyas. ¿Quieres agendar una nueva?`;
    }

    if (ia.intencion === 'reagendar') {
      // Cancelar cita anterior
      await cancelarCitasPendientes(cliente.id);
      // Iniciar flujo de nueva cita con info que ya tenemos
      const svcNombre = ia.servicio || estado.servicio;
      const svc       = svcs.find(s => s.nombre === svcNombre) || svcs.find(s => s.nombre.toLowerCase().includes((svcNombre||'').toLowerCase()));
      const nuevaFecha = ia.fechaStr || parsearFecha(mensaje);
      const nuevaHora  = ia.hora     || parsearHora(mensaje);

      if (svc && nuevaFecha && nuevaHora) {
        const d = new Date(nuevaFecha + 'T12:00:00');
        if (d.getDay() === 0) {
          await setEstado(cliente.id, { paso:'esperando_fecha', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️' });
          return `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)`;
        }
        const ok = await verificarDisponibilidad(nuevaFecha, nuevaHora);
        if (!ok) {
          await setEstado(cliente.id, { paso:'esperando_hora', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:nuevaFecha });
          return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 7pm.`;
        }
        await setEstado(cliente.id, { paso:'confirmando', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:nuevaFecha, hora:nuevaHora });
        return `Cita anterior cancelada ✓\n\nConfirma la nueva:\n\n${svc.emoji||'✂️'} ${svc.nombre}\n📅 ${fechaLegible(nuevaFecha)}\n⏰ ${horaLegible(nuevaHora)}\n💰 $${svc.precio}\n\n¿Confirmas? (sí/no)`;
      }

      if (svc && nuevaFecha) {
        await setEstado(cliente.id, { paso:'esperando_hora', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:nuevaFecha });
        return `Cita anterior cancelada ✓\n\n¿A qué hora quieres la nueva? Atendemos de 9am a 7pm.`;
      }

      await setEstado(cliente.id, { paso:'esperando_servicio' });
      return `Cita anterior cancelada ✓\n\n¿Qué servicio quieres para la nueva cita?\n\n${listaSvcs}`;
    }

    // Si Claude detectó otra intención, usar su respuesta
    if (ia.respuesta) return ia.respuesta;
  }

  // ── AGENDAR DESDE MENSAJE INICIAL ────────────────────────────
  const quiereAgendar =
    t.includes('cita') || t.includes('agendar') || t.includes('reservar') || t.includes('apartar') ||
    (t.includes('quiero') && (t.includes('corte') || t.includes('servicio') || t.includes('cita'))) ||
    (t.includes('necesito') && t.includes('cita'));

  if (quiereAgendar) {
    if (infoEx.servicio && infoEx.fechaStr && infoEx.hora) {
      const d = new Date(infoEx.fechaStr + 'T12:00:00');
      if (d.getDay() === 0) {
        await setEstado(cliente.id, { paso:'esperando_fecha', ...infoEx });
        return `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)`;
      }
      const [h] = infoEx.hora.split(':').map(Number);
      if (h < 9 || h > 19) {
        await setEstado(cliente.id, { paso:'esperando_hora', ...infoEx, hora:'' });
        return `Atendemos de 9am a 7pm. ¿Qué hora te viene bien?`;
      }
      const ok = await verificarDisponibilidad(infoEx.fechaStr, infoEx.hora);
      if (!ok) {
        await setEstado(cliente.id, { paso:'esperando_hora', ...infoEx, hora:'' });
        return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 7pm.`;
      }
      await setEstado(cliente.id, { paso:'confirmando', ...infoEx });
      return `Confirma tu cita:\n\n${infoEx.emoji||'✂️'} ${infoEx.servicio}\n📅 ${fechaLegible(infoEx.fechaStr)}\n⏰ ${horaLegible(infoEx.hora)}\n💰 $${infoEx.precio}\n\n¿Confirmas? (sí/no)`;
    }
    const nuevo = { paso:'esperando_servicio', ...infoEx };
    if (infoEx.servicio) nuevo.paso = infoEx.fechaStr ? 'esperando_hora' : 'esperando_fecha';
    await setEstado(cliente.id, nuevo);
    if (infoEx.servicio && infoEx.fechaStr) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio} el ${fechaLegible(infoEx.fechaStr)}\n\n¿A qué hora? Atendemos de 9am a 7pm.`;
    if (infoEx.servicio) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio}!\n\n¿Para qué día? (lunes a sábado)`;
    return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre.`;
  }

  // ── RESPUESTAS SIMPLES ────────────────────────────────────────
  if (t.includes('precio') || t.includes('cuánto') || t.includes('cuanto') || t.includes('cuesta') || t.includes('cobran') || t.includes('sale') || t.includes('servicios')) {
    return `${saludo}Nuestros servicios:\n\n${listaSvcs}`;
  }

  if (t.includes('horario') || t.includes('abren') || t.includes('atienden') || t.includes('días') || t.includes('dias') || t.includes('cuándo') || t.includes('cuando')) {
    return `${saludo}Atendemos de lunes a sábado de 9am a 7pm.`;
  }

  if (t.match(/^(hola|buenas|buenos|buen|hi|hey|saludos|ola|buenas tardes|buenas noches|buenos días|buenos dias)/) || t.length <= 5) {
    await setEstado(cliente.id, { paso:'inicio' });
    return `${saludo}Bienvenid@ a Barbería Zaira 💅\n\n¿En qué te puedo ayudar?\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horario`;
  }

  if (t.match(/^(gracias|ok|okey|de nada|hasta luego|bye|adios|adiós|listo|perfecto|excelente|genial|👍|np)$/)) {
    return `Con gusto! Que tengas buen día 😊`;
  }

  // ── MENSAJE NO RECONOCIDO — usar Claude ───────────────────────
  const ia = await respuestaInteligente(mensaje, historial, cliente, estado, servicios, listaSvcs);

  if (ia.intencion === 'agendar' || ia.intencion === 'info') {
    if (ia.respuesta) return ia.respuesta;
  }

  await notificarAdmins(`❓ Mensaje sin respuesta de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
  return ia.respuesta || `Ahorita no tengo respuesta para eso 😅 Zaira te puede ayudar, en breve se pone en contacto 🙏`;
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

    // ── Activar sesión admin ─────────────────────────────────────
    if (mensaje.trim() === `/admin${ADMIN_PWD}`) {
      await setAdmin(tel, true);
      await setAdminBotOn(tel, false);
      console.log(`Admin activado: ${tel}`);
      return {
        statusCode:200, headers:{'Content-Type':'text/xml'},
        body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>✅ Sesión admin iniciada!\n\nEscribe /ayuda para ver los comandos disponibles.</Body></Message></Response>`,
      };
    }

    // ── Admin activo ─────────────────────────────────────────────
    const adminActivo = await esAdmin(tel);
    if (adminActivo) {
      if (mensaje.startsWith('/')) {
        const resp = await procesarComandoAdmin(mensaje, tel);
        console.log(`Comando admin [${tel}]: ${resp}`);
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${resp}</Body></Message></Response>` };
      }
      const botOn = await getAdminBotOn(tel);
      if (!botOn) {
        console.log('Admin bot OFF');
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
      }
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response  = await anthropic.messages.create({
        model:'claude-sonnet-4-20250514', max_tokens:300,
        system:`Eres Zai, asistente de Barbería Zaira. Hablas con un administrador. Responde útil y directo en español.`,
        messages:[{ role:'user', content:mensaje }],
      });
      const resp = response.content[0]?.text?.trim() || 'No entendí.';
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${resp}</Body></Message></Response>` };
    }

    // ── Flujo cliente ────────────────────────────────────────────
    let cliente = null;
    const clientesJson = await fsGet('clientes');
    for (const doc of (clientesJson.documents || [])) {
      const c      = parseDoc(doc);
      if (!c) continue;
      const telDoc = normalizarTel(c.telefono || '');
      if (telDoc.length >= 8 && telDoc === tel) { cliente = c; break; }
    }

    // Crear cliente automáticamente
    if (!cliente) {
      const ref = await fsPost('clientes', {
        nombre:   { stringValue: 'Desconocid@' },
        telefono: { stringValue: tel },
        email:    { stringValue: '' },
        notas:    { stringValue: 'Registrad@ automáticamente por WhatsApp' },
        visitas:  { integerValue: 0 },
        puntos:   { integerValue: 0 },
        creadoEn: { timestampValue: new Date().toISOString() },
      });
      if (ref?.name) {
        cliente = { id: ref.name.split('/').pop(), nombre: 'Desconocid@', telefono: tel };
        console.log(`Cliente nuevo: ${cliente.id}`);
        await notificarAdmins(`👤 Nuev@ contacto!\n📱 +52${tel}\nEdítalo en la app.`);
      }
    }

    if (!cliente) {
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>Hola! Bienvenid@ a Barbería Zaira 💅</Body></Message></Response>` };
    }

    // Verificar bot activo
    const botRes = await fsGet(`config_bot/${cliente.id}`);
    const botDoc = parseDoc(botRes);
    if (botDoc?.activo === false) {
      await guardarMsg(cliente.id, 'client', mensaje);
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
    }

    // Obtener estado e historial ANTES de guardar
    const estado    = await getEstado(cliente.id);
    const historial = await getHistorial(cliente.id);
    const svcsJson  = await fsGet('servicios');
    const servicios = (svcsJson.documents || []).map(parseDoc).filter(Boolean).filter(s => s.nombre);

    // Guardar mensaje entrante
    await guardarMsg(cliente.id, 'client', mensaje);

    // Procesar
    const respuesta = await procesarMensaje(mensaje, estado, cliente, servicios, historial);
    console.log(`Respuesta: ${respuesta}`);

    // Guardar respuesta
    await guardarMsg(cliente.id, 'bot', respuesta);

    return {
      statusCode:200, headers:{'Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>`,
    };

  } catch (err) {
    console.error('Error en webhook:', err);
    return {
      statusCode:200, headers:{'Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>En este momento no puedo responder. Intenta más tarde 🙏</Body></Message></Response>`,
    };
  }
};