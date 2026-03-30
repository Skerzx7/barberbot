/**
 * BarberBot v3.0 — Webhook Twilio
 * Fire-and-forget: responde vacío en <500ms
 */

const ADMIN_PWD  = process.env.ADMIN_PASSWORD || '1307';

// ── Firestore REST ────────────────────────────────────────────────
const PID    = () => process.env.FIREBASE_PROJECT_ID;
const APIKEY = () => process.env.VITE_FIREBASE_API_KEY;
const BASE   = () => `https://firestore.googleapis.com/v1/projects/${PID()}/databases/(default)/documents`;

async function fsGet(path) {
  const r = await fetch(`${BASE()}/${path}?key=${APIKEY()}`);
  return r.json();
}
async function fsSet(path, fields) {
  await fetch(`${BASE()}/${path}?key=${APIKEY()}`, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fields}),
  });
}

function parseDoc(doc) {
  if (!doc?.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k,v] of Object.entries(doc.fields)) {
    if (v.stringValue   !== undefined) obj[k] = v.stringValue;
    if (v.integerValue  !== undefined) obj[k] = Number(v.integerValue);
    if (v.booleanValue  !== undefined) obj[k] = v.booleanValue;
  }
  return obj;
}
function toFields(obj) {
  const f = {};
  for (const [k,v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string')  f[k] = { stringValue: v };
    if (typeof v === 'boolean') f[k] = { booleanValue: v };
  }
  return f;
}

function normalizarTel(tel) {
  return tel.replace(/\D/g,'').replace(/^521?/,'').slice(-10);
}

// ── Comandos admin (rápidos, sin Claude) ──────────────────────────
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
  if (c === '/ayuda') return `/on — Bot ON\n/off — Bot OFF\n/prueba — Test\n/citas — Hoy\n/mañana — Mañana\n/salir — Cerrar`;
  // Los demás comandos van a procesar.js
  return null;
}

// ── Handler webhook Twilio ────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method not allowed' };

  const params  = new URLSearchParams(event.body || '');
  const mensaje = params.get('Body')?.trim() || '';
  const from    = params.get('From') || '';
  const tel     = normalizarTel(from.replace('whatsapp:',''));

  if (!mensaje) return xml('');

  console.log(`[WEBHOOK] ${from}: ${mensaje.slice(0,60)}`);

  // Login admin
  if (mensaje.trim() === `/admin${ADMIN_PWD}`) {
    await fsSet(`admin_sesion/${tel}`, toFields({ activo:true }));
    await fsSet(`admin_bot/${tel}`,    toFields({ activo:false, modoPrueba:false }));
    return xml(`✅ Admin ON\nEscribe /ayuda`, from);
  }

  // Comandos admin rápidos
  const adminDoc = parseDoc(await fsGet(`admin_sesion/${tel}`));
  if (adminDoc?.activo && mensaje.startsWith('/')) {
    const resp = await procesarAdmin(mensaje, tel);
    if (resp) return xml(resp, from);
    // Si es null, va a procesar.js (como /citas)
  }

  // Todo lo demás: disparar procesar.js en background
  const appUrl = process.env.APP_URL || 'https://zairashair.netlify.app';
  fetch(`${appUrl}/.netlify/functions/procesar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensaje, from, tel }),
  }).catch(e => console.error('[DISPATCH ERROR]', e.message));

  // Twilio recibe vacío inmediato
  return xml('');
};

function xml(body, to) {
  const msg = body && to ? `<Message to="${to}"><Body>${body}</Body></Message>` : '';
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response>${msg}</Response>`,
  };
}
