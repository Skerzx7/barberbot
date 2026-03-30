/**
 * BarberBot v3.0 — Recordatorios Automáticos
 * Netlify Scheduled Function: corre cada hora
 * Envía recordatorio 24h antes de cada cita
 */

const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';

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
async function enviarWA(telefono, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth  = Buffer.from(`${sid}:${token}`).toString('base64');
  const toWA  = `whatsapp:+52${telefono.replace(/\D/g,'').slice(-10)}`;
  
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method:'POST',
      headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: NUMERO_BOT, To: toWA, Body: body }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[RECORDATORIO OK] ${toWA}`);
      return true;
    } else {
      console.error(`[RECORDATORIO ERROR] ${data.message || data.code}`);
      return false;
    }
  } catch(e) {
    console.error(`[RECORDATORIO CATCH] ${e.message}`);
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log('[RECORDATORIOS] Iniciando...');

  try {
    // Obtener fecha de mañana (México)
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const mañana = new Date(ahora);
    mañana.setDate(mañana.getDate() + 1);
    const mañanaStr = `${mañana.getFullYear()}-${String(mañana.getMonth()+1).padStart(2,'0')}-${String(mañana.getDate()).padStart(2,'0')}`;

    console.log(`[RECORDATORIOS] Buscando citas para ${mañanaStr}`);

    // Obtener citas de mañana
    const citasRes = await fsGet('citas');
    const citasMañana = (citasRes.documents || [])
      .map(parseDoc)
      .filter(c => c && c.fechaStr === mañanaStr && c.estado === 'confirmed' && !c.recordatorioEnviado);

    console.log(`[RECORDATORIOS] ${citasMañana.length} citas sin recordatorio`);

    // Obtener clientes para sus teléfonos
    const clientesRes = await fsGet('clientes');
    const clientesMap = {};
    (clientesRes.documents || []).forEach(doc => {
      const c = parseDoc(doc);
      if (c) clientesMap[c.id] = c;
    });

    let enviados = 0;

    for (const cita of citasMañana) {
      const cliente = clientesMap[cita.clientId];
      if (!cliente?.telefono) {
        console.log(`[RECORDATORIOS] Sin teléfono: ${cita.clienteNombre}`);
        continue;
      }

      // Formatear hora
      const h = Number(cita.hora?.split(':')[0] || 0);
      const m = Number(cita.hora?.split(':')[1] || 0);
      const horaLeg = `${h > 12 ? h-12 : h || 12}:${String(m).padStart(2,'0')}${h >= 12 ? 'pm' : 'am'}`;

      // Mensaje de recordatorio
      const mensaje = `Hola ${(cliente.nombre || 'cliente').split(' ')[0]}! 👋\n\nTe recordamos tu cita de mañana:\n\n✂️ ${cita.servicio}\n⏰ ${horaLeg}\n📍 Barbería Zaira\n\n¿Te vemos mañana? Responde "sí" para confirmar o "no" si necesitas cancelar.`;

      const ok = await enviarWA(cliente.telefono, mensaje);
      
      if (ok) {
        // Marcar como enviado
        await fsSet(`citas/${cita.id}`, toFields({
          ...cita,
          recordatorioEnviado: true,
          recordatorioFecha: new Date().toISOString(),
        }));
        enviados++;
      }

      // Rate limit: máximo 1 por segundo
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[RECORDATORIOS] ${enviados} recordatorios enviados`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, enviados, total: citasMañana.length }),
    };

  } catch(err) {
    console.error('[RECORDATORIOS ERROR]', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
