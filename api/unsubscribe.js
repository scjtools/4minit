/**
 * Vercel serverless function — POST /api/unsubscribe
 * Removes a contact from the Brevo list and blacklists them from campaigns.
 */

const https = require('https');

function brevoReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path,
        method,
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

const ALLOWED_ORIGIN = 'https://4minit.xyz';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  const origin = req.headers['origin'] || '';
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);

  try {
    // Blacklist from email campaigns
    await brevoReq('PUT', `/v3/contacts/${encodeURIComponent(cleanEmail)}`, {
      emailBlacklisted: true,
    });

    // Remove from the newsletter list
    if (listId) {
      await brevoReq('POST', `/v3/contacts/lists/${listId}/contacts/remove`, {
        emails: [cleanEmail],
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unsubscribe handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
