// Outbound delivery providers. If credentials are configured in the environment the
// real provider is used; otherwise delivery is simulated (and logged) so the whole
// app keeps working in development.

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  TWILIO_WHATSAPP_FROM,
  SENDGRID_API_KEY,
  EMAIL_FROM,
} = process.env;

async function twilioSend(to, body, from) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Twilio error ${res.status}`);
  return { providerId: json.sid, status: 'sent' };
}

export async function sendSms(to, body) {
  if (!to) throw new Error('Contact has no phone number');
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
    return twilioSend(to, body, TWILIO_FROM_NUMBER);
  }
  console.log(`[sms:simulated] -> ${to}: ${body}`);
  return { providerId: null, status: 'delivered', simulated: true };
}

export async function sendWhatsApp(to, body) {
  if (!to) throw new Error('Contact has no phone number');
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
    return twilioSend(`whatsapp:${to}`, body, `whatsapp:${TWILIO_WHATSAPP_FROM}`);
  }
  console.log(`[whatsapp:simulated] -> ${to}: ${body}`);
  return { providerId: null, status: 'delivered', simulated: true };
}

export async function sendEmail(to, subject, body) {
  if (!to) throw new Error('Contact has no email address');
  if (SENDGRID_API_KEY && EMAIL_FROM) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: EMAIL_FROM },
        subject: subject || '(no subject)',
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error ${res.status}`);
    return { providerId: res.headers.get('x-message-id'), status: 'sent' };
  }
  console.log(`[email:simulated] -> ${to}: ${subject} | ${body}`);
  return { providerId: null, status: 'delivered', simulated: true };
}

// Social / chat channels (Facebook, Instagram, Google Business, Live chat) require
// platform app approval; they are routed through this generic hook.
export async function sendSocial(channel, contact, body) {
  console.log(`[${channel}:simulated] -> contact#${contact.id}: ${body}`);
  return { providerId: null, status: 'delivered', simulated: true };
}

export const providersStatus = () => ({
  sms: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
  whatsapp: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM),
  email: !!(SENDGRID_API_KEY && EMAIL_FROM),
});
