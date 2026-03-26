exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { telefono, mensaje } = JSON.parse(event.body);

    if (!telefono || !mensaje) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos' }) };
    }

    // Normalizar teléfono
    const telLimpio = telefono.replace(/\D/g, '').replace(/^52/, '').slice(-10);
    const telWA     = `whatsapp:+52${telLimpio}`;
    const from      = `whatsapp:+14155238886`; // número del sandbox — cambiar cuando tengas número real

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const auth       = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from,
        To:   telWA,
        Body: mensaje,
      }),
    });

    const data = await res.json();

    if (data.error_code) {
      console.error('Twilio error:', data);
      return { statusCode: 400, body: JSON.stringify({ error: data.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sid: data.sid }) };

  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};