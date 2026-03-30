/**
 * BarberBot v3.0 — Generar respuesta IA desde la app
 */

const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { clienteNombre, mensaje, historial, servicios } = JSON.parse(event.body || '{}');

    if (!mensaje) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Falta el mensaje' }),
      };
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const svcsInfo = (servicios || [])
      .map(s => `${s.emoji || '✂️'} ${s.nombre}: $${s.precio}`)
      .join('\n') || '✂️ Corte: $100';

    const system = `Eres Zai, asistente de Barbería Zaira. Respondes por WhatsApp de forma natural en español mexicano.

SERVICIOS:
${svcsInfo}

HORARIO: Lunes a sábado 9am a 7pm.

CLIENTE: ${clienteNombre || 'Cliente'}

PERSONALIDAD:
- Tono mexicano natural: "Sale", "Va", "Órale", "Ahorita"
- NO exageras ni usas expresiones forzadas
- Directo y amable, como una amiga
- 2-3 oraciones máximo
- Sin markdown ni asteriscos
- NUNCA des links`;

    const messages = [
      ...(historial || [])
        .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content: m.texto }))
        .filter(m => m.content?.trim()),
      { role: 'user', content: mensaje },
    ];

    // Garantizar alternancia
    const alt = [];
    for (const m of messages) {
      if (alt.length && alt[alt.length - 1].role === m.role) {
        alt[alt.length - 1] = m;
      } else {
        alt.push(m);
      }
    }
    while (alt.length && alt[0].role !== 'user') alt.shift();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system,
      messages: alt,
    });

    const respuesta = response.content[0]?.text?.trim() || 'Con gusto te ayudo 😊';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuesta }),
    };

  } catch (err) {
    console.error('ia-reply error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
