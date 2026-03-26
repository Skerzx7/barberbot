const Anthropic = require('@anthropic-ai/sdk');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Obtener token de acceso usando la service account
async function getAccessToken() {
  const { GoogleAuth } = require('google-auth-library');
  const privateKey = process.env.FIREBASE_PRIVATE_KEY_B64
    ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_B64, 'base64').toString('utf8')
    : process.env.FIREBASE_PRIVATE_KEY?.split('\\n').join('\n');

  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key:  privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();
  const token  = await client.getAccessToken();
  return token.token;
}

// Leer colección de Firestore via REST
async function getCollection(token, coleccion) {
  const res = await fetch(`${FIRESTORE_URL}/${coleccion}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.documents || [];
}

// Convertir documento Firestore a objeto JS
function parseDoc(doc) {
  const fields = doc.fields || {};
  const obj = { id: doc.name.split('/').pop() };
  for (const [key, val] of Object.entries(fields)) {
    if (val.stringValue !== undefined)  obj[key] = val.stringValue;
    if (val.integerValue !== undefined) obj[key] = Number(val.integerValue);
    if (val.doubleValue !== undefined)  obj[key] = val.doubleValue;
    if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
  }
  return obj;
}

// Guardar mensaje en Firestore via REST
async function guardarMensaje(token, clienteId, de, texto) {
  const url = `${FIRESTORE_URL}/clientes/${clienteId}/mensajes`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        de:        { stringValue: de },
        texto:     { stringValue: texto },
        timestamp: { stringValue: new Date().toISOString() },
      }
    }),
  });
}

// Generar respuesta con Claude
async function generarRespuesta(mensaje, nombreCliente, proximaCita, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const serviciosLista = servicios.map(s => `${s.emoji || '✂️'} ${s.nombre}: $${s.precio}`).join('\n');

  const system = `Eres el asistente virtual de Barbería Zaira. Respondes mensajes de WhatsApp de clientas en español mexicano casual y amable.

SERVICIOS:
${serviciosLista}

HORARIO: Lunes a sábado 9am - 8pm.
CLIENTA: ${nombreCliente || 'Clienta'}
${proximaCita ? `PRÓXIMA CITA: ${proximaCita}` : ''}

REGLAS:
- Máximo 2-3 oraciones
- Sin asteriscos ni markdown
- Si quieren agendar, manda a: ${process.env.APP_URL}
- Firma como "Barbería Zaira 💅"`;

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 200,
    system,
    messages:   [{ role: 'user', content: mensaje }],
  });

  return response.content[0]?.text || 'Gracias por escribirnos 💅';
}

// Handler principal
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const params        = new URLSearchParams(event.body);
    const mensajeTexto  = params.get('Body') || '';
    const numeroFrom    = params.get('From') || '';
    const telefono      = numeroFrom.replace('whatsapp:', '').replace('+52', '').replace(/\s/g, '');

    console.log(`Mensaje de ${numeroFrom}: ${mensajeTexto}`);

    const token = await getAccessToken();

    // Buscar cliente
    let nombreCliente = 'Clienta';
    let clienteId     = null;
    let proximaCita   = null;

    const clientesDocs = await getCollection(token, 'clientes');
    for (const doc of clientesDocs) {
      const c = parseDoc(doc);
      const telGuardado = (c.telefono || '').replace(/\s/g, '').replace('+52', '');
      if (telGuardado === telefono || telGuardado.endsWith(telefono) || telefono.endsWith(telGuardado)) {
        nombreCliente = c.nombre || 'Clienta';
        clienteId     = c.id;
        break;
      }
    }

    // Buscar próxima cita
    if (clienteId) {
      const citasDocs = await getCollection(token, 'citas');
      const ahora     = new Date();
      const futuras   = citasDocs
        .map(parseDoc)
        .filter(c => c.clientId === clienteId && c.estado === 'confirmed')
        .filter(c => {
          const fecha = c.fechaStr ? new Date(c.fechaStr + 'T12:00:00') : new Date();
          return fecha >= ahora;
        })
        .sort((a, b) => new Date(a.fechaStr + 'T12:00:00') - new Date(b.fechaStr + 'T12:00:00'));

      if (futuras.length > 0) {
        const c     = futuras[0];
        const fecha = new Date(c.fechaStr + 'T12:00:00');
        proximaCita = `${c.servicio} el ${fecha.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })} a las ${c.hora}`;
      }
    }

    // Obtener servicios
    const serviciosDocs = await getCollection(token, 'servicios');
    const servicios     = serviciosDocs.map(parseDoc);

    // Guardar mensaje entrante
    if (clienteId) await guardarMensaje(token, clienteId, 'client', mensajeTexto);

    // Generar y guardar respuesta
    const respuesta = await generarRespuesta(mensajeTexto, nombreCliente, proximaCita, servicios);
    if (clienteId) await guardarMensaje(token, clienteId, 'bot', respuesta);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${respuesta}</Body></Message></Response>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml };

  } catch (err) {
    console.error('Error en webhook:', err);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Hola! En este momento no podemos responder. Intenta más tarde 💅</Body></Message></Response>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml };
  }
};