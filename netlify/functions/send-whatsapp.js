/**
 * BarberBot v3.0 — Enviar WhatsApp desde la app
 */

const NUMERO_BOT = process.env.TWILIO_SANDBOX_NUMBER || 'whatsapp:+14155238886';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { telefono, mensaje } = JSON.parse(event.body || '{}');

    if (!telefono || !mensaje) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos' }),
      };
    }

    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const auth  = Buffer.from(`${sid}:${token}`).toString('base64');
    const toWA  = `whatsapp:+52${telefono.replace(/\D/g,'').slice(-10)}`;

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: NUMERO_BOT,
        To: toWA,
        Body: mensaje,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, sid: data.sid }),
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: data.message || data.code }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
