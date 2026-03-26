const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ── Inicializar Firebase Admin ────────────────────────────────────
function getDB() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:    process.env.FIREBASE_PROJECT_ID,
        clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

// ── Bot responde según intención ──────────────────────────────────
async function generarRespuesta(mensaje, nombreCliente, proximaCita, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const serviciosLista = servicios.map(s => `${s.emoji} ${s.nombre}: $${s.precio}`).join('\n');

  const system = `Eres el asistente virtual de Barbería Zaira. Respondes mensajes de WhatsApp de clientas.

SERVICIOS DISPONIBLES:
${serviciosLista}

HORARIO: Lunes a sábado 9am - 8pm.

CLIENTA ACTUAL: ${nombreCliente || 'Clienta'}
${proximaCita ? `PRÓXIMA CITA: ${proximaCita}` : 'SIN CITA AGENDADA'}

INSTRUCCIONES:
- Responde en español mexicano casual y amable
- Máximo 2-3 oraciones por respuesta
- Si preguntan precios, muestra la lista de servicios
- Si quieren agendar, diles que visiten: ${process.env.APP_URL || 'la app'}
- No uses asteriscos ni markdown, solo texto plano
- Firma como "Barbería Zaira 💅"`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system,
    messages: [{ role: 'user', content: mensaje }],
  });

  return response.content[0]?.text || 'Gracias por escribirnos. Te contactamos pronto 💅';
}

// ── Handler principal ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const db = getDB();

    // Parsear body de Twilio (viene como form-urlencoded)
    const params = new URLSearchParams(event.body);
    const mensajeTexto = params.get('Body') || '';
    const numeroFrom   = params.get('From') || ''; // whatsapp:+521234567890
    const telefono     = numeroFrom.replace('whatsapp:', '').replace('+52', '').trim();

    console.log(`Mensaje de ${numeroFrom}: ${mensajeTexto}`);

    // Buscar cliente por teléfono en Firestore
    let nombreCliente  = 'Clienta';
    let clienteId      = null;
    let proximaCita    = null;

    const clientesSnap = await db.collection('clientes').get();
    for (const doc of clientesSnap.docs) {
      const data = doc.data();
      const telGuardado = (data.telefono || '').replace(/\s/g, '').replace('+52', '');
      const telRecibido = telefono.replace(/\s/g, '');
      if (telGuardado === telRecibido || telGuardado.endsWith(telRecibido) || telRecibido.endsWith(telGuardado)) {
        nombreCliente = data.nombre || 'Clienta';
        clienteId     = doc.id;
        break;
      }
    }

    // Buscar próxima cita si existe el cliente
    if (clienteId) {
      const ahora = new Date();
      const citasSnap = await db.collection('citas')
        .where('clientId', '==', clienteId)
        .where('estado', '==', 'confirmed')
        .get();

      const citasFuturas = citasSnap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(c => {
          const fecha = c.fechaStr
            ? new Date(c.fechaStr + 'T12:00:00')
            : c.fecha?.toDate ? c.fecha.toDate() : new Date();
          return fecha >= ahora;
        })
        .sort((a, b) => {
          const da = a.fechaStr ? new Date(a.fechaStr + 'T12:00:00') : a.fecha?.toDate();
          const db2 = b.fechaStr ? new Date(b.fechaStr + 'T12:00:00') : b.fecha?.toDate();
          return da - db2;
        });

      if (citasFuturas.length > 0) {
        const c = citasFuturas[0];
        const fecha = c.fechaStr
          ? new Date(c.fechaStr + 'T12:00:00')
          : c.fecha?.toDate ? c.fecha.toDate() : new Date();
        proximaCita = `${c.servicio} el ${fecha.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })} a las ${c.hora}`;
      }
    }

    // Obtener servicios
    const serviciosSnap = await db.collection('servicios').get();
    const servicios = serviciosSnap.docs.map(d => d.data());

    // Guardar mensaje de la clienta en Firestore
    if (clienteId) {
      await db.collection('clientes').doc(clienteId).collection('mensajes').add({
        de:        'client',
        texto:     mensajeTexto,
        timestamp: new Date(),
      });
    }

    // Generar respuesta con Claude
    const respuesta = await generarRespuesta(mensajeTexto, nombreCliente, proximaCita, servicios);

    // Guardar respuesta del bot en Firestore
    if (clienteId) {
      await db.collection('clientes').doc(clienteId).collection('mensajes').add({
        de:        'bot',
        texto:     respuesta,
        timestamp: new Date(),
      });
    }

    // Responder a Twilio en formato TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>${respuesta}</Body>
  </Message>
</Response>`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: twiml,
    };

  } catch (err) {
    console.error('Error en webhook:', err);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>Hola! En este momento no podemos responder. Por favor intenta más tarde 💅</Body>
  </Message>
</Response>`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: twiml,
    };
  }
};