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
function fechaEsPasada(fechaStr) {
  return new Date(fechaStr + 'T12:00:00') < hoyMX();
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
function horaLegible(hora) {
  if (!hora) return '';
  const [h, mn] = hora.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h > 12 ? h-12 : h === 0 ? 12 : h;
  return mn === 0 ? `${h12}${ampm}` : `${h12}:${String(mn).padStart(2,'0')}${ampm}`;
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
  try { return parseDoc(await fsGet(`admin_sesion/${tel}`))?.activo === true; } catch { return false; }
}
async function setAdmin(tel, a) { await fsSet(`admin_sesion/${tel}`, toFields({ activo: a })); }
async function getAdminBotOn(tel) {
  try { return parseDoc(await fsGet(`admin_bot/${tel}`))?.activo === true; } catch { return false; }
}
async function setAdminBotOn(tel, a) { await fsSet(`admin_bot/${tel}`, toFields({ activo: a })); }
async function getAdminModoPrueba(tel) {
  try { return parseDoc(await fsGet(`admin_bot/${tel}`))?.modoPrueba === true; } catch { return false; }
}
async function setAdminModoPrueba(tel, a) {
  await fsSet(`admin_bot/${tel}`, toFields({ activo: true, modoPrueba: a }));
}

// ── Estado conversación ───────────────────────────────────────────
const ESTADO_VACIO = {
  paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'', ultimoMensaje:'',
  personaActual: 'cliente',   // quién es la cita: 'cliente'|'esposa'|'hijo'|'hija'|'mama'|'papa'
  pendingActions: [],         // acciones multi-persona pendientes de ejecutar
};

async function getEstado(clienteId) {
  try {
    const doc = parseDoc(await fsGet(`conversacion_estado/${clienteId}`));
    if (doc) {
      let pendingActions = [];
      try { if (doc.pendingActionsJson) pendingActions = JSON.parse(doc.pendingActionsJson); } catch {}
      return { ...doc, pendingActions, personaActual: doc.personaActual || 'cliente' };
    }
  } catch {}
  return { ...ESTADO_VACIO };
}

async function setEstado(clienteId, estado) {
  await fsSet(`conversacion_estado/${clienteId}`, toFields({
    paso:               estado.paso          || 'inicio',
    servicio:           estado.servicio      || '',
    precio:             Number(estado.precio || 0),
    emoji:              estado.emoji         || '',
    fechaStr:           estado.fechaStr      || '',
    hora:               estado.hora          || '',
    ultimoMensaje:      new Date().toISOString(),
    personaActual:      estado.personaActual || 'cliente',
    pendingActionsJson: (estado.pendingActions||[]).length
      ? JSON.stringify(estado.pendingActions) : '',
  }));
}

// FIX: resetear estado completamente limpio
async function resetEstado(clienteId) {
  await setEstado(clienteId, { ...ESTADO_VACIO });
}

// ── Guardar mensaje ───────────────────────────────────────────────
async function guardarMsg(clienteId, de, texto) {
  if (!clienteId) return;
  await fsPost(`clientes/${clienteId}/mensajes`, {
    de: { stringValue: de }, texto: { stringValue: texto },
    canal: { stringValue: 'whatsapp' }, timestamp: { timestampValue: new Date().toISOString() },
  });
}

async function getHistorial(clienteId) {
  try {
    const res = await fsGet(`clientes/${clienteId}/mensajes`);
    const msgs = (res.documents || []).map(parseDoc).filter(Boolean)
      .sort((a, b) => new Date(a.timestamp||0) - new Date(b.timestamp||0))
      .slice(-10)
      .map(m => ({
        role:    m.de === 'client' ? 'user' : 'assistant',
        content: (m.texto || '').trim(),
      }))
      .filter(m => m.content.length > 0);

    // FIX: La API de Anthropic requiere alternancia estricta user/assistant
    // Si hay dos consecutivos del mismo rol, colapsar o eliminar el anterior
    const alternado = [];
    for (const msg of msgs) {
      if (alternado.length > 0 && alternado[alternado.length - 1].role === msg.role) {
        // Mismo rol consecutivo — reemplazar (conservar el más reciente)
        alternado[alternado.length - 1] = msg;
      } else {
        alternado.push(msg);
      }
    }
    // La API requiere que empiece con 'user'
    while (alternado.length > 0 && alternado[0].role !== 'user') {
      alternado.shift();
    }
    return alternado;
  } catch { return []; }
}

// ── Diccionario mexicano ──────────────────────────────────────────
const ES_SI = /^(sí|si|yes|simon|simón|seimón|dale|ok|okey|claro|va|órale|orale|andale|ándale|sale|np|perfecto|listo|chido|échale|echale|de\s*una|de\s*volada|simona|a\s*huevo|pos\s*sí|pos\s*si|pus\s*si|pues\s*si|bueno|ta\s*bien|ta\s*bueno|tá\s*bien|mande|cómo\s*no|por\s*supuesto|seguro|école|confirmado|confirmo|correcto|exacto|así\s*es|con\s*todo|ya\s*va|va\s*que\s*va|simon\s*que\s*si)$/i;

const ES_NO = /^(no|nel|nop|nope|nel\s*pastel|para\s*nada|negativo|nombre|nones|ni\s*modo|mejor\s*no|nah|pos\s*no|pus\s*no|pues\s*no|de\s*ninguna\s*manera|nel\s*wey|nel\s*güey)$/i;

const ES_SALUDO = /^(hola|buenas|buenos|buen|hi|hey|saludos|ola|buenas\s+tardes|buenas\s+noches|buenos\s+días|buenos\s+dias|qué\s+onda|que\s+onda|quiubo|quiúbo|quiubole|qué\s+pedo|que\s+pedo|qué\s+rollo|que\s+rollo|qué\s+tal|que\s+tal|qué\s+hubo|que\s+hubo|épale|epale|ey|oye|oe|wey|güey|wei|ke\s+onda|epa)(.{0,20})?$/i;

const ES_DESPEDIDA = /^(gracias|ok|okey|de\s+nada|hasta\s+luego|bye|adios|adiós|listo|perfecto|excelente|genial|👍|np|sale|va|hasta\s+la\s+vista|nos\s+vemos|cuídate|cuídate\s+mucho|ahí\s+nos\s+vemos|ahí\s+nos\s+vidrios|orale\s+pues|órale\s+pues|chao|chau|hasta\s+pronto|mil\s+gracias|muchas\s+gracias|gracias\s+wey|gracias\s+güey)$/i;

// ── Small talk: no debe resetear flujo activo ─────────────────────
const ES_SMALL_TALK = /^(todo\s*(chido|bien|genial|ok|okey|tranqui)|(qué|que)\s+(tal|onda|hay|pex|rollo)|cómo\s+(estás|estas|andas|vas|te\s+va)|todo\s+tranquilo|bien\s+gracias|muy\s+bien|de\s+lujo|ahí\s+(la\s+)?(llevamos?|nomás?))(\?|!|\.)?$/i;

// ── Personas: esposa, hijo, etc. ──────────────────────────────────
const PERSONAS_MAP = {
  esposa: /\bmi\s*(esposa|señora|mujer|novia|pareja|costilla)\b/i,
  hijo:   /\bmi\s*(hijo|morrito|chamaco|escuincle|nene|chavo|morro|peque)\b|para\s+(el\s+)?(morrito|chamaco|escuincle)\b/i,
  hija:   /\bmi\s*(hija|morrita|chamaca|nena|princesa)\b/i,
  mama:   /\bmi\s*(mamá|mama|madre|jefa)\b/i,
  papa:   /\bmi\s*(papá|papa|padre|jefe|viejo)\b/i,
};

function detectarPersona(t) {
  for (const [persona, regex] of Object.entries(PERSONAS_MAP)) {
    if (regex.test(t)) return persona;
  }
  return 'cliente';
}

function labelPersona(persona) {
  const map = { esposa:'tu esposa', hijo:'tu hijo', hija:'tu hija', mama:'tu mamá', papa:'tu papá' };
  return map[persona] || persona;
}

// ── Log estructurado para debugging ──────────────────────────────
function log(tipo, data) {
  console.log(`[BOT:${tipo}] ${JSON.stringify(data)}`);
}

// ── Fecha/hora ────────────────────────────────────────────────────
function parsearFecha(texto) {
  const t   = texto.toLowerCase().trim();
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const dias = { lunes:1, martes:2, 'miércoles':3, miercoles:3, jueves:4, viernes:5, 'sábado':6, sabado:6 };

  if (/\bhoy\b/.test(t)) return formatFecha(hoy);
  if (/pasado\s*ma[ñn]ana/.test(t)) { const m = new Date(hoy); m.setDate(m.getDate()+2); return formatFecha(m); }
  if (/ma[ñn]ana/.test(t)) { const m = new Date(hoy); m.setDate(m.getDate()+1); return formatFecha(m); }

  for (const [nombre, num] of Object.entries(dias)) {
    if (t.includes(nombre)) {
      const d       = new Date(hoy);
      const proximo = /pr[oó]ximo|siguiente|que\s+viene|proxima/.test(t);
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

function extraerInfoCita(texto, servicios) {
  const info  = {};
  const fecha = parsearFecha(texto);
  if (fecha) info.fechaStr = fecha;
  const hora = parsearHora(texto);
  if (hora) info.hora = hora;
  for (const svc of servicios) {
    const palabras = svc.nombre.toLowerCase().split(' ');
    if (palabras.some(p => p.length > 3 && texto.toLowerCase().includes(p))) {
      info.servicio = svc.nombre; info.precio = svc.precio; info.emoji = svc.emoji || '✂️';
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
    clientId: clienteId||'', clienteNombre: nombre||'Clienta',
    servicio: servicio||'', precio: Number(precio)||0,
    duracion: 30, hora: hora||'', fechaStr: fechaStr||'',
    estado: 'confirmed', creadoEn: new Date().toISOString(),
  }));
}

async function cancelarCitasPendientes(clienteId) {
  const res  = await fsGet('citas');
  const pend = (res.documents||[]).map(parseDoc).filter(Boolean)
    .filter(c => c.clientId === clienteId && c.estado === 'confirmed');
  for (const c of pend) await fsSet(`citas/${c.id}`, toFields({...c, estado:'cancelled'}));
  return pend.length;
}

// ── Validar fecha ─────────────────────────────────────────────────
function validarFecha(fechaStr) {
  if (!fechaStr) return { ok: false, msg: null };
  if (fechaEsPasada(fechaStr)) return { ok: false, msg: `Esa fecha ya pasó 😅 ¿Cuándo te viene bien?` };
  const d = new Date(fechaStr + 'T12:00:00');
  if (d.getDay() === 0) return { ok: false, msg: `Los domingos no atendemos. ¿Qué otro día? (lunes a sábado)` };
  return { ok: true };
}

// ── Claude SOLO para mensajes que no se pueden resolver con lógica ─
// ── Tools que Claude puede llamar (autopilot loop — patrón ruflo) ──
const CLAUDE_TOOLS = [
  {
    name: 'check_disponibilidad',
    description: 'Verifica en tiempo real si un horario específico está libre antes de sugerirlo.',
    input_schema: {
      type: 'object',
      properties: {
        fechaStr: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        hora:     { type: 'string', description: 'Hora en formato HH:MM (24h), ej: 10:00, 14:30' },
      },
      required: ['fechaStr', 'hora'],
    },
  },
  {
    name: 'responder_cliente',
    description: 'Envía la respuesta final al cliente con la intención detectada y datos de la cita si aplica.',
    input_schema: {
      type: 'object',
      properties: {
        intencion: {
          type: 'string',
          enum: ['cancelar','reagendar','agendar','cambiar_servicio','cambiar_fecha','cambiar_hora','disponibilidad','info','saludo','despedida','otro'],
          description: 'Intención principal del mensaje',
        },
        servicio:  { type: 'string',  description: 'Nombre exacto del servicio tal como aparece en la lista, o null' },
        fechaStr:  { type: 'string',  description: 'Fecha en formato YYYY-MM-DD o null' },
        hora:      { type: 'string',  description: 'Hora en formato HH:MM o null' },
        respuesta: { type: 'string',  description: 'Mensaje corto en español mexicano casual, máximo 2 oraciones' },
      },
      required: ['intencion', 'respuesta'],
    },
  },
];

async function llamarClaude(mensaje, historial, cliente, estado, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const svcsInfo  = servicios.map(s => `${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const hoyStr    = formatFecha(new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })));

  const clientePerfilLineas = [
    `Nombre: ${cliente.nombre}`,
    cliente.visitas > 0 ? `Visitas: ${cliente.visitas}` : 'Clienta nueva',
    cliente.puntos  > 0 ? `Puntos: ${cliente.puntos}` : null,
  ].filter(Boolean).join(' | ');

  const system = `Eres Zai, asistente de WhatsApp de Barbería Zaira en México.
SERVICIOS DISPONIBLES:
${svcsInfo}

HORARIO: Lunes a sábado 9am a 7pm.
HOY: ${hoyStr}
CLIENTE: ${clientePerfilLineas}
ESTADO ACTUAL: paso=${estado.paso}, servicio=${estado.servicio||'ninguno'}, fecha=${estado.fechaStr||'ninguna'}, hora=${estado.hora||'ninguna'}

JERGA MEXICANA: simón/simon=sí, nel=no, sale/va/órale=de acuerdo, qué onda/quiubo=hola, chamaco/morrito/escuincle=niño, de volada=rápido, ahorita=ahora

REGLAS ESTRICTAS:
1. SIEMPRE usa check_disponibilidad antes de confirmar o sugerir un horario específico
2. NUNCA menciones links ni páginas web
3. NUNCA inventes precios — usa solo los de la lista
4. Fechas NUNCA anteriores a hoy (${hoyStr})
5. Si la clienta tiene visitas > 3, usa tono más familiar
6. Termina SIEMPRE llamando a responder_cliente con tu respuesta final`;

  const messages = [...historial, { role: 'user', content: mensaje }];

  try {
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 400,
      system, tools: CLAUDE_TOOLS, messages,
    });

    // ── Autopilot loop (patrón ruflo: ejecutar tools hasta respuesta final) ──
    let steps = 0;
    while (response.stop_reason === 'tool_use' && steps < 5) {
      steps++;
      const toolBlocks  = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const tb of toolBlocks) {
        // Tool: responder_cliente → respuesta final, salir del loop
        if (tb.name === 'responder_cliente') {
          const r = tb.input;
          if (r.fechaStr && fechaEsPasada(r.fechaStr)) r.fechaStr = null;
          return r;
        }

        // Tool: check_disponibilidad → verificar y devolver resultado real
        if (tb.name === 'check_disponibilidad') {
          const { fechaStr, hora } = tb.input;
          let resultado;
          if (!fechaStr || !hora) {
            resultado = { disponible: false, motivo: 'Fecha u hora no especificada' };
          } else if (fechaEsPasada(fechaStr)) {
            resultado = { disponible: false, motivo: 'Esa fecha ya pasó' };
          } else if (new Date(fechaStr+'T12:00:00').getDay() === 0) {
            resultado = { disponible: false, motivo: 'Los domingos no atendemos' };
          } else {
            const libre = await verificarDisponibilidad(fechaStr, hora);
            resultado = { disponible: libre, fechaStr, hora };
          }
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: JSON.stringify(resultado) });
        }
      }

      // Continuar con resultados de tools
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user',      content: toolResults });
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 400,
        system, tools: CLAUDE_TOOLS, messages,
      });
    }

    // Respuesta de texto plano (Claude no usó herramientas)
    const texto = response.content.find(b => b.type === 'text')?.text?.trim();
    if (texto) return { intencion: 'otro', respuesta: texto };
    return null;

  } catch(e) {
    console.error('Claude tool error:', e.status || e.message);
    return null;
  }
}

// ── Helper texto confirmación ─────────────────────────────────────
function txConfirm(emoji, servicio, fechaStr, hora, precio, persona) {
  const paraQuien = persona && persona !== 'cliente' ? ` para ${labelPersona(persona)}` : '';
  return `Confirma tu cita${paraQuien}:\n\n${emoji||'✂️'} ${servicio}\n📅 ${fechaLegible(fechaStr)}\n⏰ ${horaLegible(hora)}\n💰 $${precio}\n\n¿Va? (sí/no)`;
}

// ── Detectar intención sin Claude (keywords) ──────────────────────
function detectarIntencion(t) {
  // Cambio de servicio
  if (/mejor\s+un|quisiera\s+(mejor\s+)?(un|una)|cambia\s+el\s+servicio|otro\s+servicio|prefiero\s+un|en\s+vez\s+de|en\s+lugar\s+de/.test(t)) return 'cambiar_servicio';
  // Cancelar
  if (/cancel|quita\s+la\s+cita|no\s+voy|ya\s+no\s+puedo|ya\s+no\s+quiero/.test(t)) return 'cancelar';
  // Reagendar
  if (/reagenda|cambia\s+la\s+(fecha|cita)|mueve\s+la|para\s+otro\s+día|otro\s+dia/.test(t)) return 'reagendar';
  // Disponibilidad
  if (/(hay|tendr[aá]s|tienen|disponib)\s.*(cita|horario|lugar|hueco)/.test(t)) return 'disponibilidad';
  return null;
}

// ── Detectar múltiples intenciones en un mensaje ─────────────────
function detectarMultiIntent(t) {
  const tieneCancel  = /cancel|quita\s+la\s+cita|no\s+voy|ya\s+no\s+puedo|ya\s+no\s+quiero/.test(t);
  const tieneAgendar = /\bagenda\b|agendar|reservar|apartar|apunta|saca\s+(una|cita)|\bcita\b/.test(t);

  // Combo: "cancela la mía y agenda para ella/mi esposa/etc"
  if (tieneCancel && tieneAgendar) {
    const persona = detectarPersona(t);
    return [
      { type: 'cancelar', persona: 'cliente' },
      { type: 'agendar',  persona },
    ];
  }

  // Múltiples agendas: "una para mi esposa y otra para mi hijo"
  const personasDetectadas = [];
  for (const [p, regex] of Object.entries(PERSONAS_MAP)) {
    if (regex.test(t)) personasDetectadas.push(p);
  }
  const incluyeYo = /para\s+m[ií]\b|la\s+m[ií]a|yo\s+también|a\s+mí\s+también/.test(t);
  if (incluyeYo && personasDetectadas.length >= 1) personasDetectadas.unshift('cliente');
  if (personasDetectadas.length >= 2 && tieneAgendar) {
    return personasDetectadas.slice(0, 3).map(p => ({ type: 'agendar', persona: p }));
  }

  return null;
}

// ── Orquestador: ejecuta acciones en orden ────────────────────────
async function procesarMultiIntent(acciones, mensaje, estado, cliente, servicios, saludo) {
  const svcs           = servicios.filter(s => s.nombre);
  const listaSinPrecio = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}`).join('\n');
  const partes         = [];

  // 1. Ejecutar todas las cancelaciones primero
  for (const accion of acciones.filter(a => a.type === 'cancelar')) {
    const n = await cancelarCitasPendientes(cliente.id);
    await notificarAdmins(`⚠️ ${cliente.nombre} canceló su cita.\n📱 ${cliente.telefono||'Sin tel'}`);
    partes.push(n > 0 ? `Listo, cancelé tu cita ✓` : `No encontré citas activas.`);
    log('ACCION', { type: 'cancelar', cliente: cliente.nombre, canceladas: n });
  }

  // 2. Procesar la primera acción de agendar; las demás quedan pendientes
  const agendarAcciones = acciones.filter(a => a.type === 'agendar');
  const primera         = agendarAcciones[0];
  const restantes       = agendarAcciones.slice(1);

  if (primera) {
    const infoEx      = extraerInfoCita(mensaje, svcs);
    const personaLabel = primera.persona !== 'cliente' ? ` para ${labelPersona(primera.persona)}` : '';

    if (infoEx.servicio && infoEx.fechaStr && infoEx.hora) {
      const vf = validarFecha(infoEx.fechaStr);
      if (vf.ok) {
        const libre = await verificarDisponibilidad(infoEx.fechaStr, infoEx.hora);
        if (libre) {
          await setEstado(cliente.id, { paso:'confirmando', ...infoEx,
            personaActual: primera.persona, pendingActions: restantes });
          partes.push(txConfirm(infoEx.emoji, infoEx.servicio, infoEx.fechaStr, infoEx.hora, infoEx.precio, primera.persona));
          log('ACCION', { type: 'agendar', persona: primera.persona, paso: 'confirmando' });
          return (saludo + partes.join('\n\n')).trim();
        }
        partes.push(`Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`);
      }
    }

    // Sin info completa — iniciar flujo de agendado para esta persona
    await setEstado(cliente.id, {
      paso:'esperando_servicio', servicio:'', precio:0, emoji:'',
      fechaStr: infoEx.fechaStr||'', hora: infoEx.hora||'',
      personaActual: primera.persona, pendingActions: restantes,
    });
    partes.push(`¿Qué servicio${personaLabel}?\n\n${listaSinPrecio}`);
    log('ACCION', { type: 'agendar', persona: primera.persona, paso: 'esperando_servicio' });
  }

  return (saludo + partes.join('\n\n')).trim();
}

// ── Buscar servicio por keywords incluyendo mexicanismos ──────────
function buscarServicio(t, svcs) {
  // Por número
  const num = t.match(/^(\d+)$/);
  if (num) {
    const idx = parseInt(num[1]) - 1;
    if (idx >= 0 && idx < svcs.length) return svcs[idx];
  }
  // Por nombre
  let svc = svcs.find(s => s.nombre.toLowerCase().split(' ').some(p => p.length > 3 && t.includes(p)));
  // Mexicanismos para niños
  if (!svc && /morrito|chamaco|escuincle|chavo|morro|nene|peque|niño|nino/.test(t)) {
    svc = svcs.find(s => /niño|nino|niños/.test(s.nombre.toLowerCase()));
  }
  return svc || null;
}

// ── Comandos admin ────────────────────────────────────────────────
async function procesarComandoAdmin(cmd, tel) {
  const c = cmd.trim().toLowerCase();
  if (c === '/on')    { await setAdminBotOn(tel, true);  await setAdminModoPrueba(tel, false); return '✅ Bot ON — te respondo como IA y se guarda en la app.'; }
  if (c === '/off')   { await setAdminBotOn(tel, false); await setAdminModoPrueba(tel, false); return '⛔ Bot OFF — te ignoro completamente.'; }
  if (c === '/prueba'){ await setAdminModoPrueba(tel, true); return '🧪 Modo prueba ON — te respondo en WA pero NO se guarda en la app.'; }
  if (c === '/salir') { await setAdmin(tel, false); await setAdminBotOn(tel, false); await setAdminModoPrueba(tel, false); return '👋 Sesión admin cerrada.'; }
  if (c === '/citas') {
    const hoyStr = formatFecha(new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })));
    const res    = await fsGet('citas');
    const lista  = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(x => x.fechaStr === hoyStr && x.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!lista.length) return '📅 No hay citas para hoy.';
    return `📅 Citas hoy (${lista.length}):\n\n` + lista.map(x => `⏰ ${horaLegible(x.hora)} — ${x.clienteNombre} — ${x.servicio}`).join('\n');
  }
  if (c === '/mañana' || c === '/manana') {
    const mx = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    mx.setDate(mx.getDate()+1);
    const str  = formatFecha(mx);
    const res  = await fsGet('citas');
    const lista = (res.documents||[]).map(parseDoc).filter(Boolean)
      .filter(x => x.fechaStr === str && x.estado !== 'cancelled')
      .sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    if (!lista.length) return '📅 No hay citas para mañana.';
    return `📅 Citas mañana (${lista.length}):\n\n` + lista.map(x => `⏰ ${horaLegible(x.hora)} — ${x.clienteNombre} — ${x.servicio}`).join('\n');
  }
  if (c === '/clientes') { const res = await fsGet('clientes'); return `👥 Clientas registradas: ${(res.documents||[]).length}`; }
  if (c === '/ayuda') return `/on — Bot te responde\n/off — Bot te ignora\n/prueba — Modo prueba\n/citas — Hoy\n/mañana — Mañana\n/clientes — Total\n/salir — Cerrar sesión\n/ayuda — Esta lista`;
  return `Comando no reconocido. Escribe /ayuda.`;
}

