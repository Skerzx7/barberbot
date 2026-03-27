const Anthropic = require('@anthropic-ai/sdk');

// ── Configuración ─────────────────────────────────────────────────
const ADMINS = [
  process.env.ADMIN_TEL_ZAIRA,
  process.env.ADMIN_TEL_JUAN,
].filter(Boolean);

const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';

function normalizarTel(tel) {
  return tel.replace(/\D/g, '').replace(/^521?/, '').slice(-10);
}

function esAdmin(tel) {
  return ADMINS.includes(normalizarTel(tel));
}

// ── Firestore REST ────────────────────────────────────────────────
const PROJECT_ID = () => process.env.FIREBASE_PROJECT_ID;
const API_KEY    = () => process.env.VITE_FIREBASE_API_KEY;
const BASE_URL   = () => `https://firestore.googleapis.com/v1/projects/${PROJECT_ID()}/databases/(default)/documents`;

async function fsGet(path) {
  const res = await fetch(`${BASE_URL()}/${path}?key=${API_KEY()}`);
  return res.json();
}

async function fsSet(path, fields) {
  const res = await fetch(`${BASE_URL()}/${path}?key=${API_KEY()}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  return res.json();
}

async function fsPost(path, fields) {
  const res = await fetch(`${BASE_URL()}/${path}?key=${API_KEY()}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  return res.json();
}

function parseDoc(doc) {
  if (!doc?.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue   !== undefined) obj[k] = v.stringValue;
    if (v.integerValue  !== undefined) obj[k] = Number(v.integerValue);
    if (v.doubleValue   !== undefined) obj[k] = v.doubleValue;
    if (v.booleanValue  !== undefined) obj[k] = v.booleanValue;
    if (v.timestampValue !== undefined) obj[k] = v.timestampValue;
  }
  return obj;
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    if (typeof v === 'number')  fields[k] = { integerValue: v };
    if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }
  return fields;
}

