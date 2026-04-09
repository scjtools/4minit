/**
 * Vercel serverless function — POST /api/subscribe
 * Adds an email address to the Brevo subscriber list.
 * Also unblacklists the contact so re-subscribers receive campaigns.
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
const EMAIL_RE       = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Module-level map persists across warm invocations within a function instance.
// Limits each IP to 5 requests per 60-second window.
const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_WINDOW = 60 * 1000;
const rateLimitMap      = new Map();

function isRateLimited(ip) {
  const now    = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  record.count += 1;
  return record.count > RATE_LIMIT_MAX;
}

module.exports = async function handler(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  // CORS — restrict to production domain only
  const origin = req.headers['origin'] || '';
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, _trap } = req.body || {};

  // Honeypot — bots fill hidden fields, humans don't
  if (_trap) return res.status(200).json({ success: true });

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  if (!listId) {
    console.error('BREVO_LIST_ID is not configured');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    // Add to list
    const addRes = await brevoReq('POST', '/v3/contacts', {
      email: cleanEmail,
      listIds: [listId],
      updateEnabled: true,
    });

    if (addRes.status !== 201 && addRes.status !== 204) {
      console.error('Brevo add error:', addRes.status, addRes.body);
      return res.status(500).json({ error: 'Subscription failed. Please try again.' });
    }

    // Unblacklist — ensures re-subscribers receive campaigns again
    await brevoReq('PUT', `/v3/contacts/${encodeURIComponent(cleanEmail)}`, {
      emailBlacklisted: false,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
