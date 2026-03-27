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
const ESTADO_VACIO = { paso:'inicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:'', ultimoMensaje:'' };

async function getEstado(clienteId) {
  try {
    const doc = parseDoc(await fsGet(`conversacion_estado/${clienteId}`));
    if (doc) return doc;
  } catch {}
  return { ...ESTADO_VACIO };
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
    return (res.documents || []).map(parseDoc).filter(Boolean)
      .sort((a, b) => new Date(a.timestamp||0) - new Date(b.timestamp||0))
      .slice(-8)
      .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content: m.texto }))
      .filter(m => m.content?.trim());
  } catch { return []; }
}

// ── Diccionario mexicano ──────────────────────────────────────────
const ES_SI = /^(sí|si|yes|simon|simón|seimón|dale|ok|okey|claro|va|órale|orale|andale|ándale|sale|np|perfecto|listo|chido|échale|echale|de\s*una|de\s*volada|simona|a\s*huevo|pos\s*sí|pos\s*si|pus\s*si|pues\s*si|bueno|ta\s*bien|ta\s*bueno|tá\s*bien|mande|cómo\s*no|por\s*supuesto|seguro|école|confirmado|confirmo|correcto|exacto|así\s*es|con\s*todo|ya\s*va|va\s*que\s*va|simon\s*que\s*si)$/i;

const ES_NO = /^(no|nel|nop|nope|nel\s*pastel|para\s*nada|negativo|nombre|nones|ni\s*modo|mejor\s*no|nah|pos\s*no|pus\s*no|pues\s*no|de\s*ninguna\s*manera|nel\s*wey|nel\s*güey)$/i;

const ES_SALUDO = /^(hola|buenas|buenos|buen|hi|hey|saludos|ola|buenas\s+tardes|buenas\s+noches|buenos\s+días|buenos\s+dias|qué\s+onda|que\s+onda|quiubo|quiúbo|quiubole|qué\s+pedo|que\s+pedo|qué\s+rollo|que\s+rollo|qué\s+tal|que\s+tal|qué\s+hubo|que\s+hubo|épale|epale|ey|oye|oe|wey|güey|wei|ke\s+onda|epa)(.{0,20})?$/i;

const ES_DESPEDIDA = /^(gracias|ok|okey|de\s+nada|hasta\s+luego|bye|adios|adiós|listo|perfecto|excelente|genial|👍|np|sale|va|hasta\s+la\s+vista|nos\s+vemos|cuídate|cuídate\s+mucho|ahí\s+nos\s+vemos|ahí\s+nos\s+vidrios|orale\s+pues|órale\s+pues|chao|chau|hasta\s+pronto|mil\s+gracias|muchas\s+gracias|gracias\s+wey|gracias\s+güey)$/i;

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
async function llamarClaude(mensaje, historial, cliente, estado, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const svcsInfo  = servicios.map(s => `${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const hoyStr    = formatFecha(new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })));

  const system = `Eres Zai, asistente de WhatsApp de Barbería Zaira en México.
SERVICIOS: ${svcsInfo}
HORARIO: Lunes a sábado 9am a 7pm.
HOY: ${hoyStr}
CLIENTE: ${cliente.nombre}
ESTADO ACTUAL: paso=${estado.paso}, servicio=${estado.servicio||'ninguno'}, fecha=${estado.fechaStr||'ninguna'}, hora=${estado.hora||'ninguna'}

JERGA MEXICANA: simón/simon=sí, nel=no, sale/va/órale=de acuerdo, qué onda/quiubo=hola, chamaco/morrito/escuincle=niño, de volada=rápido, ahorita=ahora

REGLAS ESTRICTAS:
- NUNCA menciones links ni páginas web
- NUNCA inventes precios
- Fechas NUNCA anteriores a hoy (${hoyStr})
- Responde SOLO JSON sin texto extra:
{
  "intencion": "cancelar"|"reagendar"|"agendar"|"cambiar_servicio"|"cambiar_fecha"|"cambiar_hora"|"disponibilidad"|"info"|"saludo"|"despedida"|"otro",
  "servicio": "nombre exacto del servicio o null",
  "fechaStr": "YYYY-MM-DD o null",
  "hora": "HH:MM o null",
  "respuesta": "mensaje corto en español mexicano casual, max 2 oraciones, null si no aplica"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 250, system,
      messages: [...historial, { role: 'user', content: mensaje }],
    });
    const text   = response.content[0]?.text?.trim() || '{}';
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Validar fecha que devuelve Claude
    if (parsed.fechaStr && fechaEsPasada(parsed.fechaStr)) parsed.fechaStr = null;
    return parsed;
  } catch(e) {
    console.error('Claude error:', e.status || e.message);
    return null; // null = Claude falló, manejar con lógica de respaldo
  }
}