// ── Twilio ────────────────────────────────────────────────────────
async function enviarWA(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth  = Buffer.from(`${sid}:${token}`).toString('base64');
  const toWA  = to.startsWith('whatsapp:') ? to : `whatsapp:+52${normalizarTel(to)}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method:  'POST',
    headers: { Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ From:NUMERO_BOT, To:toWA, Body:body }),
  });
}

async function notificarAdmins(msg) {
  for (const tel of ADMINS) {
    try { await enviarWA(tel, msg); } catch(e) { console.error('Error notif admin:', e); }
  }
}

// ── Estado de conversación ────────────────────────────────────────
async function getEstado(clienteId) {
  try {
    const res = await fsGet(`conversacion_estado/${clienteId}`);
    const doc = parseDoc(res);
    if (doc) return doc;
  } catch {}
  return { paso:'inicio', ultimoMensaje:'' };
}

// FIX: setEstado guarda ultimoMensaje UNA SOLA VEZ — no actualizar de nuevo al final del handler
async function setEstado(clienteId, estado) {
  await fsSet(`conversacion_estado/${clienteId}`, toFields({
    paso:          estado.paso          || 'inicio',
    servicio:      estado.servicio      || '',
    precio:        Number(estado.precio || 0),
    emoji:         estado.emoji         || '',
    fechaStr:      estado.fechaStr      || '',
    hora:          estado.hora          || '',
    ultimoMensaje: new Date().toISOString(),
  }));
}

// ── Estado admin ──────────────────────────────────────────────────
async function getAdminBot(tel) {
  try {
    const res = await fsGet(`admin_bot/${normalizarTel(tel)}`);
    const doc = parseDoc(res);
    return doc?.activo === true;
  } catch {}
  return false;
}

async function setAdminBot(tel, activo) {
  await fsSet(`admin_bot/${normalizarTel(tel)}`, toFields({ activo }));
}

// ── Guardar mensaje compatible con la app ─────────────────────────
// FIX: usar timestampValue para que la app lo lea correctamente
async function guardarMsg(clienteId, de, texto) {
  if (!clienteId) return;
  await fsPost(`clientes/${clienteId}/mensajes`, {
    de:        { stringValue: de },
    texto:     { stringValue: texto },
    canal:     { stringValue: 'whatsapp' },
    timestamp: { timestampValue: new Date().toISOString() },
  });
}

// ── Helpers de fecha/hora ─────────────────────────────────────────
function parsearFecha(texto) {
  const t   = texto.toLowerCase().trim();
  const hoy = new Date();
  const dias = { lunes:1, martes:2, 'miércoles':3, miercoles:3, jueves:4, viernes:5, 'sábado':6, sabado:6 };

  if (t.includes('hoy')) return formatFecha(hoy);
  if (t.includes('mañana') || t.includes('manana')) {
    const m = new Date(hoy); m.setDate(m.getDate()+1); return formatFecha(m);
  }
  for (const [nombre, num] of Object.entries(dias)) {
    if (t.includes(nombre)) {
      const d    = new Date(hoy);
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
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

function fechaLegible(fechaStr) {
  const d    = new Date(fechaStr + 'T12:00:00');
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses= ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
}

function parsearHora(texto) {
  const t = texto.toLowerCase().replace(/\s/g,'');
  const match1 = t.match(/(\d{1,2}):(\d{2})/);
  if (match1) { const h = parseInt(match1[1]); if (h>=9&&h<=20) return `${String(h).padStart(2,'0')}:${match1[2]}`; }
  const matchAm = t.match(/(\d{1,2})am/);
  if (matchAm) { const h = parseInt(matchAm[1]); if (h>=9&&h<=12) return `${String(h).padStart(2,'0')}:00`; }
  const matchPm = t.match(/(\d{1,2})pm/);
  if (matchPm) { let h = parseInt(matchPm[1]); if (h!==12) h+=12; if (h>=9&&h<=20) return `${String(h).padStart(2,'0')}:00`; }
  const matchLas = t.match(/(?:alas|las)(\d{1,2})/);
  if (matchLas) { let h = parseInt(matchLas[1]); if (h>=1&&h<=8) h+=12; if (h>=9&&h<=20) return `${String(h).padStart(2,'0')}:00`; }
  const soloNum = t.match(/^(\d{1,2})$/);
  if (soloNum) { let h = parseInt(soloNum[1]); if (h>=1&&h<=8) h+=12; if (h>=9&&h<=20) return `${String(h).padStart(2,'0')}:00`; }
  return null;
}

function horaLegible(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  const ampm   = h >= 12 ? 'pm' : 'am';
  const h12    = h > 12 ? h-12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
}

// ── Extraer info de mensaje libre ─────────────────────────────────
function extraerInfoCita(texto, servicios) {
  const info = {};
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

// ── Verificar disponibilidad ──────────────────────────────────────
async function verificarDisponibilidad(fechaStr, hora) {
  const res   = await fsGet('citas');
  const citas = (res.documents || []).map(parseDoc).filter(Boolean);
  return !citas.some(c => c.fechaStr === fechaStr && c.hora === hora && c.estado !== 'cancelled');
}

// ── Crear cita ────────────────────────────────────────────────────
async function crearCita(clienteId, clienteNombre, servicio, precio, fechaStr, hora) {
  return fsPost('citas', toFields({
    clientId:      clienteId || '',
    clienteNombre: clienteNombre || 'Clienta',
    servicio:      servicio || '',
    precio:        Number(precio) || 0,
    duracion:      30,
    hora:          hora || '',
    fechaStr:      fechaStr || '',
    estado:        'confirmed',
    creadoEn:      new Date().toISOString(),
  }));
}

// ── Comandos admin ────────────────────────────────────────────────
async function procesarComandoAdmin(comando, from) {
  const cmd = comando.trim().toLowerCase();

  if (cmd === '/on') {
    await setAdminBot(from, true);
    return '✅ Bot ON — ahora responderé tus mensajes.';
  }
  if (cmd === '/off') {
    await setAdminBot(from, false);
    return '⛔ Bot OFF — ya no responderé tus mensajes.';
  }
  if (cmd === '/citas') {
    const hoyStr  = formatFecha(new Date());
    const res     = await fsGet('citas');
    const citas   = (res.documents || []).map(parseDoc).filter(Boolean);
    const hoyList = citas.filter(c => c.fechaStr === hoyStr && c.estado !== 'cancelled')
                         .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!hoyList.length) return '📅 No hay citas para hoy.';
    return `📅 Citas hoy (${hoyList.length}):\n\n` + hoyList.map(c => `⏰ ${horaLegible(c.hora)} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (cmd === '/mañana' || cmd === '/manana') {
    const manana    = new Date(); manana.setDate(manana.getDate()+1);
    const mananaStr = formatFecha(manana);
    const res       = await fsGet('citas');
    const citas     = (res.documents || []).map(parseDoc).filter(Boolean);
    const list      = citas.filter(c => c.fechaStr === mananaStr && c.estado !== 'cancelled')
                           .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!list.length) return '📅 No hay citas para mañana.';
    return `📅 Citas mañana (${list.length}):\n\n` + list.map(c => `⏰ ${horaLegible(c.hora)} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (cmd === '/clientes') {
    const res      = await fsGet('clientes');
    const clientes = (res.documents || []).map(parseDoc).filter(Boolean);
    return `👥 Clientas registradas: ${clientes.length}`;
  }
  if (cmd === '/ayuda') {
    return `/on — Bot te responde\n/off — Bot te ignora\n/citas — Citas de hoy\n/mañana — Citas de mañana\n/clientes — Total clientas\n/ayuda — Esta lista`;
  }
  return `Comando no reconocido. Escribe /ayuda.`;
}

// ── Lógica del bot ────────────────────────────────────────────────
async function procesarMensaje(mensaje, estado, cliente, servicios) {
  const t     = mensaje.toLowerCase().trim();
  const ahora = new Date();

  const minutos = estado.ultimoMensaje
    ? (ahora.getTime() - new Date(estado.ultimoMensaje).getTime()) / 60000
    : 999;

  // FIX: solo saluda si es la primera vez o pasaron 4+ horas
  const saludar   = !estado.ultimoMensaje || minutos > 240;
  const nombre    = cliente?.nombre?.split(' ')[0] || '';
  const saludo    = saludar ? `Hola${nombre ? ` ${nombre}` : ''}! 😊\n\n` : '';

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
        await setEstado(cliente?.id || 'unknown', { paso:'inicio' });
        await notificarAdmins(`💬 Servicio especial de ${cliente?.nombre || 'clienta'}:\n"${mensaje}"\n📱 ${cliente?.telefono || 'Sin tel'}`);
        return `Para ese servicio especial Zaira te atiende personalmente. En breve te contacta 🙏`;
      }
      return `No encontré ese servicio 😅 Elige un número o escribe el nombre:\n\n${listaSvcs}`;
    }

    const nuevo = { paso:'esperando_fecha', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️' };
    if (estado.fechaStr) nuevo.fechaStr = estado.fechaStr;
    if (estado.hora)     nuevo.hora     = estado.hora;

    if (nuevo.fechaStr && nuevo.hora) {
      const ok = await verificarDisponibilidad(nuevo.fechaStr, nuevo.hora);
      if (!ok) { nuevo.paso = 'esperando_hora'; nuevo.hora = ''; await setEstado(cliente?.id||'unknown', nuevo); return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 8pm.`; }
      nuevo.paso = 'confirmando';
      await setEstado(cliente?.id||'unknown', nuevo);
      return `Confirma tu cita:\n\n${nuevo.emoji} ${nuevo.servicio}\n📅 ${fechaLegible(nuevo.fechaStr)}\n⏰ ${horaLegible(nuevo.hora)}\n💰 $${nuevo.precio}\n\n¿Confirmas? (sí/no)`;
    }
    await setEstado(cliente?.id||'unknown', nuevo);
    return nuevo.fechaStr
      ? `${svc.emoji||'✂️'} ${svc.nombre}!\n\n¿A qué hora? Atendemos de 9am a 8pm.`
      : `${svc.emoji||'✂️'} ${svc.nombre}!\n\n¿Para qué día? (lunes a sábado)`;
  }

  // ── FLUJO ESPERANDO FECHA ─────────────────────────────────────
  if (estado.paso === 'esperando_fecha') {
    const fechaStr = parsearFecha(t);
    if (!fechaStr) return `No entendí la fecha 😅 Puedes decir "el viernes", "mañana" o "el 28".`;
    const d = new Date(fechaStr + 'T12:00:00');
    if (d.getDay() === 0) return `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)`;
    if (d < new Date(new Date().setHours(0,0,0,0))) return `Esa fecha ya pasó 😅 ¿Qué día te viene bien?`;
    if (estado.hora) {
      const ok = await verificarDisponibilidad(fechaStr, estado.hora);
      if (!ok) { await setEstado(cliente?.id||'unknown', {...estado, fechaStr, paso:'esperando_hora', hora:''}); return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 8pm.`; }
      await setEstado(cliente?.id||'unknown', {...estado, fechaStr, paso:'confirmando'});
      return `Confirma tu cita:\n\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n\n¿Confirmas? (sí/no)`;
    }
    await setEstado(cliente?.id||'unknown', {...estado, fechaStr, paso:'esperando_hora'});
    return `📅 ${fechaLegible(fechaStr)}\n\n¿A qué hora? Atendemos de 9am a 8pm.`;
  }

  // ── FLUJO ESPERANDO HORA ──────────────────────────────────────
  if (estado.paso === 'esperando_hora') {
    const hora = parsearHora(t);
    if (!hora) return `No entendí la hora 😅 Puedes decir "11am", "3pm" o "a las 2".`;
    const [h] = hora.split(':').map(Number);
    if (h < 9 || h > 20) return `Ese horario está fuera de nuestro rango. Atendemos de 9am a 8pm.`;
    const ok = await verificarDisponibilidad(estado.fechaStr, hora);
    if (!ok) return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 8pm.`;
    await setEstado(cliente?.id||'unknown', {...estado, hora, paso:'confirmando'});
    return `Confirma tu cita:\n\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(hora)}\n💰 $${estado.precio}\n\n¿Confirmas? (sí/no)`;
  }

  // ── FLUJO CONFIRMANDO ─────────────────────────────────────────
  if (estado.paso === 'confirmando') {
    if (t.match(/^(sí|si|yes|confirmo|dale|ok|claro|va|órale|orale|perfecto|listo|ándale|andale)$/)) {
      await crearCita(cliente?.id, cliente?.nombre||'Clienta', estado.servicio, estado.precio, estado.fechaStr, estado.hora);
      await setEstado(cliente?.id||'unknown', { paso:'inicio' });
      await notificarAdmins(`📅 Nueva cita!\n👤 ${cliente?.nombre||'Clienta nueva'}\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n📱 ${cliente?.telefono||'Sin tel'}`);
      return `Cita confirmada! 🎉\n\nTe esperamos el ${fechaLegible(estado.fechaStr)} a las ${horaLegible(estado.hora)}.\n\nSi necesitas cancelar avísanos con tiempo 🙏`;
    }
    if (t.match(/^(no|cancel|mejor no|nop|nel|nope)$/)) {
      await setEstado(cliente?.id||'unknown', { paso:'inicio' });
      return `Sin problema! Si quieres agendar para otro día aquí estoy 😊`;
    }
    return `¿Confirmas la cita? Responde sí o no.`;
  }

  // ── INTENCIONES GENERALES ─────────────────────────────────────

  if (t.includes('cancelar') || t.includes('cancela') || t.includes('quiero cancelar')) {
    await notificarAdmins(`⚠️ ${cliente?.nombre||'Clienta'} quiere cancelar su cita.\n📱 ${cliente?.telefono||'Sin tel'}`);
    await setEstado(cliente?.id||'unknown', { paso:'inicio' });
    return `Entendido, le avisaré a Zaira. En breve te confirman 🙏`;
  }

  if (t.includes('cambiar') || t.includes('cambio') || t.includes('reagendar') || t.includes('mover') || t.includes('otro día') || t.includes('otro dia')) {
    await notificarAdmins(`🔄 ${cliente?.nombre||'Clienta'} quiere cambiar su cita.\n📱 ${cliente?.telefono||'Sin tel'}`);
    await setEstado(cliente?.id||'unknown', { paso:'inicio' });
    return `Le aviso a Zaira. En breve te contacta 🙏`;
  }

  const quiereAgendar = t.includes('cita') || t.includes('agendar') || t.includes('reservar') || t.includes('apartar') || (t.includes('quiero') && (t.includes('corte') || t.includes('servicio') || t.includes('cita')));
  if (quiereAgendar) {
    if (infoEx.servicio && infoEx.fechaStr && infoEx.hora) {
      const d = new Date(infoEx.fechaStr + 'T12:00:00');
      if (d.getDay() === 0) { await setEstado(cliente?.id||'unknown', {paso:'esperando_fecha', servicio:infoEx.servicio, precio:infoEx.precio}); return `Los domingos no atendemos. ¿Qué otro día?`; }
      const ok = await verificarDisponibilidad(infoEx.fechaStr, infoEx.hora);
      if (!ok) { await setEstado(cliente?.id||'unknown', {paso:'esperando_hora', ...infoEx}); return `Ese horario ya está ocupado 😬 ¿Tienes otro? Atendemos de 9am a 8pm.`; }
      await setEstado(cliente?.id||'unknown', {paso:'confirmando', ...infoEx});
      return `Confirma tu cita:\n\n${infoEx.emoji||'✂️'} ${infoEx.servicio}\n📅 ${fechaLegible(infoEx.fechaStr)}\n⏰ ${horaLegible(infoEx.hora)}\n💰 $${infoEx.precio}\n\n¿Confirmas? (sí/no)`;
    }
    const nuevo = { paso:'esperando_servicio', ...infoEx };
    if (infoEx.servicio) nuevo.paso = infoEx.fechaStr ? 'esperando_hora' : 'esperando_fecha';
    await setEstado(cliente?.id||'unknown', nuevo);
    if (infoEx.servicio && infoEx.fechaStr) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio} el ${fechaLegible(infoEx.fechaStr)}\n\n¿A qué hora? Atendemos de 9am a 8pm.`;
    if (infoEx.servicio) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio}!\n\n¿Para qué día? (lunes a sábado)`;
    return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre.`;
  }

  if (t.includes('precio') || t.includes('cuánto') || t.includes('cuanto') || t.includes('cuesta') || t.includes('cobran') || t.includes('sale') || t.includes('servicios')) {
    return `${saludo}Nuestros servicios:\n\n${listaSvcs}`;
  }

  if (t.includes('horario') || t.includes('abren') || t.includes('atienden') || t.includes('días') || t.includes('dias') || t.includes('cuándo') || t.includes('cuando')) {
    return `${saludo}Atendemos de lunes a sábado de 9am a 8pm.`;
  }

  if (t.match(/^(hola|buenas|buenos|buen|hi|hey|saludos|ola|buenas tardes|buenas noches|buenos días|buenos dias)/) || t.length <= 5) {
    await setEstado(cliente?.id||'unknown', { paso:'inicio' });
    return `${saludo}Bienvenida a Barbería Zaira 💅\n\n¿En qué te puedo ayudar?\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horario`;
  }

  if (t.match(/^(gracias|ok|okey|de nada|hasta luego|bye|adios|adiós|listo|perfecto|excelente|genial|👍)$/)) {
    return `Con gusto! Que tengas buen día 😊`;
  }

  // Mensaje no reconocido — notificar a admins
  await notificarAdmins(`❓ Mensaje sin respuesta de ${cliente?.nombre||'clienta nueva'}:\n"${mensaje}"\n📱 ${cliente?.telefono||'Sin tel'}`);
  return `Ahorita no tengo respuesta para eso 😅 Zaira te puede ayudar, en breve se pone en contacto 🙏`;
}

// ── Handler principal ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method not allowed' };

  try {
    const params  = new URLSearchParams(event.body);
    const mensaje = params.get('Body')?.trim() || '';
    const from    = params.get('From') || '';
    const tel     = normalizarTel(from.replace('whatsapp:', ''));

    if (!mensaje) return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };

    console.log(`Mensaje de ${from} (${tel}): ${mensaje}`);

    // ── ADMIN ────────────────────────────────────────────────────
    if (esAdmin(tel)) {
      if (mensaje.startsWith('/')) {
        const respuesta = await procesarComandoAdmin(mensaje, from);
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>` };
      }
      const botOn = await getAdminBot(from);
      if (!botOn) {
        console.log('Admin bot OFF');
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
      }
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response  = await anthropic.messages.create({
        model:'claude-sonnet-4-20250514', max_tokens:300,
        system:`Eres Zai, asistente de Barbería Zaira. Hablas con un administrador. Responde útil y directo.`,
        messages:[{ role:'user', content:mensaje }],
      });
      const respuesta = response.content[0]?.text?.trim() || 'No entendí.';
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>` };
    }

    // ── CLIENTE ──────────────────────────────────────────────────
    let cliente = null;
    const clientesJson = await fsGet('clientes');
    console.log(`Buscando cliente con tel: ${tel}`);
    for (const doc of (clientesJson.documents || [])) {
      const c      = parseDoc(doc);
      if (!c) continue;
      const telDoc = normalizarTel(c.telefono || '');
      console.log(`Comparando: [${telDoc}] vs [${tel}]`);
      if (telDoc.length >= 8 && telDoc === tel) { cliente = c; break; }
    }
    console.log(`Cliente encontrado: ${cliente ? cliente.nombre : 'NO ENCONTRADO'}`);

    if (cliente) {
      const botRes = await fsGet(`config_bot/${cliente.id}`);
      const botDoc = parseDoc(botRes);
      if (botDoc?.activo === false) {
        await guardarMsg(cliente.id, 'client', mensaje);
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
      }
    }

    // FIX: obtener estado ANTES de guardar el mensaje para leer ultimoMensaje correcto
    const estado   = cliente ? await getEstado(cliente.id) : { paso:'inicio', ultimoMensaje:'' };
    const svcsJson = await fsGet('servicios');
    const servicios = (svcsJson.documents || []).map(parseDoc).filter(Boolean).filter(s => s.nombre);

    // Guardar mensaje entrante
    await guardarMsg(cliente?.id || null, 'client', mensaje);

    // Procesar — setEstado se llama dentro y actualiza ultimoMensaje
    const respuesta = await procesarMensaje(mensaje, estado, cliente, servicios);
    console.log(`Respuesta: ${respuesta}`);

    // Guardar respuesta
    await guardarMsg(cliente?.id || null, 'bot', respuesta);

    // FIX: NO actualizar estado aquí — ya se actualizó dentro de procesarMensaje
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>`;
    return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:twiml };

  } catch (err) {
    console.error('Error en webhook:', err);
    return {
      statusCode:200,
      headers:{'Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>En este momento no puedo responder. Intenta más tarde 🙏</Body></Message></Response>`,
    };
  }
};