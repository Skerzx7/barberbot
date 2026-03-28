/**
 * BarberBot — Barbería Zaira
 * Arquitectura: Claude maneja TODO el lenguaje natural.
 * La lógica determinista solo hace operaciones en Firestore (verificar, crear, cancelar citas).
 * Claude recibe el estado completo y decide qué hacer con cada mensaje.
 */

const Anthropic = require('@anthropic-ai/sdk');

const ADMIN_PWD  = process.env.ADMIN_PASSWORD || '1307';
const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';

// ── Timezone México ───────────────────────────────────────────────
function nowMX() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
}
function hoyMX() {
  const d = nowMX(); d.setHours(0,0,0,0); return d;
}
function formatFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function hoyStr() { return formatFecha(hoyMX()); }
function fechaEsPasada(fs) { return new Date(fs+'T12:00:00') < hoyMX(); }

// ── Firestore REST ────────────────────────────────────────────────
const PID    = () => process.env.FIREBASE_PROJECT_ID;
const APIKEY = () => process.env.VITE_FIREBASE_API_KEY;
const BASE   = () => `https://firestore.googleapis.com/v1/projects/${PID()}/databases/(default)/documents`;

async function fsGet(path) {
  const r = await fetch(`${BASE()}/${path}?key=${APIKEY()}`);
  return r.json();
}
async function fsSet(path, fields) {
  const r = await fetch(`${BASE()}/${path}?key=${APIKEY()}`, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fields}),
  });
  return r.json();
}
async function fsPost(path, fields) {
  const r = await fetch(`${BASE()}/${path}?key=${APIKEY()}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fields}),
  });
  return r.json();
}

function parseDoc(doc) {
  if (!doc?.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k,v] of Object.entries(doc.fields)) {
    if (v.stringValue   !== undefined) obj[k] = v.stringValue;
    if (v.integerValue  !== undefined) obj[k] = Number(v.integerValue);
    if (v.doubleValue   !== undefined) obj[k] = v.doubleValue;
    if (v.booleanValue  !== undefined) obj[k] = v.booleanValue;
    if (v.timestampValue !== undefined) obj[k] = v.timestampValue;
  }
  return obj;
}
function toFields(obj) {
  const f = {};
  for (const [k,v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string')  f[k] = { stringValue: v };
    if (typeof v === 'number')  f[k] = { integerValue: v };
    if (typeof v === 'boolean') f[k] = { booleanValue: v };
  }
  return f;
}

// ── Twilio ────────────────────────────────────────────────────────
function normalizarTel(tel) {
  return tel.replace(/\D/g,'').replace(/^521?/,'').slice(-10);
}
async function enviarWA(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth  = Buffer.from(`${sid}:${token}`).toString('base64');
  const toWA  = to.startsWith('whatsapp:') ? to : `whatsapp:+52${to}`;
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:'POST',
      headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: NUMERO_BOT, To: toWA, Body: body }),
    });
  } catch(e) { console.error('enviarWA error:', e.message); }
}
async function notificarAdmins(msg) {
  const tels = [process.env.ADMIN_TEL_ZAIRA, process.env.ADMIN_TEL_JUAN].filter(Boolean);
  for (const t of tels) await enviarWA(t, msg);
}

// ── Estado conversación ───────────────────────────────────────────
async function getEstado(id) {
  try {
    const doc = parseDoc(await fsGet(`conversacion_estado/${id}`));
    if (doc) return doc;
  } catch {}
  return { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'', ultimoMensaje:'' };
}
async function setEstado(id, estado) {
  await fsSet(`conversacion_estado/${id}`, toFields({
    paso:          estado.paso       || 'inicio',
    servicio:      estado.servicio   || '',
    precio:        Number(estado.precio || 0),
    emoji:         estado.emoji      || '',
    fechaStr:      estado.fechaStr   || '',
    hora:          estado.hora       || '',
    ultimoMensaje: new Date().toISOString(),
  }));
}

// ── Mensajes ──────────────────────────────────────────────────────
async function guardarMsg(clienteId, de, texto) {
  if (!clienteId) return;
  await fsPost(`clientes/${clienteId}/mensajes`, {
    de:        { stringValue: de },
    texto:     { stringValue: texto },
    canal:     { stringValue: 'whatsapp' },
    timestamp: { timestampValue: new Date().toISOString() },
  });
}
async function getHistorial(clienteId) {
  try {
    const res  = await fsGet(`clientes/${clienteId}/mensajes`);
    const msgs = (res.documents || []).map(parseDoc).filter(Boolean)
      .sort((a,b) => new Date(a.timestamp||0) - new Date(b.timestamp||0))
      .slice(-10)
      .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content:(m.texto||'').trim() }))
      .filter(m => m.content);
    // Garantizar alternancia user/assistant — la API de Anthropic lo requiere
    const alt = [];
    for (const m of msgs) {
      if (alt.length && alt[alt.length-1].role === m.role) alt[alt.length-1] = m;
      else alt.push(m);
    }
    while (alt.length && alt[0].role !== 'user') alt.shift();
    return alt;
  } catch { return []; }
}

// ── Citas ─────────────────────────────────────────────────────────
async function verificarDisponibilidad(fechaStr, hora) {
  const res   = await fsGet('citas');
  const citas = (res.documents||[]).map(parseDoc).filter(Boolean);
  return !citas.some(c => c.fechaStr === fechaStr && c.hora === hora && c.estado !== 'cancelled');
}
async function crearCita(clienteId, nombre, servicio, precio, fechaStr, hora) {
  const ref = await fsPost('citas', toFields({
    clientId: clienteId||'', clienteNombre: nombre||'Clienta',
    servicio: servicio||'', precio: Number(precio)||0,
    duracion: 30, hora: hora||'', fechaStr: fechaStr||'',
    estado: 'confirmed', creadoEn: new Date().toISOString(),
  }));
  return ref;
}
async function cancelarCitasPendientes(clienteId) {
  const res  = await fsGet('citas');
  const pend = (res.documents||[]).map(parseDoc).filter(Boolean)
    .filter(c => c.clientId === clienteId && c.estado === 'confirmed');
  for (const c of pend) await fsSet(`citas/${c.id}`, toFields({...c, estado:'cancelled'}));
  return pend.length;
}

// ── Tools de Claude ───────────────────────────────────────────────
const TOOLS = [
  {
    name: 'verificar_horario',
    description: 'Verifica en tiempo real si un horario específico está disponible antes de ofrecérselo a la clienta.',
    input_schema: {
      type:'object',
      properties: {
        fechaStr: { type:'string', description:'Fecha YYYY-MM-DD' },
        hora:     { type:'string', description:'Hora HH:MM en 24h, ej: 10:00, 15:30' },
      },
      required: ['fechaStr','hora'],
    },
  },
  {
    name: 'confirmar_cita',
    description: 'Crea la cita en el sistema cuando la clienta confirmó. Solo llamar después de que la clienta dijo "sí" explícitamente.',
    input_schema: {
      type:'object',
      properties: {
        servicio: { type:'string',  description:'Nombre exacto del servicio de la lista' },
        precio:   { type:'number',  description:'Precio del servicio' },
        fechaStr: { type:'string',  description:'Fecha YYYY-MM-DD' },
        hora:     { type:'string',  description:'Hora HH:MM' },
      },
      required: ['servicio','precio','fechaStr','hora'],
    },
  },
  {
    name: 'cancelar_cita',
    description: 'Cancela la(s) cita(s) activas de esta clienta cuando ella lo pide explícitamente.',
    input_schema: { type:'object', properties: {}, required:[] },
  },
];

// ── CEREBRO: Claude maneja todo el lenguaje natural ───────────────
async function responderConClaude(mensaje, historial, cliente, estado, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const svcsLista = servicios
    .filter(s => s.nombre)
    .map(s => `- ${s.emoji||'✂️'} ${s.nombre}: $${s.precio} (${s.duracion||30} min)`)
    .join('\n');

  const estadoActual = estado.paso !== 'inicio'
    ? `\nCONVERSACIÓN EN CURSO:
- Paso: ${estado.paso}
- Servicio seleccionado: ${estado.servicio || 'ninguno'}
- Fecha: ${estado.fechaStr || 'ninguna'}
- Hora: ${estado.hora || 'ninguna'}
- Precio: ${estado.precio ? '$'+estado.precio : 'ninguno'}`
    : '';

  const citasPendientes = (estado.paso === 'confirmando' && estado.servicio)
    ? `\n⚠️ HAY UNA CITA PENDIENTE DE CONFIRMAR:
${estado.emoji||'✂️'} ${estado.servicio} — ${estado.fechaStr} a las ${estado.hora} ($${estado.precio})
La clienta debe confirmar o cancelar esto.`
    : '';

  const system = `Eres Zai, la asistente virtual de Barbería Zaira en México. Eres la secretaria del negocio — respondes por WhatsApp de forma natural, amable y en español mexicano casual.

SOBRE LA BARBERÍA:
- Nombre: Barbería Zaira
- Horario: Lunes a sábado de 9am a 7pm. DOMINGOS CERRADO.
- Hoy es: ${hoyStr()} (${new Date().toLocaleString('es-MX',{timeZone:'America/Mexico_City',weekday:'long'})})

SERVICIOS DISPONIBLES:
${svcsLista || '- Corte de cabello: $100\n- Arreglo de barba: $80'}

CLIENTE ACTUAL:
- Nombre: ${cliente.nombre || 'Clienta nueva'}
- Visitas: ${cliente.visitas || 0}${estadoActual}${citasPendientes}

CÓMO ERES:
- Hablas como una mexicana real: "Claro que sí", "Ahorita te ayudo", "¿Qué día te late?", "Sale, perfecto", "Órale"
- Eres eficiente — vas al punto sin rodeos
- Usas emojis ocasionalmente pero no en cada oración
- Máximo 2-3 oraciones por respuesta
- NUNCA mencionas links ni páginas web
- NUNCA inventas precios — solo usas los de la lista
- Si alguien dice "para mi morrito/chamaco/hijo/esposa/mamá" — entiendes que es para otra persona y agendar para ellos
- Si alguien dice algo de cortesía ("porfavor", "gracias", etc.) en medio de un flujo, retomas amablemente donde ibas

FLUJO DE AGENDAR CITA:
1. Preguntar servicio (si no lo especificaron)
2. Preguntar fecha (si no la dijeron)
3. Preguntar hora (si no la dijeron)
4. Verificar disponibilidad con la herramienta verificar_horario
5. Mostrar resumen y pedir confirmación explícita
6. Cuando confirmen con "sí"/"dale"/"órale" → usar herramienta confirmar_cita
7. Confirmar al cliente con los detalles

REGLAS CRÍTICAS:
- SIEMPRE usar verificar_horario antes de ofrecer/confirmar un horario específico
- NUNCA confirmar una cita sin que la clienta haya dicho explícitamente "sí" o equivalente
- Fechas NUNCA pueden ser anteriores a hoy (${hoyStr()})
- Si dicen "mañana" y mañana es domingo → decirles que domingos no atendemos y preguntar otro día
- Si ya hay una cita pendiente de confirmar y saludan → recordarles gentilmente la cita pendiente`;

  const messages = [...historial, { role:'user', content: mensaje }];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system,
    tools: TOOLS,
    messages,
  });

  // Loop de herramientas
  let resultado = { texto: null, accion: null, citaData: null };
  let steps = 0;

  while (response.stop_reason === 'tool_use' && steps < 6) {
    steps++;
    const toolBlocks  = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const tb of toolBlocks) {

      if (tb.name === 'verificar_horario') {
        const { fechaStr, hora } = tb.input;
        let res;
        if (!fechaStr || !hora) {
          res = { disponible: false, mensaje: 'Fecha u hora no especificada' };
        } else if (fechaEsPasada(fechaStr)) {
          res = { disponible: false, mensaje: `Esa fecha ya pasó` };
        } else if (new Date(fechaStr+'T12:00:00').getDay() === 0) {
          res = { disponible: false, mensaje: 'Los domingos no atendemos' };
        } else {
          const libre = await verificarDisponibilidad(fechaStr, hora);
          res = libre
            ? { disponible: true, fechaStr, hora }
            : { disponible: false, mensaje: `El horario ${hora} del ${fechaStr} ya está ocupado` };
        }
        toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify(res) });
      }

      if (tb.name === 'confirmar_cita') {
        const { servicio, precio, fechaStr, hora } = tb.input;
        try {
          await crearCita(cliente.id, cliente.nombre, servicio, precio, fechaStr, hora);
          await setEstado(cliente.id, { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'' });
          resultado.accion = 'cita_creada';
          resultado.citaData = { servicio, precio, fechaStr, hora };
          // Notificar admins
          const fechaD  = new Date(fechaStr+'T12:00:00');
          const diasES  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
          const mesesES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
          const fechaLeg = `${diasES[fechaD.getDay()]} ${fechaD.getDate()} de ${mesesES[fechaD.getMonth()]}`;
          const h        = Number(hora.split(':')[0]);
          const m        = Number(hora.split(':')[1]);
          const ampm     = h >= 12 ? 'pm' : 'am';
          const h12      = h > 12 ? h-12 : h === 0 ? 12 : h;
          const horaLeg  = m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
          await notificarAdmins(`📅 ¡Nueva cita!\n👤 ${cliente.nombre}\n✂️ ${servicio}\n📅 ${fechaLeg} a las ${horaLeg}\n💰 $${precio}\n📱 ${cliente.telefono||'Sin tel'}`);
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: true }) });
        } catch(e) {
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: e.message }) });
        }
      }

      if (tb.name === 'cancelar_cita') {
        try {
          const n = await cancelarCitasPendientes(cliente.id);
          await setEstado(cliente.id, { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'' });
          resultado.accion = 'cita_cancelada';
          await notificarAdmins(`⚠️ ${cliente.nombre} canceló su cita\n📱 ${cliente.telefono||'Sin tel'}`);
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: true, canceladas: n }) });
        } catch(e) {
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: e.message }) });
        }
      }
    }

    messages.push({ role:'assistant', content: response.content });
    messages.push({ role:'user',      content: toolResults });
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system,
      tools: TOOLS,
      messages,
    });
  }

  resultado.texto = response.content.find(b => b.type === 'text')?.text?.trim() || null;
  return resultado;
}

// ── Actualizar estado según lo que dijo Claude ────────────────────
async function actualizarEstado(clienteId, estadoActual, texto) {
  // Si Claude acaba de crear/cancelar cita, el estado ya fue reseteado en la tool
  // Solo actualizamos si hay info nueva que extrajimos implícitamente
  // El estado se gestiona principalmente desde las tools de Claude
  await setEstado(clienteId, {
    ...estadoActual,
    ultimoMensaje: new Date().toISOString(),
  });
}

// ── Comandos admin ────────────────────────────────────────────────
async function procesarAdmin(cmd, tel) {
  const c = cmd.trim().toLowerCase();
  if (c === '/on')     { await fsSet(`admin_bot/${tel}`, toFields({ activo:true,  modoPrueba:false })); return '✅ Bot ON — te respondo y guardo en app.'; }
  if (c === '/off')    { await fsSet(`admin_bot/${tel}`, toFields({ activo:false, modoPrueba:false })); return '⛔ Bot OFF — te ignoro.'; }
  if (c === '/prueba') { await fsSet(`admin_bot/${tel}`, toFields({ activo:true,  modoPrueba:true  })); return '🧪 Modo prueba ON — respondo en WA pero no guardo en app.'; }
  if (c === '/salir')  {
    await fsSet(`admin_sesion/${tel}`, toFields({ activo:false }));
    await fsSet(`admin_bot/${tel}`,    toFields({ activo:false, modoPrueba:false }));
    return '👋 Sesión admin cerrada.';
  }
  if (c === '/citas') {
    const hoy  = hoyStr();
    const res  = await fsGet('citas');
    const list = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === hoy && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!list.length) return '📅 Sin citas para hoy.';
    return `📅 Citas hoy (${list.length}):\n\n` + list.map(c => {
      const h = Number(c.hora?.split(':')[0]);
      const m = Number(c.hora?.split(':')[1]||0);
      const ap = h >= 12 ? 'pm' : 'am';
      const h12 = h > 12 ? h-12 : h === 0 ? 12 : h;
      const hl = m === 0 ? `${h12}${ap}` : `${h12}:${String(m).padStart(2,'0')}${ap}`;
      return `⏰ ${hl} — ${c.clienteNombre} — ${c.servicio}`;
    }).join('\n');
  }
  if (c === '/mañana' || c === '/manana') {
    const mx = nowMX(); mx.setDate(mx.getDate()+1);
    const str = formatFecha(mx);
    const res = await fsGet('citas');
    const list = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === str && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!list.length) return '📅 Sin citas para mañana.';
    return `📅 Citas mañana (${list.length}):\n\n` + list.map(c => `⏰ ${c.hora} — ${c.clienteNombre} — ${c.servicio}`).join('\n');
  }
  if (c === '/clientes') {
    const res = await fsGet('clientes');
    return `👥 Clientas registradas: ${(res.documents||[]).length}`;
  }
  if (c === '/ayuda') return `Comandos disponibles:\n\n/on — Bot responde y guarda\n/off — Bot se calla\n/prueba — Probar sin guardar\n/citas — Citas de hoy\n/mañana — Citas de mañana\n/clientes — Total clientas\n/salir — Cerrar sesión\n/ayuda — Esta lista`;
  return `Comando no reconocido. Escribe /ayuda.`;
}

// ── Handler principal ─────────────────────────────────────────────

// ── Función de procesamiento en background ────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'ok' };

  let mensaje, from, tel;
  try {
    const body = JSON.parse(event.body || '{}');
    mensaje = body.mensaje;
    from    = body.from;
    tel     = body.tel;
  } catch(e) {
    console.error('[PROCESAR] Error parseando body:', e.message);
    return { statusCode:400, body:'bad request' };
  }

  if (!mensaje || !from) return { statusCode:400, body:'faltan datos' };

  console.log(`[PROCESAR] ${from}: ${mensaje.slice(0,60)}`);

  try {
    // ── Admin con bot ON (no comando) ────────────────────────────
    const adminDoc = parseDoc(await fsGet(`admin_sesion/${tel}`));
    if (adminDoc?.activo) {
      const botDoc = parseDoc(await fsGet(`admin_bot/${tel}`));
      if (!botDoc?.activo) return { statusCode:200, body:'bot off' };

      if (botDoc?.modoPrueba) {
        const svcsJ    = await fsGet('servicios');
        const svcs     = (svcsJ.documents||[]).map(parseDoc).filter(Boolean);
        const estadoP  = await getEstado(`prueba_${tel}`);
        const clienteP = { id:`prueba_${tel}`, nombre:'Admin (prueba)', telefono: tel, visitas:0, puntos:0 };
        const r = await responderConClaude(mensaje, [], clienteP, estadoP, svcs);
        if (r.texto) await enviarWA(from, r.texto);
        return { statusCode:200, body:'ok' };
      }

      // Bot ON para admin — respuesta directa
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens:300,
        system: 'Eres Zai, asistente de Barbería Zaira. Hablas con la admin Zaira. Responde directo y útil en español mexicano.',
        messages: [{ role:'user', content: mensaje }],
      });
      const texto = r.content[0]?.text?.trim();
      if (texto) await enviarWA(from, texto);
      return { statusCode:200, body:'ok' };
    }

    // ── Buscar/crear cliente ─────────────────────────────────────
    let cliente = null;
    const clientesRes = await fsGet('clientes');
    for (const doc of (clientesRes.documents||[])) {
      const c = parseDoc(doc);
      if (!c) continue;
      if (normalizarTel(c.telefono||'').slice(-8) === tel.slice(-8)) { cliente = c; break; }
    }
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
        cliente = { id: ref.name.split('/').pop(), nombre:'Desconocid@', telefono: tel, visitas:0, puntos:0 };
        await notificarAdmins(`👤 ¡Nuevo contacto!\n📱 +52${tel}\nEdítalo en la app.`);
      }
    }
    if (!cliente) {
      await enviarWA(from, 'Hola! Bienvenid@ a Barbería Zaira 💅 En breve te atendemos.');
      return { statusCode:200, body:'ok' };
    }

    // ── Verificar si bot activo para este cliente ────────────────
    const botClienteDoc = parseDoc(await fsGet(`config_bot/${cliente.id}`));
    if (botClienteDoc?.activo === false) {
      await guardarMsg(cliente.id, 'client', mensaje);
      return { statusCode:200, body:'bot desactivado para cliente' };
    }

    // ── Cargar datos en paralelo ─────────────────────────────────
    const [estado, historial, svcsJson] = await Promise.all([
      getEstado(cliente.id),
      getHistorial(cliente.id),
      fsGet('servicios'),
    ]);
    const servicios = (svcsJson.documents||[]).map(parseDoc).filter(Boolean).filter(s => s.nombre);

    await guardarMsg(cliente.id, 'client', mensaje);

    // ── Claude responde ──────────────────────────────────────────
    const resultado = await responderConClaude(mensaje, historial, cliente, estado, servicios);
    const respuesta = resultado.texto || 'En este momento no puedo responder. Zaira te atiende en breve 🙏';

    console.log(`[RESPUESTA] ${cliente.nombre}: ${respuesta.slice(0,80)}`);

    // Enviar por Twilio API (no por TwiML — ya salimos del webhook)
    await enviarWA(from, respuesta);
    await guardarMsg(cliente.id, 'bot', respuesta);

    return { statusCode:200, body:'ok' };

  } catch(err) {
    console.error('[PROCESAR ERROR]', err);
    await enviarWA(from, 'Ahorita no puedo responder. Intenta en un momento 🙏').catch(()=>{});
    return { statusCode:500, body:'error' };
  }
};