// ── Helper texto confirmación ─────────────────────────────────────
function txConfirm(emoji, servicio, fechaStr, hora, precio) {
  return `Confirma tu cita:\n\n${emoji||'✂️'} ${servicio}\n📅 ${fechaLegible(fechaStr)}\n⏰ ${horaLegible(hora)}\n💰 $${precio}\n\n¿Va? (sí/no)`;
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
    console.log('Estado expirado — reseteado');
  }

  // Saludo y nombre
  const saludar = !estado.ultimoMensaje || minutos > 240 || estadoExpirado;
  const nombre  = cliente?.nombre && cliente.nombre !== 'Desconocid@' ? ` ${cliente.nombre.split(' ')[0]}` : '';
  const saludo  = saludar ? `Hola${nombre}! 😊\n\n` : '';

  const svcs           = servicios.filter(s => s.nombre);
  const listaSvcs      = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`).join('\n');
  const listaSinPrecio = svcs.map((s,i) => `${i+1}. ${s.emoji||'✂️'} ${s.nombre}`).join('\n');
  const infoEx         = extraerInfoCita(mensaje, svcs);

  // ── 1. SALUDO — resetea estado si estaba trabado ──────────────
  if (ES_SALUDO.test(t)) {
    // Si estaba en confirmando, NO resetear — la cita sigue pendiente
    if (estado.paso === 'confirmando') {
      return `${saludo.trim() ? saludo : ''}Oye, aún tienes una cita pendiente de confirmar 😊\n\n${txConfirm(estado.emoji, estado.servicio, estado.fechaStr, estado.hora, estado.precio)}`;
    }
    if (estado.paso !== 'inicio') await resetEstado(cliente.id);
    if (saludar) return `${saludo}Bienvenid@ a Barbería Zaira 💅\n\n¿En qué te puedo ayudar?\n\n✂️ Ver precios\n📅 Agendar cita\n🕐 Horario`;
    return `¿En qué te puedo ayudar? 😊`;
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
      await crearCita(cliente.id, cliente.nombre, estado.servicio, estado.precio, estado.fechaStr, estado.hora);
      await resetEstado(cliente.id);
      await notificarAdmins(`📅 Nueva cita!\n👤 ${cliente.nombre}\n${estado.emoji||'✂️'} ${estado.servicio}\n📅 ${fechaLegible(estado.fechaStr)}\n⏰ ${horaLegible(estado.hora)}\n💰 $${estado.precio}\n📱 ${cliente.telefono||'Sin tel'}`);
      return `Cita confirmada! 🎉\n\nTe esperamos el ${fechaLegible(estado.fechaStr)} a las ${horaLegible(estado.hora)}.\n\nSi necesitas cancelar avísanos 🙏`;
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
      await setEstado(cliente.id, {paso:'esperando_servicio', fechaStr:infoEx.fechaStr, hora:infoEx.hora||'', servicio:'', precio:0, emoji:''});
      return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}`;
    }
    await setEstado(cliente.id, {paso:'esperando_servicio', servicio:'', precio:0, emoji:'', fechaStr:'', hora:''});
    return `${saludo}¿Qué servicio te gustaría?\n\n${listaSvcs}\n\nEscribe el número o el nombre.`;
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
    if (parseDoc(botRes)?.activo === false) {
      await guardarMsg(cliente.id, 'client', mensaje);
      return { statusCode:200, headers:{'Content-Type':'text/xml'}, body:`<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
    }

    let estado      = await getEstado(cliente.id);
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