const Anthropic = require('@anthropic-ai/sdk');

// Normalizar teléfono a 10 dígitos
function normalizarTel(tel) {
  return tel.replace(/\D/g, '').replace(/^52/, '').slice(-10);
}

// Obtener historial de conversación para memoria
function formatearHistorial(mensajes) {
  return mensajes
    .slice(-10) // últimos 10 mensajes para contexto
    .map(m => ({
      role: m.de === 'client' ? 'user' : 'assistant',
      content: m.texto,
    }))
    .filter(m => m.content);
}

async function generarRespuesta(mensajeActual, historial, nombreCliente, proximaCita, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const serviciosLista = servicios.length > 0
    ? servicios.map(s => `${s.emoji || '✂️'} ${s.nombre}: $${s.precio} (${s.duracion} min)`).join('\n')
    : `✂️ Corte de cabello: $100\n🪒 Arreglo de barba: $80\n💈 Corte + Barba: $160\n⚡ Fade/Degradado: $120\n✨ Tratamiento: $200\n👦 Corte niños: $80`;

  const system = `Eres la asistente virtual de Barbería Zaira, una barbería en México. Tu nombre es Zai. Eres amable, casual y usas emojis ocasionalmente.

SOBRE LA BARBERÍA:
- Nombre: Barbería Zaira
- Horario: Lunes a sábado de 9am a 8pm, domingos cerrado

SERVICIOS:
${serviciosLista}

CLIENTA ACTUAL: ${nombreCliente || 'Clienta nueva'}
${proximaCita ? `PRÓXIMA CITA DE ESTA CLIENTA: ${proximaCita}` : 'Esta clienta no tiene cita próxima agendada.'}

INSTRUCCIONES:
- Habla en español mexicano casual, como si fueras una persona real
- Máximo 2-3 oraciones por respuesta
- Si quieren agendar una cita, diles que entren a: ${process.env.APP_URL || 'https://zairashair.netlify.app'}
- Si preguntan por disponibilidad, diles que vean los horarios en la app
- Si ya tienen cita, recuérdales los detalles
- No uses markdown ni asteriscos, solo texto plano
- No te presentes en cada mensaje, solo cuando sea el primero
- Firma ocasionalmente como "- Zai de Barbería Zaira 💅" pero no en cada mensaje`;

  // Construir historial para Claude
  const messages = [
    ...formatearHistorial(historial),
    { role: 'user', content: mensajeActual },
  ];

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 250,
    system,
    messages,
  });

  return response.content[0]?.text || 'Gracias por escribirnos 💅';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const params   = new URLSearchParams(event.body);
    const mensaje  = params.get('Body') || '';
    const from     = params.get('From') || '';
    const telRaw   = from.replace('whatsapp:', '');
    const tel      = normalizarTel(telRaw);

    console.log(`Mensaje de ${from} (${tel}): ${mensaje}`);

    // Buscar cliente y estado del bot en Firestore via REST
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const apiKey    = process.env.VITE_FIREBASE_API_KEY;
    const baseUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    // Buscar cliente por teléfono
    let clienteId     = null;
    let nombreCliente = 'Clienta';
    let proximaCita   = null;
    let historialMsgs = [];
    let botActivo     = true;

    const clientesRes = await fetch(`${baseUrl}/clientes?key=${apiKey}`);
    const clientesJson = await clientesRes.json();
    const clientes = (clientesJson.documents || []);

    for (const doc of clientes) {
      const fields = doc.fields || {};
      const telDoc = normalizarTel(fields.telefono?.stringValue || '');
      if (telDoc === tel && telDoc.length >= 8) {
        clienteId     = doc.name.split('/').pop();
        nombreCliente = fields.nombre?.stringValue || 'Clienta';
        break;
      }
    }

    if (clienteId) {
      // Chcar si bot está activo para este cliente
      const botRes  = await fetch(`${baseUrl}/config_bot/${clienteId}?key=${apiKey}`);
      const botJson = await botRes.json();
      if (botJson.fields?.activo?.booleanValue === false) {
        botActivo = false;
      }

      // Obtener historial de mensajes
      const msgsRes  = await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`);
      const msgsJson = await msgsRes.json();
      historialMsgs  = (msgsJson.documents || []).map(d => ({
        de:    d.fields?.de?.stringValue || 'client',
        texto: d.fields?.texto?.stringValue || '',
      }));

      // Guardar mensaje entrante
      await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            de:        { stringValue: 'client' },
            texto:     { stringValue: mensaje },
            timestamp: { stringValue: new Date().toISOString() },
            canal:     { stringValue: 'whatsapp' },
          }
        }),
      });

      // Buscar próxima cita
      const citasRes  = await fetch(`${baseUrl}/citas?key=${apiKey}`);
      const citasJson = await citasRes.json();
      const ahora     = new Date();
      const citasFuturas = (citasJson.documents || [])
        .map(d => ({ ...d.fields, id: d.name.split('/').pop() }))
        .filter(c =>
          c.clientId?.stringValue === clienteId &&
          c.estado?.stringValue === 'confirmed' &&
          c.fechaStr?.stringValue &&
          new Date(c.fechaStr.stringValue + 'T12:00:00') >= ahora
        )
        .sort((a, b) => new Date(a.fechaStr.stringValue) - new Date(b.fechaStr.stringValue));

      if (citasFuturas.length > 0) {
        const c     = citasFuturas[0];
        const fecha = new Date(c.fechaStr.stringValue + 'T12:00:00');
        proximaCita = `${c.servicio?.stringValue} el ${fecha.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })} a las ${c.hora?.stringValue}`;
      }
    } else {
      // Cliente desconocido — guardar en colección temporal
      await fetch(`${baseUrl}/mensajes_desconocidos?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            telefono:  { stringValue: telRaw },
            texto:     { stringValue: mensaje },
            timestamp: { stringValue: new Date().toISOString() },
          }
        }),
      });
    }

    // Si bot está desactivado, no responder
    if (!botActivo) {
      console.log('Bot desactivado para este cliente — no se responde automáticamente');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      };
    }

    // Obtener servicios
    const svcsRes  = await fetch(`${baseUrl}/servicios?key=${apiKey}`);
    const svcsJson = await svcsRes.json();
    const servicios = (svcsJson.documents || []).map(d => ({
      nombre:   d.fields?.nombre?.stringValue   || '',
      precio:   d.fields?.precio?.integerValue  || d.fields?.precio?.stringValue || '0',
      duracion: d.fields?.duracion?.integerValue || d.fields?.duracion?.stringValue || '30',
      emoji:    d.fields?.emoji?.stringValue    || '✂️',
    }));

    // Generar respuesta
    const respuesta = await generarRespuesta(mensaje, historialMsgs, nombreCliente, proximaCita, servicios);
    console.log(`Respuesta: ${respuesta}`);

    // Guardar respuesta del bot
    if (clienteId) {
      await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            de:        { stringValue: 'bot' },
            texto:     { stringValue: respuesta },
            timestamp: { stringValue: new Date().toISOString() },
            canal:     { stringValue: 'whatsapp' },
          }
        }),
      });
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message to="${from}"><Body>${respuesta}</Body></Message></Response>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml };

  } catch (err) {
    console.error('Error en webhook:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Hola! En este momento no podemos responder. Intenta más tarde 💅</Body></Message></Response>`,
    };
  }
};