#!/usr/bin/env node
'use strict';

/**
 * 4minit Newsletter Pipeline
 *
 * Usage:
 *   node pipeline.js --pre              Trigger aggregator → wait → fetch feed.json
 *   node pipeline.js --post DD-MM-YYYY  Update archive → git push → send via Brevo
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

// ─── Config ─────────────────────────────────────────────────────────────────

const GITHUB_TOKEN        = process.env.GITHUB_TOKEN;
const BREVO_API_KEY       = process.env.BREVO_API_KEY;
const BREVO_LIST_ID       = parseInt(process.env.BREVO_LIST_ID || '0', 10);
const BREVO_SENDER_EMAIL  = process.env.BREVO_SENDER_EMAIL || 'news@4minit.xyz';
const BREVO_SENDER_NAME   = process.env.BREVO_SENDER_NAME  || '4minit Daily News';

const AGGREGATOR_OWNER = 'scjtools';
const AGGREGATOR_REPO  = 'mauritius-news-aggregator';

const REPO_DIR        = path.dirname(path.resolve(__filename));
const NEWSLETTERS_DIR = path.join(REPO_DIR, '101 Newsletters');
const FEED_PATH       = path.join(REPO_DIR, '001 Prompts', 'feed.json');

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
    filename: `${d}-${m}-${y}`,
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
  return httpsRequest({
    hostname: 'api.brevo.com',
    path:     p,
    method,
    headers:  {
      'api-key':      BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  }, body);
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

function updateArchive() {
  console.log('→ Regenerating newsletters.html…');

  const files = fs.readdirSync(NEWSLETTERS_DIR)
    .filter(f => /^\d{2}-\d{2}-\d{4}\.html$/.test(f))
    .sort((a, b) => {
      const toDate = f => { const [d,mo,y] = f.replace('.html','').split('-'); return new Date(`${y}-${mo}-${d}`); };
      return toDate(b) - toDate(a);
    });

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const rows = files.map(f => {
    const [dd, mm, yyyy] = f.replace('.html', '').split('-');
    const dt    = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
    const label = `${DAYS[dt.getUTCDay()]}, ${parseInt(dd)} ${MONTHS[dt.getUTCMonth()]} ${yyyy}`;
    return `      <li><a href="/newsletters/${f}"><span>${label}</span><span class="arrow">→</span></a></li>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Archive — 4minit</title>
  <meta name="description" content="Every edition of the 4minit Mauritius Morning Brief, archived.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&family=Merriweather+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --black: #030712; --yellow: #DFD150; --white: #ffffff;
      --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-500: #6B7280;
      --serif: 'Merriweather', Georgia, serif;
      --sans:  'Merriweather Sans', Helvetica, Arial, sans-serif;
      --radius: 6px;
    }
    html, body { height: 100%; font-family: var(--sans); background: var(--white); color: var(--black); -webkit-font-smoothing: antialiased; }
    nav { background: var(--black); display: flex; align-items: center; justify-content: space-between; padding: 0 40px; height: 60px; }
    .nav-logo { font-family: var(--serif); font-size: 22px; font-weight: 900; color: var(--white); letter-spacing: 2px; text-decoration: none; }
    .nav-logo span { color: var(--yellow); }
    nav a.nav-link { font-family: var(--sans); font-size: 13px; font-weight: 500; color: #9CA3AF; text-decoration: none; margin-left: 24px; transition: color .15s; }
    nav a.nav-link:hover { color: var(--yellow); }
    .page-hero { background: var(--black); padding: 48px 40px 52px; text-align: center; }
    .page-hero h1 { font-family: var(--serif); font-size: 30px; font-weight: 900; color: var(--white); margin-bottom: 10px; }
    .page-hero p  { font-family: var(--sans); font-size: 15px; color: #9CA3AF; }
    .container { max-width: 680px; margin: 0 auto; padding: 44px 20px 60px; }
    ul { list-style: none; }
    li { margin-bottom: 10px; }
    li a {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius);
      padding: 16px 20px; font-size: 15px; font-weight: 600; color: var(--black);
      text-decoration: none; transition: border-color .15s, background .15s;
    }
    li a:hover { border-color: var(--yellow); background: #FFFDE7; }
    li a .arrow { font-size: 16px; color: var(--gray-500); flex-shrink: 0; margin-left: 12px; }
    li a:hover .arrow { color: var(--black); }
    .empty { text-align: center; color: var(--gray-500); padding: 60px 0; font-size: 15px; font-family: var(--sans); }
    footer { background: var(--black); height: 52px; display: flex; align-items: center; justify-content: center; gap: 20px; }
    footer a { font-family: var(--sans); font-size: 12px; color: #6B7280; text-decoration: none; transition: color .15s; }
    footer a:hover { color: var(--yellow); }
    footer span { color: #374151; font-size: 12px; }
    @media (max-width: 480px) {
      nav { padding: 0 20px; }
      .page-hero { padding: 36px 20px 40px; }
      .page-hero h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <nav>
    <a class="nav-logo" href="/">4<span>minit</span></a>
    <div><a class="nav-link" href="/">Subscribe</a></div>
  </nav>
  <div class="page-hero">
    <h1>Past Editions</h1>
    <p>Every morning, Mauritius in 4 minutes.</p>
  </div>
  <div class="container">
    ${files.length === 0
      ? '<p class="empty">No newsletters published yet. Check back soon.</p>'
      : `<ul>\n${rows}\n    </ul>`}
  </div>
  <footer>
    <a href="/">4minit.xyz</a>
    <span>·</span>
    <a href="/">Subscribe</a>
  </footer>
</body>
</html>`;

  fs.writeFileSync(path.join(REPO_DIR, 'newsletters.html'), html, 'utf8');
  console.log(`✓ Archive updated (${files.length} newsletter${files.length !== 1 ? 's' : ''})`);
}

function commitAndPush(dateStr) {
  console.log('→ Committing and pushing to GitHub…');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME:     '4minit Pipeline',
    GIT_AUTHOR_EMAIL:    'pipeline@4minit.xyz',
    GIT_COMMITTER_NAME:  '4minit Pipeline',
    GIT_COMMITTER_EMAIL: 'pipeline@4minit.xyz',
  };
  const opts = { cwd: REPO_DIR, stdio: 'inherit', env };

  // Configure remote with token for HTTPS push
  const remote = `https://${GITHUB_TOKEN}@github.com/scjtools/4minit.git`;
  execSync(`git remote set-url origin ${remote}`, opts);

  execSync('git add -A', opts);
  execSync(`git commit -m "Newsletter ${dateStr}"`, opts);
  execSync('git push origin main', opts);
  console.log('✓ Pushed — Vercel will deploy automatically');
}

async function sendViaBrevo(dateStr, htmlContent, subject) {
  if (!BREVO_LIST_ID) throw new Error('BREVO_LIST_ID is not set');
  console.log('→ Creating Brevo email campaign…');

  const createRes = await brevoReq('POST', '/v3/emailCampaigns', {
    name:       `4minit — ${dateStr}`,
    subject,
    sender:     { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    type:       'classic',
    htmlContent,
    recipients: { listIds: [BREVO_LIST_ID] },
  });

  if (createRes.status !== 201) {
    throw new Error(`Campaign creation failed: HTTP ${createRes.status}\n${createRes.body}`);
  }

  const { id } = JSON.parse(createRes.body);
  console.log(`  Campaign ID: ${id}`);

  console.log('→ Sending now…');
  const sendRes = await brevoReq('POST', `/v3/emailCampaigns/${id}/sendNow`, {});
  if (sendRes.status !== 204) {
    throw new Error(`Send failed: HTTP ${sendRes.status}\n${sendRes.body}`);
  }
  console.log('✓ Newsletter dispatched to subscribers');
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
    console.log(`\n✓ Pre-pipeline done. Today's file will be: ${date.filename}.html\n`);
    // Print date info for use in subsequent steps
    console.log(`DATE_FILENAME=${date.filename}`);
    console.log(`DATE_DISPLAY=${date.display}`);
    console.log(`DATE_LONG=${date.long}`);

  } else if (mode === '--post') {
    const dateArg = process.argv[3];
    if (!dateArg) throw new Error('--post requires a date argument: DD-MM-YYYY');

    const htmlPath = path.join(NEWSLETTERS_DIR, `${dateArg}.html`);
    if (!fs.existsSync(htmlPath)) throw new Error(`Newsletter not found: ${htmlPath}`);

    console.log(`\n📰 4minit Pipeline — POST  (${dateArg})\n`);
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Extract <title> for the email subject line
    const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
    const subject    = titleMatch ? titleMatch[1].replace(' — 4minit', '').trim() : `4minit — ${dateArg}`;

    updateArchive();
    commitAndPush(dateArg);
    await sendViaBrevo(dateArg, htmlContent, subject);

    console.log('\n🎉 Pipeline complete!\n');

  } else {
    console.error('Usage: node pipeline.js --pre | --post DD-MM-YYYY');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n✗ Pipeline failed:', err.message);
  process.exit(1);
});
