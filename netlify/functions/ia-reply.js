const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { clienteNombre, mensaje, historial, servicios } = JSON.parse(event.body);

    const svcsInfo = (servicios || [])
      .map(s => `${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`)
      .join('\n');

    const system = `Eres Zai, asistente de Barbería Zaira en México.
Estás ayudando a Zaira a responder un mensaje de su clienta ${clienteNombre||'la clienta'}.
Genera UNA respuesta corta, natural y en español mexicano casual.
Máximo 2 oraciones. Sin markdown. Sin links. Sin asteriscos.

SERVICIOS DISPONIBLES:
${svcsInfo}

HORARIO: Lunes a sábado 9am a 7pm.

IMPORTANTE: Responde directamente al último mensaje. No te presentes, no digas el nombre del negocio.`;

    const messages = [
      ...(historial||[])
        .map(m => ({ role: m.de === 'client' ? 'user' : 'assistant', content: m.texto }))
        .filter(m => m.content?.trim()),
      { role: 'user', content: mensaje },
    ];

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response  = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 200,
      system,
      messages,
    });

    const respuesta = response.content[0]?.text?.trim() || 'Con gusto te ayudo 😊';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuesta }),
    };

  } catch(err) {
    console.error('ia-reply error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};