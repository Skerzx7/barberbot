/**
 * BarberBot v3.0 — Barbería Zaira
 * MEJORAS:
 * - Debounce 30s para mensajes múltiples
 * - Reset automático de estado después de 1hr inactivo
 * - Tool de reagendar cita
 * - Protección anti-duplicados
 * - Tono mexicano natural (sin exageraciones)
 */

const Anthropic = require('@anthropic-ai/sdk');

const ADMIN_PWD  = process.env.ADMIN_PASSWORD || '1307';
const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';
const DEBOUNCE_MS = 30000; // 30 segundos
const RESET_ESTADO_MS = 60 * 60 * 1000; // 1 hora

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
function mañanaEsDomingo() {
  const mx = nowMX();
  mx.setDate(mx.getDate() + 1);
  return mx.getDay() === 0;
}

// ── Firestore REST ────────────────────────────────────────────────
const PID    = () => process.env.FIREBASE_PROJECT_ID;
const APIKEY = () => process.env.VITE_FIREBASE_API_KEY;
const BASE   = () => `https://firestore.googleapis.com/v1/projects/${PID()}/databases/(default)/documents`;

async function fsGet(path) {
  const r = await fetch(`${BASE()}/${path}?key=${APIKEY()}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`Firestore ${r.status} (${path}): ${e.error?.message || r.statusText}`);
  }
  return r.json();
}
// Structured query (orderBy + limit) para subcolecciones
async function fsRunQuery(parent, structuredQuery) {
  const url = `${BASE()}/${parent}:runQuery?key=${APIKEY()}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!r.ok) throw new Error(`Firestore runQuery ${r.status}`);
  return r.json(); // array de { document, readTime }
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
async function fsDelete(path) {
  await fetch(`${BASE()}/${path}?key=${APIKEY()}`, { method:'DELETE' });
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
    console.log(`[ENVIANDO WA] To: ${toWA} | Body: ${body.slice(0,50)}`);
    const res  = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:'POST',
      headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: NUMERO_BOT, To: toWA, Body: body }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[WA OK] SID: ${data.sid}`);
    } else {
      console.error(`[WA ERROR] ${res.status}: ${data.message || data.code}`);
    }
  } catch(e) { console.error(`[WA CATCH] ${e.message}`); }
}
async function notificarAdmins(msg) {
  const tels = [process.env.ADMIN_TEL_ZAIRA, process.env.ADMIN_TEL_JUAN].filter(Boolean);
  for (const t of tels) await enviarWA(t, msg);
}

// ── Debounce por cliente ──────────────────────────────────────────
async function getDebounce(clienteId) {
  try {
    const doc = parseDoc(await fsGet(`debounce/${clienteId}`));
    return doc;
  } catch { return null; }
}
async function setDebounce(clienteId, mensajes) {
  await fsSet(`debounce/${clienteId}`, toFields({
    mensajes: mensajes.join('\n---\n'),
    timestamp: new Date().toISOString(),
    procesando: true,
  }));
}
async function clearDebounce(clienteId) {
  await fsDelete(`debounce/${clienteId}`);
}

// ── Estado conversación ───────────────────────────────────────────
async function getEstado(id) {
  try {
    const doc = parseDoc(await fsGet(`conversacion_estado/${id}`));
    if (doc) {
      // Reset automático si lleva más de 1hr sin actividad
      if (doc.ultimoMensaje) {
        const ultimo = new Date(doc.ultimoMensaje);
        const ahora  = new Date();
        if (ahora - ultimo > RESET_ESTADO_MS && doc.paso !== 'inicio') {
          console.log(`[RESET ESTADO] Cliente ${id} inactivo ${Math.round((ahora-ultimo)/60000)} min`);
          return { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'', ultimoMensaje:'' };
        }
      }
      return doc;
    }
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
    // runQuery con orderBy timestamp DESC + limit 10 — evita descargar todos los docs
    const results = await fsRunQuery(`clientes/${clienteId}`, {
      from: [{ collectionId: 'mensajes' }],
      orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
      limit: 10,
    });
    const msgs = results
      .map(r => parseDoc(r.document))
      .filter(Boolean)
      .reverse() // DESCENDING → volvemos a cronológico
      .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content:(m.texto||'').trim() }))
      .filter(m => m.content);
    // Garantizar alternancia user/assistant
    const alt = [];
    for (const m of msgs) {
      if (alt.length && alt[alt.length-1].role === m.role) alt[alt.length-1] = m;
      else alt.push(m);
    }
    while (alt.length && alt[0].role !== 'user') alt.shift();
    return alt;
  } catch { return []; }
}

// ── Citas — funciones síncronas (reciben citas ya cargadas) ───────
// citas se carga UNA vez en Promise.all del handler y se pasa a todas las funciones
function verificarDisponibilidad(citas, fechaStr, hora) {
  return !citas.some(c => c.fechaStr === fechaStr && c.hora === hora && c.estado !== 'cancelled');
}

function verificarCitaDuplicada(citas, clienteId, fechaStr, hora) {
  return citas.some(c =>
    c.clientId === clienteId &&
    c.fechaStr === fechaStr &&
    c.hora     === hora &&
    c.estado   === 'confirmed'
  );
}

async function crearCita(citas, clienteId, nombre, servicio, precio, fechaStr, hora) {
  if (verificarCitaDuplicada(citas, clienteId, fechaStr, hora)) {
    console.log(`[DUPLICADO] Cita ya existe para ${clienteId} en ${fechaStr} ${hora}`);
    return { duplicada: true };
  }
  return fsPost('citas', toFields({
    clientId: clienteId||'', clienteNombre: nombre||'Clienta',
    servicio: servicio||'', precio: Number(precio)||0,
    duracion: 30, hora: hora||'', fechaStr: fechaStr||'',
    estado: 'confirmed', creadoEn: new Date().toISOString(),
  }));
}

function getCitasPendientes(citas, clienteId) {
  return citas
    .filter(c => c.clientId === clienteId && c.estado === 'confirmed')
    .sort((a,b) => new Date(a.fechaStr + 'T' + a.hora) - new Date(b.fechaStr + 'T' + b.hora));
}

async function cancelarCitasPendientes(citas, clienteId) {
  const pend = citas.filter(c => c.clientId === clienteId && c.estado === 'confirmed');
  await Promise.all(pend.map(c => fsSet(`citas/${c.id}`, toFields({...c, estado:'cancelled'}))));
  return pend.length;
}

// ── Tools de Claude ───────────────────────────────────────────────
const TOOLS = [
  {
    name: 'verificar_horario',
    description: 'Verifica si un horario está disponible. SIEMPRE usarla antes de ofrecer o confirmar un horario.',
    input_schema: {
      type:'object',
      properties: {
        fechaStr: { type:'string', description:'Fecha YYYY-MM-DD' },
        hora:     { type:'string', description:'Hora HH:MM en 24h' },
      },
      required: ['fechaStr','hora'],
    },
  },
  {
    name: 'confirmar_cita',
    description: 'Crea la cita cuando la clienta dijo SÍ explícitamente. Requiere todos los datos.',
    input_schema: {
      type:'object',
      properties: {
        servicio: { type:'string', description:'Nombre del servicio' },
        precio:   { type:'number', description:'Precio' },
        fechaStr: { type:'string', description:'Fecha YYYY-MM-DD' },
        hora:     { type:'string', description:'Hora HH:MM' },
      },
      required: ['servicio','precio','fechaStr','hora'],
    },
  },
  {
    name: 'cancelar_cita',
    description: 'Cancela las citas activas de la clienta.',
    input_schema: { type:'object', properties: {}, required:[] },
  },
  {
    name: 'reagendar_cita',
    description: 'Cambia la fecha/hora de una cita existente. Usa cuando la clienta quiere mover su cita.',
    input_schema: {
      type:'object',
      properties: {
        nuevaFechaStr: { type:'string', description:'Nueva fecha YYYY-MM-DD' },
        nuevaHora:     { type:'string', description:'Nueva hora HH:MM' },
      },
      required: ['nuevaFechaStr','nuevaHora'],
    },
  },
];

// ── CEREBRO: Claude maneja todo el lenguaje natural ───────────────
async function responderConClaude(mensaje, historial, cliente, estado, servicios, citas) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const svcsLista = servicios
    .filter(s => s.nombre)
    .map(s => `- ${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`)
    .join('\n');

  const estadoActual = estado.paso !== 'inicio'
    ? `\nCONVERSACIÓN EN CURSO:
- Paso: ${estado.paso}
- Servicio: ${estado.servicio || 'ninguno'}
- Fecha: ${estado.fechaStr || 'ninguna'}
- Hora: ${estado.hora || 'ninguna'}`
    : '';

  // Obtener citas pendientes de este cliente (síncrono, citas ya cargadas)
  const citasPend = getCitasPendientes(citas, cliente.id);
  const citasInfo = citasPend.length > 0
    ? `\n📅 CITAS PENDIENTES DE ESTA CLIENTA:\n${citasPend.map(c => `- ${c.servicio} el ${c.fechaStr} a las ${c.hora}`).join('\n')}`
    : '';

  const system = `Eres Zai, asistente de Barbería Zaira. Respondes por WhatsApp.

DATOS:
- Horario: Lun-Sáb 9am a 7pm. DOMINGOS CERRADO.
- Hoy: ${hoyStr()} (${nowMX().toLocaleString('es-MX',{timeZone:'America/Mexico_City',weekday:'long'})})
${mañanaEsDomingo() ? '⚠️ MAÑANA ES DOMINGO — NO ATENDEMOS' : ''}

SERVICIOS:
${svcsLista || '- Corte: $100'}

CLIENTA: ${cliente.nombre || 'Nueva'} (${cliente.visitas || 0} visitas)${estadoActual}${citasInfo}

PERSONALIDAD:
- Hablas mexicano natural: "Sale", "Va", "Órale", "Ahorita", "Te late?"
- NO exageras: nada de "¡Órale, qué padre!" o "¡Te va a quedar padrísimo!"
- Tono tranquilo y directo, como una amiga
- 2-3 oraciones máximo, sin markdown
- NUNCA das links

FLUJO CITAS:
1. Si no dijeron servicio → preguntar
2. Si no dijeron fecha → preguntar
3. Si no dijeron hora → preguntar
4. SIEMPRE verificar_horario antes de confirmar
5. Mostrar resumen y pedir "¿Va?"
6. Solo con "sí/va/dale/órale" → confirmar_cita

REGLAS:
- Si dicen "mañana" y mañana es domingo → avisar que no atendemos
- Si quieren cambiar cita → usar reagendar_cita
- Nunca inventar precios`;

  const messages = [...historial, { role:'user', content: mensaje }];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system,
    tools: TOOLS,
    messages,
  });

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
          res = { disponible: false, mensaje: 'Esa fecha ya pasó' };
        } else if (new Date(fechaStr+'T12:00:00').getDay() === 0) {
          res = { disponible: false, mensaje: 'Los domingos no atendemos' };
        } else {
          const libre = verificarDisponibilidad(citas, fechaStr, hora);
          res = libre
            ? { disponible: true, fechaStr, hora }
            : { disponible: false, mensaje: `El horario ${hora} del ${fechaStr} ya está ocupado` };
        }
        toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify(res) });
      }

      if (tb.name === 'confirmar_cita') {
        const { servicio, precio, fechaStr, hora } = tb.input;
        try {
          const ref = await crearCita(citas, cliente.id, cliente.nombre, servicio, precio, fechaStr, hora);
          if (ref.duplicada) {
            toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: 'Ya tienes una cita en ese horario' }) });
          } else {
            await setEstado(cliente.id, { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'' });
            resultado.accion = 'cita_creada';
            resultado.citaData = { servicio, precio, fechaStr, hora };
            // Notificar admins
            const fechaD  = new Date(fechaStr+'T12:00:00');
            const diasES  = ['dom','lun','mar','mié','jue','vie','sáb'];
            const mesesES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
            const fechaLeg = `${diasES[fechaD.getDay()]} ${fechaD.getDate()} ${mesesES[fechaD.getMonth()]}`;
            const h = Number(hora.split(':')[0]), m = Number(hora.split(':')[1]||0);
            const horaLeg = `${h > 12 ? h-12 : h}:${String(m).padStart(2,'0')}${h >= 12 ? 'pm' : 'am'}`;
            await notificarAdmins(`📅 Nueva cita\n${cliente.nombre}\n${servicio} · $${precio}\n${fechaLeg} ${horaLeg}`);
            toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: true }) });
          }
        } catch(e) {
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: e.message }) });
        }
      }

      if (tb.name === 'cancelar_cita') {
        try {
          const n = await cancelarCitasPendientes(citas, cliente.id);
          await setEstado(cliente.id, { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'' });
          resultado.accion = 'cita_cancelada';
          if (n > 0) await notificarAdmins(`⚠️ ${cliente.nombre} canceló su cita`);
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: true, canceladas: n }) });
        } catch(e) {
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: e.message }) });
        }
      }

      if (tb.name === 'reagendar_cita') {
        const { nuevaFechaStr, nuevaHora } = tb.input;
        try {
          // Verificar disponibilidad del nuevo horario
          if (new Date(nuevaFechaStr+'T12:00:00').getDay() === 0) {
            toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: 'Los domingos no atendemos' }) });
            continue;
          }
          const libre = verificarDisponibilidad(citas, nuevaFechaStr, nuevaHora);
          if (!libre) {
            toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: 'Ese horario ya está ocupado' }) });
            continue;
          }
          // Cancelar cita actual y crear nueva
          const citaActual = getCitasPendientes(citas, cliente.id)[0];
          if (!citaActual) {
            toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: 'No tienes citas pendientes' }) });
            continue;
          }
          await fsSet(`citas/${citaActual.id}`, toFields({...citaActual, estado:'cancelled'}));
          await crearCita(citas, cliente.id, cliente.nombre, citaActual.servicio, citaActual.precio, nuevaFechaStr, nuevaHora);
          await setEstado(cliente.id, { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'' });
          resultado.accion = 'cita_reagendada';
          await notificarAdmins(`🔄 ${cliente.nombre} reagendó\n${citaActual.servicio}\nDe ${citaActual.fechaStr} ${citaActual.hora}\nA ${nuevaFechaStr} ${nuevaHora}`);
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: true }) });
        } catch(e) {
          toolResults.push({ type:'tool_result', tool_use_id: tb.id, content: JSON.stringify({ ok: false, error: e.message }) });
        }
      }
    }

    messages.push({ role:'assistant', content: response.content });
    messages.push({ role:'user',      content: toolResults });
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system,
      tools: TOOLS,
      messages,
    });
  }

  resultado.texto = response.content.find(b => b.type === 'text')?.text?.trim() || null;
  return resultado;
}

// ── Comandos admin ────────────────────────────────────────────────
async function procesarAdmin(cmd, tel) {
  const c = cmd.trim().toLowerCase();
  if (c === '/on')     { await fsSet(`admin_bot/${tel}`, toFields({ activo:true,  modoPrueba:false })); return '✅ Bot ON'; }
  if (c === '/off')    { await fsSet(`admin_bot/${tel}`, toFields({ activo:false, modoPrueba:false })); return '⛔ Bot OFF'; }
  if (c === '/prueba') { await fsSet(`admin_bot/${tel}`, toFields({ activo:true,  modoPrueba:true  })); return '🧪 Modo prueba'; }
  if (c === '/salir')  {
    await fsSet(`admin_sesion/${tel}`, toFields({ activo:false }));
    await fsSet(`admin_bot/${tel}`,    toFields({ activo:false, modoPrueba:false }));
    return '👋 Sesión cerrada';
  }
  if (c === '/citas') {
    const hoy  = hoyStr();
    const res  = await fsGet('citas');
    const list = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === hoy && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!list.length) return '📅 Sin citas hoy';
    return `📅 Hoy (${list.length}):\n` + list.map(c => {
      const h = Number(c.hora?.split(':')[0]||0);
      const ap = h >= 12 ? 'pm' : 'am';
      const h12 = h > 12 ? h-12 : h || 12;
      return `${h12}${ap} ${c.clienteNombre} - ${c.servicio}`;
    }).join('\n');
  }
  if (c === '/mañana' || c === '/manana') {
    const mx = nowMX(); mx.setDate(mx.getDate()+1);
    const str = formatFecha(mx);
    const res = await fsGet('citas');
    const list = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(c => c.fechaStr === str && c.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!list.length) return '📅 Sin citas mañana';
    return `📅 Mañana (${list.length}):\n` + list.map(c => `${c.hora} ${c.clienteNombre}`).join('\n');
  }
  if (c === '/ayuda') return `/on — Bot ON\n/off — Bot OFF\n/prueba — Modo test\n/citas — Hoy\n/mañana — Mañana\n/salir — Cerrar`;
  return 'Comando? Escribe /ayuda';
}

// ── Handler principal ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'ok' };

  let mensaje, from, tel;
  try {
    const body = JSON.parse(event.body || '{}');
    mensaje = body.mensaje;
    from    = body.from;
    tel     = body.tel;
  } catch(e) {
    console.error('[PROCESAR] Error body:', e.message);
    return { statusCode:400, body:'bad request' };
  }

  if (!mensaje || !from) return { statusCode:400, body:'faltan datos' };

  console.log(`[PROCESAR] ${from}: ${mensaje.slice(0,60)}`);

  try {
    // ── Admin check ─────────────────────────────────────────────
    const adminDoc = parseDoc(await fsGet(`admin_sesion/${tel}`));
    if (adminDoc?.activo) {
      const botDoc = parseDoc(await fsGet(`admin_bot/${tel}`));
      if (!botDoc?.activo) return { statusCode:200, body:'bot off' };

      if (botDoc?.modoPrueba) {
        const svcsJ = await fsGet('servicios');
        const svcs  = (svcsJ.documents||[]).map(parseDoc).filter(Boolean);
        const est   = await getEstado(`prueba_${tel}`);
        const cli   = { id:`prueba_${tel}`, nombre:'Admin', telefono:tel, visitas:0 };
        const r     = await responderConClaude(mensaje, [], cli, est, svcs);
        if (r.texto) await enviarWA(from, r.texto);
        return { statusCode:200, body:'ok' };
      }

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens:300,
        system: 'Eres Zai, asistente de Barbería Zaira. Hablas con la admin. Responde directo.',
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
        notas:    { stringValue: 'Por WhatsApp' },
        visitas:  { integerValue: 0 },
        puntos:   { integerValue: 0 },
        creadoEn: { timestampValue: new Date().toISOString() },
      });
      if (ref?.name) {
        cliente = { id: ref.name.split('/').pop(), nombre:'Desconocid@', telefono: tel, visitas:0 };
        await notificarAdmins(`👤 Nuevo contacto: +52${tel}`);
      }
    }
    if (!cliente) {
      await enviarWA(from, 'Hola! En breve te atendemos.');
      return { statusCode:200, body:'ok' };
    }

    // ── Bot activo? ──────────────────────────────────────────────
    const botClienteDoc = parseDoc(await fsGet(`config_bot/${cliente.id}`));
    if (botClienteDoc?.activo === false) {
      await guardarMsg(cliente.id, 'client', mensaje);
      return { statusCode:200, body:'bot off para cliente' };
    }

    // ── Debounce: esperar 30s por más mensajes ───────────────────
    const debounceDoc = await getDebounce(cliente.id);
    if (debounceDoc?.procesando) {
      // Ya hay un proceso corriendo, agregar mensaje al buffer
      const msgsActuales = debounceDoc.mensajes ? debounceDoc.mensajes.split('\n---\n') : [];
      msgsActuales.push(mensaje);
      await setDebounce(cliente.id, msgsActuales);
      console.log(`[DEBOUNCE] Agregado al buffer: ${mensaje.slice(0,30)}`);
      return { statusCode:200, body:'buffered' };
    }

    // Iniciar proceso con debounce
    await setDebounce(cliente.id, [mensaje]);
    
    // Esperar 30 segundos para más mensajes
    await new Promise(r => setTimeout(r, DEBOUNCE_MS));

    // Obtener todos los mensajes acumulados
    const debounceActual = await getDebounce(cliente.id);
    const mensajesAcumulados = debounceActual?.mensajes?.split('\n---\n') || [mensaje];
    const mensajeFinal = mensajesAcumulados.join('\n');
    
    await clearDebounce(cliente.id);

    console.log(`[DEBOUNCE] Procesando ${mensajesAcumulados.length} mensaje(s)`);

    // ── Cargar datos en paralelo (1 round-trip por colección) ────
    const [estado, historial, svcsJson, citasJson] = await Promise.all([
      getEstado(cliente.id),
      getHistorial(cliente.id),
      fsGet('servicios'),
      fsGet('citas'),
    ]);
    const servicios = (svcsJson.documents||[]).map(parseDoc).filter(Boolean).filter(s => s.nombre);
    const citas     = (citasJson.documents||[]).map(parseDoc).filter(Boolean);

    // Guardar mensaje(s) del cliente
    for (const m of mensajesAcumulados) {
      await guardarMsg(cliente.id, 'client', m);
    }

    // ── Claude responde ──────────────────────────────────────────
    const resultado = await responderConClaude(mensajeFinal, historial, cliente, estado, servicios, citas);
    const respuesta = resultado.texto || 'Ahorita no puedo responder. Zaira te atiende en breve.';

    console.log(`[RESPUESTA] ${cliente.nombre}: ${respuesta.slice(0,80)}`);

    await enviarWA(from, respuesta);
    await guardarMsg(cliente.id, 'bot', respuesta);

    return { statusCode:200, body:'ok' };

  } catch(err) {
    console.error('[PROCESAR ERROR]', err);
    await enviarWA(from, 'Ahorita no puedo responder. Intenta en un momento.').catch(()=>{});
    return { statusCode:500, body:'error' };
  }
};
