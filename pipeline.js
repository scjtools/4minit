#!/usr/bin/env node
'use strict';

/**
 * 4minit Newsletter Pipeline
 *
 * Usage:
 *   node pipeline.js --pre              Trigger aggregator → wait → fetch feed.json
 *   node pipeline.js --post YYYY-MM-DD  Update archive → git push → send via Brevo
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

// ─── Secrets loader ──────────────────────────────────────────────────────────
// Reads from ~/.config/4minit/secrets (key=value format, chmod 600).
// Values already in process.env take precedence (e.g. CI environments).

function loadSecrets() {
  const secretsPath = path.join(process.env.HOME || '', '.config', '4minit', 'secrets');
  try {
    const lines = fs.readFileSync(secretsPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // File not found — fall through to process.env only
  }
}
loadSecrets();

// ─── Config ─────────────────────────────────────────────────────────────────

const GITHUB_TOKEN        = process.env.GITHUB_TOKEN;
const BREVO_API_KEY       = process.env.BREVO_API_KEY;
const BREVO_LIST_ID       = parseInt(process.env.BREVO_LIST_ID || '0', 10);
const BREVO_SENDER_EMAIL  = process.env.BREVO_SENDER_EMAIL || 'news@4minit.xyz';
const BREVO_SENDER_NAME   = process.env.BREVO_SENDER_NAME  || '4minit Daily News';

const AGGREGATOR_OWNER = 'scjtools';
const AGGREGATOR_REPO  = 'mauritius-news-aggregator';

const REPO_DIR        = path.dirname(path.resolve(__filename));
const NEWSLETTERS_DIR = path.join(REPO_DIR, 'newsletters');
const FEED_PATH       = path.join(REPO_DIR, 'feed.json');

// ─── Date helpers ────────────────────────────────────────────────────────────

function getMauritiusDate() {
  const now = new Date();
  // UTC+4
  const mu  = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const d   = String(mu.getUTCDate()).padStart(2, '0');
  const m   = String(mu.getUTCMonth() + 1).padStart(2, '0');
  const y   = mu.getUTCFullYear();
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return {
    filename: `${y}-${m}-${d}`,
    display:  `${d}.${m}.${y}`,
    long:     `${days[mu.getUTCDay()]} ${parseInt(d)} ${months[mu.getUTCMonth()]} ${y}`,
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function githubReq(method, p, body = null) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set');
  return httpsRequest({
    hostname: 'api.github.com',
    path:     p,
    method,
    headers:  {
      Authorization:  `Bearer ${GITHUB_TOKEN}`,
      Accept:         'application/vnd.github.v3+json',
      'User-Agent':   '4minit-pipeline',
      'Content-Type': 'application/json',
    },
  }, body);
}

function brevoReq(method, p, body = null) {
  if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set');
  const jsonBody = body ? JSON.stringify(body) : null;
  return httpsRequest({
    hostname: 'api.brevo.com',
    path:     p,
    method,
    headers:  {
      'api-key':        BREVO_API_KEY,
      'Content-Type':   'application/json',
      Accept:           'application/json',
      'User-Agent':     '4minit-pipeline/1.0',
      ...(jsonBody ? { 'Content-Length': Buffer.byteLength(jsonBody).toString() } : {}),
    },
  }, jsonBody);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Pipeline steps ───────────────────────────────────────────────────────────

async function triggerAggregator() {
  console.log('→ Triggering aggregate.yml workflow…');
  const res = await githubReq(
    'POST',
    `/repos/${AGGREGATOR_OWNER}/${AGGREGATOR_REPO}/actions/workflows/aggregate.yml/dispatches`,
    { ref: 'main' }
  );
  if (res.status !== 204) {
    throw new Error(`Trigger failed: HTTP ${res.status}\n${res.body}`);
  }
  console.log('✓ Workflow triggered');
}

async function waitForAggregator() {
  console.log('→ Waiting for workflow to complete (polls every 30 s, timeout 20 min)…');
  const deadline = Date.now() + 20 * 60 * 1000;
  await sleep(8000); // give GitHub a moment to register the run

  while (Date.now() < deadline) {
    const res  = await githubReq(
      'GET',
      `/repos/${AGGREGATOR_OWNER}/${AGGREGATOR_REPO}/actions/workflows/aggregate.yml/runs?per_page=1`
    );
    const data = JSON.parse(res.body);
    const run  = data.workflow_runs?.[0];

    if (!run) { await sleep(30000); continue; }

    console.log(`  run ${run.id}: status=${run.status}  conclusion=${run.conclusion ?? '—'}`);

    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        console.log('✓ Aggregator finished successfully');
        return;
      }
      throw new Error(`Aggregator run ended with conclusion: ${run.conclusion}`);
    }
    await sleep(30000);
  }
  throw new Error('Aggregator timed out after 20 minutes');
}

async function fetchFeed() {
  console.log('→ Fetching feed.json…');
  const res = await httpsRequest({
    hostname: 'raw.githubusercontent.com',
    path:     `/${AGGREGATOR_OWNER}/${AGGREGATOR_REPO}/main/feed.json`,
    method:   'GET',
    headers:  {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'User-Agent':  '4minit-pipeline',
    },
  });
  if (res.status !== 200) throw new Error(`feed.json fetch failed: HTTP ${res.status}`);
  fs.writeFileSync(FEED_PATH, res.body, 'utf8');
  const count = JSON.parse(res.body).item_count ?? '?';
  console.log(`✓ feed.json saved (${count} items) → ${FEED_PATH}`);
}

function runScript(scriptName, ...args) {
  const scriptPath = path.join(REPO_DIR, 'scripts', scriptName);
  const argStr     = args.map(a => JSON.stringify(a)).join(' ');
  execSync(`node ${scriptPath} ${argStr}`, {
    cwd:   REPO_DIR,
    stdio: 'inherit',
  });
}

function commitAndPush(dateStr) {
  console.log('→ Committing and pushing to GitHub…');

  // GIT_ASKPASS: git calls this script when it needs credentials.
  // We echo the token directly — token never appears in the command line
  // or process list, so it is not visible in `ps aux` or shell history.
  const askpass = path.join(REPO_DIR, 'scripts', '.git-askpass.sh');
  fs.writeFileSync(askpass, `#!/bin/sh\necho "${GITHUB_TOKEN}"\n`, { mode: 0o700 });

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME:     '4minit Pipeline',
    GIT_AUTHOR_EMAIL:    'pipeline@4minit.xyz',
    GIT_COMMITTER_NAME:  '4minit Pipeline',
    GIT_COMMITTER_EMAIL: 'pipeline@4minit.xyz',
    GIT_ASKPASS:         askpass,
    GIT_TERMINAL_PROMPT: '0',
  };
  const opts = { cwd: REPO_DIR, stdio: 'inherit', env };

  try {
    // Ensure remote uses plain HTTPS (no token embedded in URL)
    execSync('git remote set-url origin https://github.com/scjtools/4minit.git', opts);

    execSync(`git add newsletters/${dateStr}.html assets/data/newsletters.json sitemap.xml feed.xml index.html newsletters/index.html`, opts);

    // Skip commit if there's nothing staged (e.g. re-running --post on the same day)
    const staged = execSync('git diff --cached --name-only', { cwd: REPO_DIR, env }).toString().trim();
    if (!staged) {
      console.log('⚠ Nothing to commit — skipping push (already published today?)');
      return;
    }

    execSync(`git commit -m "Newsletter ${dateStr}"`, opts);
    execSync('git push origin main', opts);

    console.log('✓ Pushed — Vercel will deploy automatically');
  } finally {
    // Always clean up the askpass script, even if an error occurs mid-push
    if (fs.existsSync(askpass)) fs.unlinkSync(askpass);
  }
}

function stripScriptTags(html) {
  // Brevo API rejects HTML containing <script> tags (returns 403).
  // These tags are only needed for the web version, not email.
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

async function sendViaBrevo(dateStr, htmlContent, subject) {
  if (!BREVO_LIST_ID) throw new Error('BREVO_LIST_ID is not set');

  const testEmail = process.env.BREVO_TEST_EMAIL || null;
  const emailHtml = stripScriptTags(htmlContent);

  console.log('→ Creating Brevo email campaign…');

  const createRes = await brevoReq('POST', '/v3/emailCampaigns', {
    name:       `4minit — ${dateStr}${testEmail ? ' [TEST]' : ''}`,
    subject,
    sender:     { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    type:       'classic',
    htmlContent: emailHtml,
    recipients: { listIds: [BREVO_LIST_ID] },
  });

  if (createRes.status !== 201) {
    throw new Error(`Campaign creation failed: HTTP ${createRes.status}\n${createRes.body}`);
  }

  const { id } = JSON.parse(createRes.body);
  console.log(`  Campaign ID: ${id}`);

  if (testEmail) {
    // Send to test address only — does not touch the subscriber list
    console.log(`→ TEST MODE — sending to ${testEmail} only…`);
    const testRes = await brevoReq('POST', `/v3/emailCampaigns/${id}/sendTest`, {
      emailTo: [testEmail],
    });
    if (testRes.status !== 204) {
      throw new Error(`Test send failed: HTTP ${testRes.status}\n${testRes.body}`);
    }
    console.log(`✓ Test email sent to ${testEmail} (subscribers not notified)`);
  } else {
    console.log('→ Sending now…');
    const sendRes = await brevoReq('POST', `/v3/emailCampaigns/${id}/sendNow`, {});
    if (sendRes.status !== 204) {
      throw new Error(`Send failed: HTTP ${sendRes.status}\n${sendRes.body}`);
    }
    console.log('✓ Newsletter dispatched to subscribers');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2];

  if (mode === '--pre') {
    const date = getMauritiusDate();
    console.log(`\n📰 4minit Pipeline — PRE  (${date.long})\n`);
    await triggerAggregator();
    await waitForAggregator();
    await fetchFeed();
    console.log(`\n✓ Pre-pipeline done. Save newsletter as: newsletters/${date.filename}.html\n`);
    // Print date info for use in subsequent steps
    console.log(`DATE_FILENAME=${date.filename}`);
    console.log(`DATE_DISPLAY=${date.display}`);
    console.log(`DATE_LONG=${date.long}`);

  } else if (mode === '--post') {
    const dateArg = process.argv[3];
    if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
      throw new Error('--post requires a date argument: YYYY-MM-DD');
    }

    const htmlPath = path.join(NEWSLETTERS_DIR, `${dateArg}.html`);
    if (!fs.existsSync(htmlPath)) throw new Error(`Newsletter not found: ${htmlPath}`);

    console.log(`\n📰 4minit Pipeline — POST  (${dateArg})\n`);
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Extract <title> for the email subject line
    const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
    const subject    = titleMatch
      ? titleMatch[1].replace(/\s*[—\-]\s*4minit\s*$/i, '').trim()
      : `4minit — ${dateArg}`;

    runScript('update-newsletters-json.js', dateArg);
    runScript('generate-sitemap.js');
    execSync('python3 scripts/generate-rss-feed.py', { cwd: REPO_DIR, stdio: 'inherit' });
    commitAndPush(dateArg);
    await sendViaBrevo(dateArg, htmlContent, subject);

    console.log('\n🎉 Pipeline complete!\n');

  } else {
    console.error('Usage: node pipeline.js --pre | --post YYYY-MM-DD');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n✗ Pipeline failed:', err.message);
  process.exit(1);
});
