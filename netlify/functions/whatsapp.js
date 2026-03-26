const Anthropic = require('@anthropic-ai/sdk');

async function generarRespuesta(mensaje) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = `Eres el asistente virtual de Barbería Zaira en México. Respondes mensajes de WhatsApp de clientas.

SERVICIOS Y PRECIOS:
✂️ Corte de cabello: $100
🪒 Arreglo de barba: $80
💈 Corte + Barba: $160
⚡ Fade / Degradado: $120
✨ Tratamiento: $200
👦 Corte niños: $80

HORARIO: Lunes a sábado de 9am a 8pm.

INSTRUCCIONES:
- Responde en español mexicano casual y amable
- Máximo 2-3 oraciones por respuesta
- Si preguntan por citas o quieren agendar, manda este link: ${process.env.APP_URL || 'https://zairashair.netlify.app'}
- No uses asteriscos ni markdown, solo texto plano
- Firma como "Barbería Zaira 💅"`;

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 200,
    system,
    messages:   [{ role: 'user', content: mensaje }],
  });

  return response.content[0]?.text || 'Gracias por escribirnos, en breve te atendemos 💅';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const params       = new URLSearchParams(event.body);
    const mensajeTexto = params.get('Body') || '';
    const numeroFrom   = params.get('From') || '';

    console.log(`Mensaje de ${numeroFrom}: ${mensajeTexto}`);

    const respuesta = await generarRespuesta(mensajeTexto);

    console.log(`Respuesta: ${respuesta}`);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${respuesta}</Body></Message></Response>`;
    console.log('TwiML:', twiml);
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml };


  } catch (err) {
    console.error('Error en webhook:', err);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Hola! En este momento no podemos responder. Intenta más tarde 💅</Body></Message></Response>`;
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml };
  }
};