const Anthropic = require('@anthropic-ai/sdk');

// ── Configuración ─────────────────────────────────────────────────
const ADMINS = [
  process.env.ADMIN_TEL_ZAIRA, // número de Zaira sin código de país
  process.env.ADMIN_TEL_JUAN,  // tu número
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
  const res  = await fetch(`${BASE_URL()}/${path}?key=${API_KEY()}`);
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

async function fsPatch(path, fields) {
  const keys = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const res  = await fetch(`${BASE_URL()}/${path}?key=${API_KEY()}&${keys}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  return res.json();
}

function parseDoc(doc) {
  const fields = doc.fields || {};
  const obj    = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue  !== undefined) obj[k] = v.stringValue;
    if (v.integerValue !== undefined) obj[k] = Number(v.integerValue);
    if (v.doubleValue  !== undefined) obj[k] = v.doubleValue;
    if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
  }
  return obj;
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    if (typeof v === 'number')  fields[k] = { integerValue: v };
    if (typeof v === 'boolean') fields[k] = { booleanValue: v };
  }
  return fields;
}

// ── Twilio: enviar mensaje ────────────────────────────────────────
async function enviarWA(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth  = Buffer.from(`${sid}:${token}`).toString('base64');
  const toWA  = to.startsWith('whatsapp:') ? to : `whatsapp:+52${normalizarTel(to)}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method:  'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ From: NUMERO_BOT, To: toWA, Body: body }),
  });
}

// ── Notificar a admins ────────────────────────────────────────────
async function notificarAdmins(mensaje) {
  for (const tel of ADMINS) {
    try { await enviarWA(tel, mensaje); } catch (e) { console.error('Error notificando admin:', e); }
  }
}

// ── Obtener estado de conversación ────────────────────────────────
async function getEstado(clienteId) {
  try {
    const res = await fsGet(`conversacion_estado/${clienteId}`);
    if (res.fields) return parseDoc(res);
  } catch {}
  return { paso: 'inicio', ultimoMensaje: null };
}

async function setEstado(clienteId, estado) {
  await fsPatch(`conversacion_estado/${clienteId}`, toFields({
    ...estado,
    ultimoMensaje: new Date().toISOString(),
  }));
}

// ── Verificar disponibilidad ──────────────────────────────────────
async function verificarDisponibilidad(fechaStr, hora) {
  const citasJson = await fsGet('citas');
  const citas = (citasJson.documents || []).map(parseDoc);
  return !citas.some(c =>
    c.fechaStr === fechaStr &&
    c.hora     === hora &&
    c.estado   !== 'cancelled'
  );
}

// ── Crear cita en Firebase ────────────────────────────────────────
async function crearCitaFirebase(clienteId, clienteNombre, servicio, precio, fechaStr, hora) {
  return fsPost('citas', toFields({
    clientId:      clienteId || '',
    clienteNombre: clienteNombre,
    servicio:      servicio,
    precio:        Number(precio) || 0,
    duracion:      30,
    hora,
    fechaStr,
    estado:        'confirmed',
    creadoEn:      new Date().toISOString(),
  }));
}

// ── Guardar mensaje ───────────────────────────────────────────────
async function guardarMensaje(clienteId, de, texto) {
  if (!clienteId) return;
  await fsPost(`clientes/${clienteId}/mensajes`, toFields({
    de,
    texto,
    timestamp: new Date().toISOString(),
    canal:     'whatsapp',
  }));
}

