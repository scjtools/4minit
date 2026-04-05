/**
 * Vercel serverless function — POST /api/subscribe
 * Adds an email address to the Brevo subscriber list.
 */

const https = require('https');

function brevoReq(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/contacts',
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  if (!listId) {
    console.error('BREVO_LIST_ID is not configured');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const brevoRes = await brevoReq({
      email: email.toLowerCase().trim(),
      listIds: [listId],
      updateEnabled: true, // silently handles re-subscribes
    });

    // 201 = created, 204 = already exists (updateEnabled), both are success
    if (brevoRes.status === 201 || brevoRes.status === 204) {
      return res.status(200).json({ success: true });
    }

    console.error('Brevo error:', brevoRes.status, brevoRes.body);
    return res.status(500).json({ error: 'Subscription failed. Please try again.' });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
