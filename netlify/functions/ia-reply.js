const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { clienteNombre, mensaje, historial, servicios, visitas, puntos, notas, proximaCita } = JSON.parse(event.body);

    const svcsInfo = (servicios || [])
      .map(s => `${s.emoji||'✂️'} ${s.nombre}: $${s.precio}`)
      .join('\n');

    const perfilLineas = [
      visitas > 0 ? `Visitas: ${visitas}` : 'Clienta nueva',
      puntos  > 0 ? `Puntos de lealtad: ${puntos}` : null,
      notas       ? `Notas: ${notas}` : null,
      proximaCita ? `Próxima cita: ${proximaCita}` : 'Sin cita próxima',
    ].filter(Boolean).join('\n');

    const system = `Eres Zai, asistente de Barbería Zaira en México.
Estás ayudando a Zaira a responder un mensaje de su clienta ${clienteNombre||'la clienta'}.
Genera UNA respuesta corta, natural y en español mexicano casual.
Máximo 2 oraciones. Sin markdown. Sin links. Sin asteriscos.

PERFIL DE LA CLIENTA:
${perfilLineas}

SERVICIOS DISPONIBLES:
${svcsInfo}

HORARIO: Lunes a sábado 9am a 7pm.

REGLAS:
- Responde directamente al último mensaje. No te presentes, no digas el nombre del negocio.
- Si tiene próxima cita y el mensaje la menciona, refiérete a ella con los datos reales.
- Si es clienta frecuente (visitas > 3), usa tono más familiar y personalizado.
- Nunca inventes precios ni horarios disponibles.`;

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