// ── Parsear fecha en español ──────────────────────────────────────
function parsearFecha(texto) {
  const t     = texto.toLowerCase().trim();
  const hoy   = new Date();
  const dias  = { lunes:1, martes:2, miércoles:3, miercoles:3, jueves:4, viernes:5, sábado:6, sabado:6 };

  // "hoy", "mañana"
  if (t.includes('hoy'))    return formatFecha(hoy);
  if (t.includes('mañana') || t.includes('manana')) {
    const m = new Date(hoy); m.setDate(m.getDate()+1); return formatFecha(m);
  }

  // Nombre del día: "el viernes", "este lunes"
  for (const [nombre, num] of Object.entries(dias)) {
    if (t.includes(nombre)) {
      const d = new Date(hoy);
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return formatFecha(d);
    }
  }

  // Número: "28", "el 28", "28 de marzo"
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

  const soloNum = t.match(/^(\d{1,2})$/);
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

// ── Parsear hora ──────────────────────────────────────────────────
function parsearHora(texto) {
  const t = texto.toLowerCase().replace(/\s/g,'');

  // "11am", "3pm", "11:00", "15:00", "a las 11", "11 de la mañana"
  const match1 = t.match(/(\d{1,2}):(\d{2})/);
  if (match1) {
    const h = parseInt(match1[1]), m = match1[2];
    if (h >= 9 && h <= 20) return `${String(h).padStart(2,'0')}:${m}`;
  }

  const matchAm = t.match(/(\d{1,2})am/);
  if (matchAm) {
    const h = parseInt(matchAm[1]);
    if (h >= 9 && h <= 12) return `${String(h).padStart(2,'0')}:00`;
  }

  const matchPm = t.match(/(\d{1,2})pm/);
  if (matchPm) {
    let h = parseInt(matchPm[1]);
    if (h !== 12) h += 12;
    if (h >= 9 && h <= 20) return `${String(h).padStart(2,'0')}:00`;
  }

  const matchNum = t.match(/^(\d{1,2})$/);
  if (matchNum) {
    let h = parseInt(matchNum[1]);
    if (h >= 1 && h <= 8) h += 12; // asumir pm si es 1-8
    if (h >= 9 && h <= 20) return `${String(h).padStart(2,'0')}:00`;
  }

  return null;
}

function horaLegible(hora) {
  const [h, m] = hora.split(':').map(Number);
  const ampm   = h >= 12 ? 'pm' : 'am';
  const h12    = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
}

// ── Lógica principal del bot ──────────────────────────────────────
async function procesarMensaje(mensaje, estado, cliente, servicios) {
  const t        = mensaje.toLowerCase().trim();
  const esNuevo  = !estado.ultimoMensaje;
  const minutos  = estado.ultimoMensaje
    ? (Date.now() - new Date(estado.ultimoMensaje).getTime()) / 60000
    : 999;
  const saludo   = esNuevo || minutos > 240; // saluda si es nuevo o pasaron 4+ horas

  const nombreCliente = cliente?.nombre || 'hola';
  const svcs = servicios.filter(s => s.nombre);
  const listaSvcs = svcs.map((s, i) => `${i+1}. ${s.emoji || '✂️'} ${s.nombre}: $${s.precio}`).join('\n');

  // ── FLUJO DE AGENDADO ──────────────────────────────────────────

  // Paso: esperando servicio
  if (estado.paso === 'esperando_servicio') {
    // Buscar número o nombre de servicio
    const numMatch = t.match(/^(\d+)$/);
    let svcElegido = null;

    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < svcs.length) svcElegido = svcs[idx];
    } else {
      svcElegido = svcs.find(s => t.includes(s.nombre.toLowerCase().split(' ')[0]));
    }

    if (svcElegido) {
      await setEstado(cliente?.id || 'unknown', { paso:'esperando_fecha', servicio: svcElegido.nombre, precio: svcElegido.precio });
      return `${svcElegido.emoji || '✂️'} ${svcElegido.nombre} anotado!\n\n¿Para qué día lo quieres? (de lunes a sábado)`;
    }

    // Servicio personalizado o no encontrado
    await setEstado(cliente?.id || 'unknown', { paso:'inicio' });
    return `No encontré ese servicio en el catálogo. Zaira te puede ayudar con algo especial — en breve se pone en contacto contigo 🙏`;
  }

  // Paso: esperando fecha
  if (estado.paso === 'esperando_fecha') {
    const fechaStr = parsearFecha(t);
    if (fechaStr) {
      const d = new Date(fechaStr + 'T12:00:00');
      if (d.getDay() === 0) {
        return `Los domingos no atendemos. ¿Qué otro día te viene bien? (lunes a sábado)`;
      }
      if (d < new Date(new Date().setHours(0,0,0,0))) {
        return `Esa fecha ya pasó 😅 ¿Qué día te viene bien?`;
      }
      await setEstado(cliente?.id || 'unknown', { ...estado, paso:'esperando_hora', fechaStr });
      return `📅 ${fechaLegible(fechaStr)}\n\n¿A qué hora? Atendemos de 9am a 8pm.`;
    }
    return `No entendí la fecha 😅 Puedes decirme algo como "el viernes", "mañana" o "el 28".`;
  }

  // Paso: esperando hora
  if (estado.paso === 'esperando_hora') {
    const hora = parsearHora(t);
    if (hora) {
      const disponible = await verificarDisponibilidad(estado.fechaStr, hora);
      if (!disponible) {
        return `Ese horario ya está ocupado 😬 ¿Tienes otro en mente? Atendemos de 9am a 8pm.`;
      }
      await setEstado(cliente?.id || 'unknown', { ...estado, paso:'confirmando', hora });
      return `Perfecto! Confirma tu cita:\n\n${estado.servicio ? `✂️ ${estado.servicio}` : ''}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(hora)}\n💰 $${estado.precio}\n\n¿Confirmas? (sí/no)`;
    }
    return `No entendí la hora 😅 Puedes decirme algo como "11am", "3pm" o "a las 2".`;
  }

  // Paso: confirmando
  if (estado.paso === 'confirmando') {
    if (t.includes('sí') || t.includes('si') || t.includes('confirmo') || t.includes('yes') || t.includes('dale') || t.includes('ok') || t.includes('claro')) {
      // Crear cita en Firebase
      await crearCitaFirebase(
        cliente?.id || null,
        cliente?.nombre || 'Clienta',
        estado.servicio,
        estado.precio,
        estado.fechaStr,
        estado.hora,
      );
      await setEstado(cliente?.id || 'unknown', { paso:'inicio' });

      // Notificar a admins
      await notificarAdmins(
        `📅 Nueva cita agendada!\n` +
        `👤 ${cliente?.nombre || 'Clienta nueva'}\n` +
        `✂️ ${estado.servicio}\n` +
        `📅 ${fechaLegible(estado.fechaStr)}\n` +
        `⏰ ${horaLegible(estado.hora)}\n` +
        `📱 ${cliente?.telefono || 'Sin teléfono'}`
      );

      return `Cita confirmada! 🎉\n\nTe esperamos el ${fechaLegible(estado.fechaStr)} a las ${horaLegible(estado.hora)}.\n\nSi necesitas cancelar o cambiar tu cita avísanos con tiempo 🙏`;
    }

    if (t.includes('no') || t.includes('cancel') || t.includes('mejor no')) {
      await setEstado(cliente?.id || 'unknown', { paso:'inicio' });
      return `Sin problema! Si quieres agendar para otro día o cambiar algo aquí estoy 😊`;
    }

    return `¿Confirmas la cita? Responde sí o no.`;
  }

  // ── INTENCIONES GENERALES ──────────────────────────────────────

  // Cancelar cita existente
  if (t.includes('cancelar') || t.includes('cancela') || t.includes('quiero cancelar')) {
    await notificarAdmins(`⚠️ ${cliente?.nombre || 'Una clienta'} quiere cancelar su cita.\n📱 ${cliente?.telefono || 'Sin teléfono'}`);
    await setEstado(cliente?.id || 'unknown', { paso:'inicio' });
    return `Entendido, le avisaré a Zaira para cancelar tu cita. En breve te confirman 🙏`;
  }

  // Cambiar cita
  if (t.includes('cambiar') || t.includes('cambio') || t.includes('reagendar') || t.includes('mover')) {
    await notificarAdmins(`🔄 ${cliente?.nombre || 'Una clienta'} quiere cambiar su cita.\n📱 ${cliente?.telefono || 'Sin teléfono'}`);
    await setEstado(cliente?.id || 'unknown', { paso:'inicio' });
    return `Le aviso a Zaira para que te ayude a cambiar tu cita. En breve te contacta 🙏`;
  }

  // Agendar cita
  if (t.includes('cita') || t.includes('agendar') || t.includes('reservar') || t.includes('apartar') || t.includes('quiero') && t.includes('corte') || t.includes('quiero') && t.includes('servicio')) {
    await setEstado(cliente?.id || 'unknown', { paso:'esperando_servicio' });
    const intro = saludo ? `Hola${cliente?.nombre ? ` ${cliente.nombre.split(' ')[0]}` : ''}! 😊 ` : '';
    return `${intro}¿Qué servicio te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre del servicio.`;
  }

  // Precios
  if (t.includes('precio') || t.includes('cuánto') || t.includes('cuanto') || t.includes('cuesta') || t.includes('cobran') || t.includes('sale')) {
    const intro = saludo ? `Hola${cliente?.nombre ? ` ${cliente.nombre.split(' ')[0]}` : ''}! 😊\n\n` : '';
    return `${intro}Estos son nuestros servicios:\n\n${listaSvcs}`;
  }

  // Horario
  if (t.includes('horario') || t.includes('hora') || t.includes('abren') || t.includes('atienden') || t.includes('días') || t.includes('dias')) {
    const intro = saludo ? `Hola${cliente?.nombre ? ` ${cliente.nombre.split(' ')[0]}` : ''}! 😊\n\n` : '';
    return `${intro}Atendemos de lunes a sábado de 9am a 8pm.`;
  }

  // Saludo / inicio
  if (t.match(/^(hola|buenas|buenos|buen|hi|hey|saludos|qué tal|que tal|ola)/) || t.length < 6) {
    await setEstado(cliente?.id || 'unknown', { paso:'inicio' });
    if (saludo) {
      return `Hola${cliente?.nombre ? ` ${cliente.nombre.split(' ')[0]}` : ''}! 😊 Bienvenida a Barbería Zaira.\n\n¿En qué te puedo ayudar?\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horarios`;
    }
    return `¿En qué más te puedo ayudar? 😊`;
  }

  // Servicio personalizado o fuera del catálogo
  if (t.includes('otro') || t.includes('especial') || t.includes('diferente') || t.includes('personalizado')) {
    await notificarAdmins(`💬 ${cliente?.nombre || 'Una clienta'} pregunta por un servicio especial:\n"${mensaje}"\n📱 ${cliente?.telefono || 'Sin teléfono'}`);
    return `Para servicios especiales Zaira te atiende personalmente. En breve se pone en contacto contigo 🙏`;
  }

  // Respuesta general con Claude para lo que no entendemos
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response  = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `Eres Zai, asistente de Barbería Zaira. SOLO respondes sobre: precios, horarios, citas y servicios de la barbería.
Servicios: ${listaSvcs}
Horario: lunes a sábado 9am-8pm.
Si preguntan algo fuera de la barbería, diles amablemente que solo puedes ayudar con temas del negocio.
NUNCA menciones links ni páginas web. Máximo 2 oraciones. Sin markdown.`,
    messages: [{ role:'user', content: mensaje }],
  });
  return response.content[0]?.text?.trim() || `No entendí bien tu mensaje 😅 ¿Me puedes decir si quieres ver precios, agendar una cita o saber el horario?`;
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

    // Si es admin, no responder automáticamente
    if (esAdmin(tel)) {
      console.log('Mensaje de admin — ignorado');
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
    }

    const baseUrl = BASE_URL();
    const apiKey  = API_KEY();

    // Buscar cliente
    let cliente = null;
    const clientesJson = await fsGet('clientes');
    for (const doc of (clientesJson.documents || [])) {
      const c      = parseDoc(doc);
      const telDoc = normalizarTel(c.telefono || '');
      if (telDoc.length >= 8 && telDoc === tel) { cliente = c; break; }
    }

    // Verificar si bot está activo
    if (cliente) {
      const botRes  = await fsGet(`config_bot/${cliente.id}`);
      const botJson = botRes.fields ? parseDoc(botRes) : {};
      if (botJson.activo === false) {
        await guardarMensaje(cliente.id, 'client', mensaje);
        console.log('Bot OFF — guardando mensaje sin responder');
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
      }
    }

    // Obtener estado de conversación
    const estado = cliente ? await getEstado(cliente.id) : { paso:'inicio', ultimoMensaje: null };

    // Obtener servicios
    const svcsJson = await fsGet('servicios');
    const servicios = (svcsJson.documents || []).map(parseDoc).filter(s => s.nombre);

    // Guardar mensaje entrante
    await guardarMensaje(cliente?.id || null, 'client', mensaje);

    // Procesar y generar respuesta
    const respuesta = await procesarMensaje(mensaje, estado, cliente, servicios);
    console.log(`Respuesta: ${respuesta}`);

    // Guardar respuesta
    await guardarMensaje(cliente?.id || null, 'bot', respuesta);

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