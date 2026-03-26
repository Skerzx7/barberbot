const Anthropic = require('@anthropic-ai/sdk');

function normalizarTel(tel) {
  return tel.replace(/\D/g, '').replace(/^521?/, '').slice(-10);
}

async function generarRespuesta(mensajeActual, historial, nombreCliente, proximaCita, servicios) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const serviciosLista = servicios.length > 0
    ? servicios.map(s => `${s.emoji || '✂️'} ${s.nombre}: $${s.precio} (${s.duracion} min)`).join('\n')
    : `✂️ Corte de cabello: $100 (30 min)\n🪒 Arreglo de barba: $80 (25 min)\n💈 Corte + Barba: $160 (50 min)\n⚡ Fade/Degradado: $120 (40 min)\n✨ Tratamiento: $200 (45 min)\n👦 Corte niños: $80 (25 min)`;

  const historialFormato = historial
    .slice(-8)
    .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content: m.texto }))
    .filter(m => m.content?.trim());

  const system = `Eres Zai, la asistente de WhatsApp de Barbería Zaira en México. Respondes mensajes de clientas de forma amable y natural.

INFORMACIÓN DEL NEGOCIO:
- Nombre: Barbería Zaira
- Horario: Lunes a sábado 9am a 8pm. Domingos CERRADO.
- Para agendar citas: ${process.env.APP_URL || 'https://zairashair.netlify.app'}

SERVICIOS Y PRECIOS:
${serviciosLista}

CLIENTA: ${nombreCliente}
${proximaCita ? `CITA PRÓXIMA: ${proximaCita}` : 'Sin cita próxima registrada.'}

REGLAS ESTRICTAS:
1. Responde SOLO sobre temas de la barbería: precios, horarios, citas, servicios
2. Si preguntan algo que no tiene que ver con la barbería, diles amablemente que solo puedes ayudar con temas del negocio
3. NUNCA inventes precios, horarios o información que no esté arriba
4. NUNCA digas que puedes agendar citas directamente — siempre manda al link
5. Si no sabes algo, di "No tengo esa información, te recomiendo llamar directamente"
6. Máximo 3 oraciones por respuesta
7. Habla en español mexicano casual, sin asteriscos ni markdown
8. Solo firma como "- Zai 💅" en el primer mensaje o cuando sea natural`;

  const messages = [
    ...historialFormato,
    { role: 'user', content: mensajeActual },
  ];

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 250,
    system,
    messages,
  });

  return response.content[0]?.text?.trim() || 'Gracias por escribirnos 💅';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const params  = new URLSearchParams(event.body);
    const mensaje = params.get('Body')?.trim() || '';
    const from    = params.get('From') || '';
    const tel     = normalizarTel(from.replace('whatsapp:', ''));

    if (!mensaje) return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };

    console.log(`Mensaje de ${from} (${tel}): ${mensaje}`);

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const apiKey    = process.env.VITE_FIREBASE_API_KEY;
    const baseUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    let clienteId     = null;
    let nombreCliente = 'Clienta';
    let proximaCita   = null;
    let historial     = [];
    let botActivo     = true;

    // Buscar cliente
    const clientesRes  = await fetch(`${baseUrl}/clientes?key=${apiKey}`);
    const clientesJson = await clientesRes.json();

    for (const doc of (clientesJson.documents || [])) {
      const fields   = doc.fields || {};
      const telDoc   = normalizarTel(fields.telefono?.stringValue || '');
      if (telDoc.length >= 8 && telDoc === tel) {
        clienteId     = doc.name.split('/').pop();
        nombreCliente = fields.nombre?.stringValue || 'Clienta';
        break;
      }
    }

    if (clienteId) {
      // Verificar si bot está activo
      const botRes  = await fetch(`${baseUrl}/config_bot/${clienteId}?key=${apiKey}`);
      const botJson = await botRes.json();
      if (botJson.fields?.activo?.booleanValue === false) botActivo = false;

      if (!botActivo) {
        console.log('Bot OFF para esta clienta — guardando mensaje sin responder');
        await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: {
            de:        { stringValue: 'client' },
            texto:     { stringValue: mensaje },
            timestamp: { stringValue: new Date().toISOString() },
            canal:     { stringValue: 'whatsapp' },
          }}),
        });
        return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: `<?xml version="1.0" encoding="UTF-8"?><Response></Response>` };
      }

      // Obtener historial
      const msgsRes  = await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`);
      const msgsJson = await msgsRes.json();
      historial = (msgsJson.documents || [])
        .map(d => ({
          de:    d.fields?.de?.stringValue || 'client',
          texto: d.fields?.texto?.stringValue || '',
        }))
        .filter(m => m.texto.trim());

      // Guardar mensaje entrante
      await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          de:        { stringValue: 'client' },
          texto:     { stringValue: mensaje },
          timestamp: { stringValue: new Date().toISOString() },
          canal:     { stringValue: 'whatsapp' },
        }}),
      });

      // Buscar próxima cita
      const citasRes  = await fetch(`${baseUrl}/citas?key=${apiKey}`);
      const citasJson = await citasRes.json();
      const ahora     = new Date();
      const futuras   = (citasJson.documents || [])
        .map(d => ({ ...d.fields, id: d.name.split('/').pop() }))
        .filter(c =>
          c.clientId?.stringValue === clienteId &&
          c.estado?.stringValue   === 'confirmed' &&
          c.fechaStr?.stringValue &&
          new Date(c.fechaStr.stringValue + 'T12:00:00') >= ahora
        )
        .sort((a, b) => new Date(a.fechaStr.stringValue) - new Date(b.fechaStr.stringValue));

      if (futuras.length > 0) {
        const c     = futuras[0];
        const fecha = new Date(c.fechaStr.stringValue + 'T12:00:00');
        proximaCita = `${c.servicio?.stringValue} el ${fecha.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' })} a las ${c.hora?.stringValue}`;
      }

    } else {
      // Clienta desconocida — guardar en colección aparte
      await fetch(`${baseUrl}/mensajes_desconocidos?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          telefono:  { stringValue: from },
          texto:     { stringValue: mensaje },
          timestamp: { stringValue: new Date().toISOString() },
        }}),
      });
    }

    // Obtener servicios
    const svcsRes  = await fetch(`${baseUrl}/servicios?key=${apiKey}`);
    const svcsJson = await svcsRes.json();
    const servicios = (svcsJson.documents || []).map(d => ({
      nombre:   d.fields?.nombre?.stringValue   || '',
      precio:   d.fields?.precio?.integerValue  || d.fields?.precio?.stringValue  || '0',
      duracion: d.fields?.duracion?.integerValue || d.fields?.duracion?.stringValue || '30',
      emoji:    d.fields?.emoji?.stringValue    || '✂️',
    })).filter(s => s.nombre);

    // Generar respuesta
    const respuesta = await generarRespuesta(mensaje, historial, nombreCliente, proximaCita, servicios);
    console.log(`Respuesta: ${respuesta}`);

    // Guardar respuesta
    if (clienteId) {
      await fetch(`${baseUrl}/clientes/${clienteId}/mensajes?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          de:        { stringValue: 'bot' },
          texto:     { stringValue: respuesta },
          timestamp: { stringValue: new Date().toISOString() },
          canal:     { stringValue: 'whatsapp' },
        }}),
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