// ── Bot principal ─────────────────────────────────────────────────
async function procesarMensaje(mensaje, estado, cliente, servicios, historial) {
  const t   = mensaje.toLowerCase().trim();
  const now = new Date();

  // ── Calcular minutos desde último mensaje ─────────────────────
  const minutos = estado.ultimoMensaje
    ? (now.getTime() - new Date(estado.ultimoMensaje).getTime()) / 60000
    : 999;

  // FIX: expirar estados intermedios después de 30 minutos
  // Si el cliente no respondió en 30 min y manda algo nuevo, resetear
  const PASOS_INTERMEDIOS = ['esperando_servicio', 'esperando_fecha', 'esperando_hora'];
  const estadoExpirado = PASOS_INTERMEDIOS.includes(estado.paso) && minutos > 30;

  if (estadoExpirado) {
    await resetEstado(cliente.id);
    estado = { ...ESTADO_VACIO };
    log('ESTADO', { evento: 'expirado_reseteado', cliente: cliente.nombre });
  }

  log('INPUT', { cliente: cliente.nombre, paso: estado.paso, persona: estado.personaActual, msg: mensaje.slice(0,60) });

  // Saludo y nombre
  const saludar = !estado.ultimoMensaje || minutos > 240 || estadoExpirado;
  const nombre  = cliente?.nombre && cliente.nombre !== 'Desconocid@' ? ` ${cliente.nombre.split(' ')[0]}` : '';
  const saludo  = saludar ? `Hola${nombre}! 😊\n\n` : '';

  const svcs           = servicios.filter(s => s.nombre);
  const listaSvcs      = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const listaSinPrecio = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}`).join('\n');
  const infoEx         = extraerInfoCita(mensaje, svcs);

  // ── SMALL TALK: responder sin resetear flujo activo ───────────
  if (ES_SMALL_TALK.test(t) && estado.paso !== 'inicio') {
    const opciones = ['Todo chido 😄', 'Bien por acá 😊', 'De lujo!', 'Todo bien 😄'];
    const base     = opciones[Math.floor(Math.random() * opciones.length)];
    log('SMALL_TALK', { paso: estado.paso });
    if (estado.paso === 'confirmando')        return `${base} Oye, ¿confirmas tu cita? 😊`;
    if (estado.paso === 'esperando_servicio') return `${base} ¿Qué servicio te gustaría? 😊`;
    if (estado.paso === 'esperando_fecha')    return `${base} ¿Para qué día quieres? 😊`;
    if (estado.paso === 'esperando_hora')     return `${base} ¿A qué hora te va bien? 😊`;
    return base;
  }

  // ── MULTI-INTENCIÓN: orquestar antes que la máquina de estados ─
  const multiIntents = detectarMultiIntent(t);
  if (multiIntents) {
    log('MULTI_INTENT', { intents: multiIntents, cliente: cliente.nombre });
    return await procesarMultiIntent(multiIntents, mensaje, estado, cliente, servicios, saludo);
  }

  // ── 1. SALUDO ─────────────────────────────────────────────────
  if (ES_SALUDO.test(t)) {
    if (estado.paso === 'confirmando') {
      return `${saludo.trim() ? saludo : ''}Oye, tienes una cita pendiente 😊\n\n${txConfirm(estado.emoji, estado.servicio, estado.fechaStr, estado.hora, estado.precio, estado.personaActual)}`;
    }
    if (estado.paso !== 'inicio') await resetEstado(cliente.id);
    if (saludar) {
      const frecuente = (cliente?.visitas || 0) > 3;
      if (frecuente) return `${saludo}Qué onda${nombre}! ¿Te agendo algo? 😊`;
      return `${saludo}Bienvenid@ a Barbería Zaira 💅\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horario`;
    }
    return `Claro, aquí andamos 😊 ¿Qué necesitas?`;
  }

  // ── 2. DESPEDIDA ──────────────────────────────────────────────
  if (ES_DESPEDIDA.test(t)) return `Con gusto! Que te vaya bien 😊`;

  // ── 3. DISPONIBILIDAD ─────────────────────────────────────────
  if (/(hay|tendr[aá]s|tienen|disponib|tienes)\s.*(cita|horario|lugar|hueco|espacio)/.test(t)) {
    const fecha = parsearFecha(t);
    if (fecha) {
      if (fechaEsPasada(fecha)) return `Esa fecha ya pasó 😅 ¿Para cuándo quieres?`;
      if (new Date(fecha+'T12:00:00').getDay() === 0) return `Los domingos no atendemos. De lunes a sábado 9am-7pm 😊`;
      return `Sí hay horarios el ${fechaLegible(fecha)} 😊 ¿Te agendo una cita?`;
    }
    return `Sí tenemos horarios de lunes a sábado de 9am a 7pm 😊 ¿Para qué día quieres?`;
  }

  // ── 4. FLUJO ESPERANDO SERVICIO ───────────────────────────────
  if (estado.paso === 'esperando_servicio') {
    const svc = buscarServicio(t, svcs);
    if (!svc) {
      // Servicio especial
      if (/tinte|color|permanente|keratina|especial/.test(t)) {
        await resetEstado(cliente.id);
        await notificarAdmins(`💬 Servicio especial de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
        return `Para eso Zaira te atiende directo. En breve se pone en contacto 🙏`;
      }
      // Guardar fecha si la mandaron junto con mensaje de servicio
      if (infoEx.fechaStr) await setEstado(cliente.id, {...estado, fechaStr: infoEx.fechaStr});
      return `No entendí el servicio 😅 Elige un número o escribe el nombre:\n\n${listaSinPrecio}`;
    }
    const nuevo = { paso:'esperando_fecha', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️',
                    fechaStr: estado.fechaStr||'', hora: estado.hora||'' };
    // Si ya tenemos fecha Y hora, ir directo a confirmar
    if (nuevo.fechaStr && nuevo.hora) {
      const vf = validarFecha(nuevo.fechaStr);
      if (!vf.ok) { await setEstado(cliente.id, {...nuevo, fechaStr:'', hora:'', paso:'esperando_fecha'}); return vf.msg || `¿Para qué día? (lunes a sábado)`; }
      const ok = await verificarDisponibilidad(nuevo.fechaStr, nuevo.hora);
      if (!ok) { nuevo.hora = ''; nuevo.paso = 'esperando_hora'; await setEstado(cliente.id, nuevo); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
      nuevo.paso = 'confirmando'; await setEstado(cliente.id, nuevo);
      return txConfirm(nuevo.emoji, nuevo.servicio, nuevo.fechaStr, nuevo.hora, nuevo.precio);
    }
    if (nuevo.fechaStr) { nuevo.paso = 'esperando_hora'; await setEstado(cliente.id, nuevo); return `${svc.emoji||'✂️'} ${svc.nombre} anotado!\n\n¿A qué hora? De 9am a 7pm.`; }
    await setEstado(cliente.id, nuevo);
    return `${svc.emoji||'✂️'} ${svc.nombre} anotado!\n\n¿Para qué día? (lunes a sábado)`;
  }

  // ── 5. FLUJO ESPERANDO FECHA ──────────────────────────────────
  if (estado.paso === 'esperando_fecha') {
    const fechaStr = parsearFecha(t);
    if (!fechaStr) {
      // Intentar detectar fecha con Claude solo si el mensaje parece una fecha
      if (/d[ií]a|semana|mes|próximo|proximo|siguiente|fecha/.test(t)) {
        const ia = await llamarClaude(mensaje, historial, cliente, estado, servicios);
        if (ia?.fechaStr) {
          const vf = validarFecha(ia.fechaStr);
          if (!vf.ok) return vf.msg || `¿Qué día te viene bien? (lunes a sábado)`;
          const horaFinal = ia.hora || estado.hora;
          if (horaFinal) {
            const ok = await verificarDisponibilidad(ia.fechaStr, horaFinal);
            if (!ok) { await setEstado(cliente.id, {...estado, fechaStr:ia.fechaStr, hora:'', paso:'esperando_hora'}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
            await setEstado(cliente.id, {...estado, fechaStr:ia.fechaStr, hora:horaFinal, paso:'confirmando'});
            return txConfirm(estado.emoji, estado.servicio, ia.fechaStr, horaFinal, estado.precio);
          }
          await setEstado(cliente.id, {...estado, fechaStr:ia.fechaStr, paso:'esperando_hora'});
          return `📅 ${fechaLegible(ia.fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`;
        }
      }
      return `No entendí la fecha 😅 Di "el viernes", "mañana" o "el 28".`;
    }
    const vf = validarFecha(fechaStr);
    if (!vf.ok) return vf.msg || `¿Qué día? (lunes a sábado)`;
    // FIX: detectar hora en el mismo mensaje
    const horaEnMismo = parsearHora(t);
    const horaFinal   = horaEnMismo || estado.hora;
    if (horaFinal) {
      const [h] = horaFinal.split(':').map(Number);
      if (h < 9 || h > 19) { await setEstado(cliente.id, {...estado, fechaStr, paso:'esperando_hora', hora:''}); return `Atendemos de 9am a 7pm. ¿Qué hora te viene?`; }
      const ok = await verificarDisponibilidad(fechaStr, horaFinal);
      if (!ok) { await setEstado(cliente.id, {...estado, fechaStr, hora:'', paso:'esperando_hora'}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
      await setEstado(cliente.id, {...estado, fechaStr, hora:horaFinal, paso:'confirmando'});
      return txConfirm(estado.emoji, estado.servicio, fechaStr, horaFinal, estado.precio);
    }
    await setEstado(cliente.id, {...estado, fechaStr, paso:'esperando_hora'});
    return `📅 ${fechaLegible(fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`;
  }

  // ── 6. FLUJO ESPERANDO HORA ───────────────────────────────────
  if (estado.paso === 'esperando_hora') {
    const hora = parsearHora(t);
    if (!hora) return `No entendí la hora 😅 Di "11am", "3pm" o "a las 2".`;
    const [h] = hora.split(':').map(Number);
    if (h < 9 || h > 19) return `Atendemos de 9am a 7pm. ¿Qué hora te viene?`;
    const ok = await verificarDisponibilidad(estado.fechaStr, hora);
    if (!ok) return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`;
    await setEstado(cliente.id, {...estado, hora, paso:'confirmando'});
    return txConfirm(estado.emoji, estado.servicio, estado.fechaStr, hora, estado.precio);
  }

  // ── 7. FLUJO CONFIRMANDO ──────────────────────────────────────
  if (estado.paso === 'confirmando') {
    // Sí
    if (ES_SI.test(t)) {
      const persona    = estado.personaActual || 'cliente';
      const nombreCita = persona !== 'cliente'
        ? `${cliente.nombre} (${labelPersona(persona)})`
        : cliente.nombre;
      await crearCita(cliente.id, nombreCita, estado.servicio, estado.precio, estado.fechaStr, estado.hora);
      log('CITA_CREADA', { cliente: cliente.nombre, persona, servicio: estado.servicio, fecha: estado.fechaStr, hora: estado.hora });

      const pending = estado.pendingActions || [];
      await notificarAdmins(`📅 Nueva cita!\n👤 ${nombreCita}\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n📱 ${cliente.telefono||'Sin tel'}`);

      const paraQuien  = persona !== 'cliente' ? ` para ${labelPersona(persona)}` : '';
      const confirmMsg = `Cita confirmada${paraQuien}! 🎉\n\nTe esperamos el ${fechaLegible(estado.fechaStr)} a las ${horaLegible(estado.hora)}.`;

      // ── Si hay citas pendientes (multi-persona) iniciar la siguiente ─
      if (pending.length > 0) {
        const next  = pending[0];
        const lista = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}`).join('\n');
        await setEstado(cliente.id, {
          paso:'esperando_servicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'',
          personaActual: next.persona, pendingActions: pending.slice(1),
        });
        const nextLabel = next.persona !== 'cliente' ? ` para ${labelPersona(next.persona)}` : '';
        log('SIGUIENTE_PERSONA', { persona: next.persona });
        return `${confirmMsg}\n\nAhora, ¿qué servicio${nextLabel}?\n\n${lista}`;
      }

      await resetEstado(cliente.id);
      return `${confirmMsg}\n\nSi necesitas cancelar avísanos 🙏`;
    }
    // No
    if (ES_NO.test(t)) { await resetEstado(cliente.id); return `Va, sin problema. Si quieres para otro día aquí estoy 😊`; }

    // FIX: hora nueva en confirmando — resolver SIN Claude
    const horaNew = parsearHora(t);
    if (horaNew && !parsearFecha(t)) {
      const [h] = horaNew.split(':').map(Number);
      if (h < 9 || h > 19) return `Atendemos de 9am a 7pm. ¿Qué hora te viene?`;
      const ok = await verificarDisponibilidad(estado.fechaStr, horaNew);
      if (!ok) return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`;
      await setEstado(cliente.id, {...estado, hora: horaNew});
      return txConfirm(estado.emoji, estado.servicio, estado.fechaStr, horaNew, estado.precio);
    }

    // FIX: fecha nueva en confirmando — resolver SIN Claude
    const fechaNew = parsearFecha(t);
    if (fechaNew) {
      const vf = validarFecha(fechaNew);
      if (!vf.ok) return vf.msg || `¿Para qué día? (lunes a sábado)`;
      const horaEnMismo = parsearHora(t);
      const horaFinal   = horaEnMismo || estado.hora;
      if (horaFinal) {
        const ok = await verificarDisponibilidad(fechaNew, horaFinal);
        if (!ok) { await setEstado(cliente.id, {...estado, fechaStr:fechaNew, hora:'', paso:'esperando_hora'}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
        await setEstado(cliente.id, {...estado, fechaStr:fechaNew, hora:horaFinal});
        return txConfirm(estado.emoji, estado.servicio, fechaNew, horaFinal, estado.precio);
      }
      await setEstado(cliente.id, {...estado, fechaStr:fechaNew, hora:'', paso:'esperando_hora'});
      return `📅 ${fechaLegible(fechaNew)}\n\n¿A qué hora? De 9am a 7pm.`;
    }

    // FIX: cambio de servicio en confirmando — detectar con keywords primero
    const intencionKeyword = detectarIntencion(t);
    if (intencionKeyword === 'cambiar_servicio') {
      const svcNew = buscarServicio(t, svcs);
      if (svcNew) {
        await setEstado(cliente.id, {...estado, servicio:svcNew.nombre, precio:svcNew.precio, emoji:svcNew.emoji||'✂️'});
        return txConfirm(svcNew.emoji, svcNew.nombre, estado.fechaStr, estado.hora, svcNew.precio);
      }
      await setEstado(cliente.id, {paso:'esperando_servicio', fechaStr:estado.fechaStr, hora:estado.hora, precio:0, servicio:'', emoji:''});
      return `¿Qué servicio quieres?\n\n${listaSinPrecio}`;
    }
    if (intencionKeyword === 'cancelar') { await resetEstado(cliente.id); return `Sale, cancelamos 😊 ¿Quieres para otro día?`; }

    // Claude como último recurso para confirmando
    const ia = await llamarClaude(mensaje, historial, cliente, estado, servicios);
    if (!ia) return `¿Confirmas la cita? Responde sí o no.`; // Claude falló

    if (ia.intencion === 'cancelar')          { await resetEstado(cliente.id); return `Sale, cancelamos 😊 ¿Quieres para otro día?`; }
    if (ia.intencion === 'cambiar_servicio')  {
      const svcNew = svcs.find(s => s.nombre === ia.servicio) || buscarServicio(t, svcs);
      if (svcNew) { await setEstado(cliente.id, {...estado, servicio:svcNew.nombre, precio:svcNew.precio, emoji:svcNew.emoji||'✂️'}); return txConfirm(svcNew.emoji, svcNew.nombre, estado.fechaStr, estado.hora, svcNew.precio); }
      await setEstado(cliente.id, {paso:'esperando_servicio', fechaStr:estado.fechaStr, hora:estado.hora, precio:0, servicio:'', emoji:''});
      return `¿Qué servicio quieres?\n\n${listaSinPrecio}`;
    }
    if (ia.intencion === 'reagendar' && ia.fechaStr) {
      const vf = validarFecha(ia.fechaStr);
      if (!vf.ok) return vf.msg || `¿Para cuándo?`;
      const horaFinal = ia.hora || estado.hora;
      if (horaFinal) {
        const ok = await verificarDisponibilidad(ia.fechaStr, horaFinal);
        if (!ok) { await setEstado(cliente.id, {...estado, fechaStr:ia.fechaStr, hora:'', paso:'esperando_hora'}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
        await setEstado(cliente.id, {...estado, fechaStr:ia.fechaStr, hora:horaFinal});
        return txConfirm(estado.emoji, estado.servicio, ia.fechaStr, horaFinal, estado.precio);
      }
      await setEstado(cliente.id, {...estado, fechaStr:ia.fechaStr, hora:'', paso:'esperando_hora'});
      return `¿A qué hora el ${fechaLegible(ia.fechaStr)}? De 9am a 7pm.`;
    }
    return `¿Confirmas la cita? Responde sí o no.`;
  }

  // ── 8. INTENCIONES DETECTADAS CON KEYWORDS ───────────────────
  const intencionKw = detectarIntencion(t);

  if (intencionKw === 'cancelar') {
    const n = await cancelarCitasPendientes(cliente.id);
    await resetEstado(cliente.id);
    await notificarAdmins(`⚠️ ${cliente.nombre} canceló su cita.\n📱 ${cliente.telefono||'Sin tel'}`);
    log('CANCELAR', { cliente: cliente.nombre, canceladas: n });
    return n > 0 ? `Va, cita cancelada 👍 Si quieres agendar otra aquí estoy.` : `No encontré citas activas. ¿Quieres agendar una?`;
  }

  if (intencionKw === 'reagendar') {
    await cancelarCitasPendientes(cliente.id);
    const ia = await llamarClaude(mensaje, historial, cliente, estado, servicios);
    if (ia?.fechaStr) {
      const vf = validarFecha(ia.fechaStr);
      if (!vf.ok) { await setEstado(cliente.id, {paso:'esperando_fecha', servicio:estado.servicio||'', precio:estado.precio||0, emoji:estado.emoji||'✂️'}); return vf.msg || `¿Para cuándo?`; }
      const svcNombre = ia.servicio || estado.servicio;
      const svc       = svcs.find(s => s.nombre === svcNombre);
      const horaFinal = ia.hora || parsearHora(t);
      if (svc && horaFinal) {
        const ok = await verificarDisponibilidad(ia.fechaStr, horaFinal);
        if (!ok) { await setEstado(cliente.id, {paso:'esperando_hora', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:ia.fechaStr}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
        await setEstado(cliente.id, {paso:'confirmando', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:ia.fechaStr, hora:horaFinal});
        return `Cita anterior cancelada ✓\n\n` + txConfirm(svc.emoji, svc.nombre, ia.fechaStr, horaFinal, svc.precio);
      }
      if (svc) { await setEstado(cliente.id, {paso:'esperando_hora', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:ia.fechaStr}); return `Cita anterior cancelada ✓\n\n¿A qué hora el ${fechaLegible(ia.fechaStr)}? De 9am a 7pm.`; }
    }
    await setEstado(cliente.id, {paso:'esperando_servicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:''});
    return `Cita anterior cancelada ✓\n\n¿Qué servicio quieres?\n\n${listaSinPrecio}`;
  }

  // ── 9. QUIERE AGENDAR ─────────────────────────────────────────
  const quiereAgendar = /\bcita\b|agendar|reservar|apartar|me\s+apuntas|apúntame|apuntame|me\s+puedes\s+dar\s+cita|échame\s+cita|hay\s+cita/.test(t) ||
    (t.includes('quiero') && (t.includes('corte') || t.includes('servicio') || t.includes('cita')));

  // Detectar persona si la menciona en este mensaje
  const personaMsg = detectarPersona(t);

  if (quiereAgendar || (infoEx.servicio && !estado.paso)) {
    if (infoEx.servicio && infoEx.fechaStr && infoEx.hora) {
      const vf = validarFecha(infoEx.fechaStr);
      if (!vf.ok) { await setEstado(cliente.id, {paso:'esperando_fecha', servicio:infoEx.servicio, precio:infoEx.precio, emoji:infoEx.emoji||'✂️'}); return vf.msg || `¿Para qué día?`; }
      const [h] = infoEx.hora.split(':').map(Number);
      if (h < 9 || h > 19) { await setEstado(cliente.id, {paso:'esperando_hora', ...infoEx, hora:''}); return `Atendemos de 9am a 7pm. ¿Qué hora te viene?`; }
      const ok = await verificarDisponibilidad(infoEx.fechaStr, infoEx.hora);
      if (!ok) { await setEstado(cliente.id, {paso:'esperando_hora', ...infoEx, hora:''}); return `Ese horario está ocupado 😬 ¿Tienes otro? De 9am a 7pm.`; }
      await setEstado(cliente.id, {paso:'confirmando', ...infoEx});
      return txConfirm(infoEx.emoji, infoEx.servicio, infoEx.fechaStr, infoEx.hora, infoEx.precio);
    }
    if (infoEx.servicio) {
      const nuevoEstado = {paso: infoEx.fechaStr ? 'esperando_hora' : 'esperando_fecha', ...infoEx};
      await setEstado(cliente.id, nuevoEstado);
      if (infoEx.fechaStr) return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio} el ${fechaLegible(infoEx.fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`;
      return `${saludo}${infoEx.emoji||'✂️'} ${infoEx.servicio}!\n\n¿Para qué día? (lunes a sábado)`;
    }
    if (infoEx.fechaStr) {
      // BUG FIX: validar fecha ANTES de guardarla — si es domingo o pasada, no guardar
      const vfPrevia = validarFecha(infoEx.fechaStr);
      if (!vfPrevia.ok) {
        // Guardar sin fecha inválida, pedir servicio primero y luego fecha válida
        await setEstado(cliente.id, {paso:'esperando_servicio', fechaStr:'', hora:'', servicio:'', precio:0, emoji:'', personaActual: personaMsg, pendingActions:[]});
        const paraQuienPrev = personaMsg !== 'cliente' ? ` para ${labelPersona(personaMsg)}` : '';
        return `${saludo}¿Qué servicio${paraQuienPrev} te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre.`;
      }
      await setEstado(cliente.id, {paso:'esperando_servicio', fechaStr:infoEx.fechaStr, hora:infoEx.hora||'', servicio:'', precio:0, emoji:'', personaActual: personaMsg, pendingActions:[]});
      return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}`;
    }
    await setEstado(cliente.id, { paso:'esperando_servicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'',
      personaActual: personaMsg, pendingActions: [] });
    const paraQuienAg = personaMsg !== 'cliente' ? ` para ${labelPersona(personaMsg)}` : '';
    log('AGENDAR', { persona: personaMsg, paso: 'esperando_servicio' });
    return `${saludo}¿Qué servicio${paraQuienAg} te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre.`;
  }

  // ── 10. PRECIOS / HORARIO ─────────────────────────────────────
  if (/precio|cuánto|cuanto|cuesta|cobran|servicios|qué\s+tienen|que\s+tienen/.test(t)) {
    return `${saludo}Nuestros servicios:\n\n${listaSvcs}`;
  }
  if (/horario|abren|atienden|días|dias|cuándo\s+abren|cuando\s+abren/.test(t)) {
    return `${saludo}Atendemos de lunes a sábado de 9am a 7pm.`;
  }

  // ── 11. CLAUDE COMO ÚLTIMO RECURSO ───────────────────────────
  const ia = await llamarClaude(mensaje, historial, cliente, estado, servicios);

  if (!ia) {
    // Claude falló — respuesta genérica
    await notificarAdmins(`❓ Sin respuesta de ${cliente.nombre}:\n"${mensaje}"\n📱 ${cliente.telefono||'Sin tel'}`);
    return `Ahorita no pude entender bien 😅 Zaira te ayuda en breve 🙏`;
  }

  if (ia.intencion === 'disponibilidad') {
    if (ia.fechaStr && !fechaEsPasada(ia.fechaStr)) {
      if (new Date(ia.fechaStr+'T12:00:00').getDay() === 0) return `Los domingos no atendemos. De lunes a sábado 9am-7pm 😊`;
      return `Sí hay espacio el ${fechaLegible(ia.fechaStr)} 😊 ¿Te agendo una cita?`;
    }
    return `Sí tenemos horarios 😊 ¿Para qué día quieres?`;
  }
  if (ia.intencion === 'saludo') {
    if (estado.paso !== 'inicio') await resetEstado(cliente.id);
    return saludar ? `${saludo}Bienvenid@ a Barbería Zaira 💅\n\n¿En qué te puedo ayudar?` : `¿En qué te puedo ayudar? 😊`;
  }
  if (ia.intencion === 'despedida') return `Con gusto! Que te vaya bien 😊`;
  if (ia.intencion === 'agendar') {
    const svc = ia.servicio ? svcs.find(s => s.nombre === ia.servicio) : null;
    if (svc) {
      const nuevo = {paso:'esperando_fecha', servicio:svc.nombre, precio:svc.precio, emoji:svc.emoji||'✂️', fechaStr:ia.fechaStr||'', hora:ia.hora||''};
      if (ia.fechaStr && ia.hora) { nuevo.paso = 'confirmando'; await setEstado(cliente.id, nuevo); return txConfirm(svc.emoji, svc.nombre, ia.fechaStr, ia.hora, svc.precio); }
      if (ia.fechaStr) { nuevo.paso = 'esperando_hora'; await setEstado(cliente.id, nuevo); return `${svc.emoji} ${svc.nombre} el ${fechaLegible(ia.fechaStr)}\n\n¿A qué hora? De 9am a 7pm.`; }
      await setEstado(cliente.id, nuevo);
      return `${svc.emoji} ${svc.nombre}!\n\n¿Para qué día? (lunes a sábado)`;
    }
    await setEstado(cliente.id, {paso:'esperando_servicio', servicio:'', precio:0, emoji:'', fechaStr:ia.fechaStr||'', hora:ia.hora||''});
    return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}`;
  }
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

    // ── Activar admin ────────────────────────────────────────────
    if (mensaje.trim() === `/admin${ADMIN_PWD}`) {
      await setAdmin(tel, true); await setAdminBotOn(tel, false); await setAdminModoPrueba(tel, false);
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>✅ Sesión admin iniciada!\n\nEscribe /ayuda para ver los comandos.</Body></Message></Response>` };
    }

    // ── Admin activo ─────────────────────────────────────────────
    const adminActivo = await esAdmin(tel);
    if (adminActivo) {
      if (mensaje.startsWith('/')) {
        const resp = await procesarComandoAdmin(mensaje, tel);
        return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${resp}</Body></Message></Response>` };
      }
      const modoPrueba = await getAdminModoPrueba(tel);
      if (modoPrueba) {
        const estado    = await getEstado(`prueba_${tel}`);
        const svcsJson  = await fsGet('servicios');
        const servicios = (svcsJson.documents||[]).map(parseDoc).filter(Boolean).filter(s => s.nombre);
        const cp        = { id:`prueba_${tel}`, nombre:'Admin (prueba)', telefono: tel };
        const respuesta = await procesarMensaje(mensaje, estado, cp, servicios, []);
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

    // ── Cliente ──────────────────────────────────────────────────
    let cliente = null;
    const clientesJson = await fsGet('clientes');
    for (const doc of (clientesJson.documents||[])) {
      const c = parseDoc(doc); if (!c) continue;
      const telDoc = normalizarTel(c.telefono||'');
      if (telDoc.length >= 8 && telDoc === tel) { cliente = c; break; }
    }

    if (!cliente) {
      log('CLIENTE_NUEVO', { tel, accion: 'creando' });
      try {
        const ref = await fsPost('clientes', {
          nombre:   { stringValue: 'Desconocid@' },
          telefono: { stringValue: tel },
          email:    { stringValue: '' },
          notas:    { stringValue: 'Registrad@ automáticamente por WhatsApp' },
          visitas:  { integerValue: 0 },
          puntos:   { integerValue: 0 },
          creadoEn: { timestampValue: new Date().toISOString() },
        });

        // Log completo para debugging
        log('CLIENTE_NUEVO_REF', { name: ref?.name || null, error: ref?.error || null });

        if (ref?.name) {
          cliente = {
            id: ref.name.split('/').pop(),
            nombre: 'Desconocid@',
            telefono: tel,
            visitas: 0,
            puntos: 0,
          };
          log('CLIENTE_CREADO', { id: cliente.id, tel });
          await notificarAdmins(`👤 Nuev@ contacto!\n📱 +52${tel}\nEdítalo en la app.`);
        } else if (ref?.error) {
          // Firestore devolvió error — loggear para debugging
          log('CLIENTE_ERROR_FIRESTORE', { code: ref.error.code, msg: ref.error.message, tel });
        }
      } catch (e) {
        log('CLIENTE_EXCEPTION', { error: e.message, tel });
      }
    }

    // Si Firestore falló al crear, igual responder y no bloquear el flujo
    if (!cliente) {
      log('CLIENTE_FALLBACK', { tel, motivo: 'fsPost falló, respondiendo sin persistencia' });
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>Hola! Bienvenid@ a Barbería Zaira 💅\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horario\n\nEscríbenos para ayudarte 😊</Body></Message></Response>` };
    }

    // FIX LATENCIA: llamadas en paralelo — reduce ~600ms de tiempo total
    const [botRes, estadoRaw, historialRaw, svcsJson] = await Promise.all([
      fsGet(`config_bot/${cliente.id}`),
      getEstado(cliente.id),
      getHistorial(cliente.id),
      fsGet('servicios'),
    ]);

    if (parseDoc(botRes)?.activo === false) {
      await guardarMsg(cliente.id, 'client', mensaje);
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
    }

    let estado      = estadoRaw;
    const historial = historialRaw;
    const servicios = (svcsJson.documents||[]).map(parseDoc).filter(Boolean).filter(s => s.nombre);

    await guardarMsg(cliente.id, 'client', mensaje);
    const respuesta = await procesarMensaje(mensaje, estado, cliente, servicios, historial);
    log('OUTPUT', { cliente: cliente.nombre, respuesta: respuesta.slice(0,80) });
    await guardarMsg(cliente.id, 'bot', respuesta);

    return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>` };

  } catch (err) {
    console.error('Error en webhook:', err);
    return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Ahorita no puedo responder. Intenta más tarde 🙏</Body></Message></Response>` };
  }
};