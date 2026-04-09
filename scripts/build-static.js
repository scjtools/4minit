#!/usr/bin/env node
'use strict';

/**
 * build-static.js
 *
 * Injects crawlable static newsletter links directly into the HTML of:
 *   - index.html          (latest 6 issues)
 *   - newsletters/index.html  (all issues)
 *
 * Links are placed between marker comments so they are present in the
 * raw HTML served to crawlers. main.js replaces the grid content with
 * the full card UI for users with JavaScript enabled.
 *
 * Markers in the HTML files:
 *   <!-- STATIC_NEWSLETTERS_START -->
 *   ... generated content ...
 *   <!-- STATIC_NEWSLETTERS_END -->
 *
 * Usage:
 *   node scripts/build-static.js
 *
 * Reads:  assets/data/newsletters.json
 * Writes: index.html, newsletters/index.html
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.dirname(path.resolve(__filename, '..'));
const JSON_PATH    = path.join(ROOT, 'assets', 'data', 'newsletters.json');
const HOME_PAGE    = path.join(ROOT, 'index.html');
const ARCHIVE_PAGE = path.join(ROOT, 'newsletters', 'index.html');

const LATEST_LIMIT   = 6;
const START_MARKER   = '<!-- STATIC_NEWSLETTERS_START -->';
const END_MARKER     = '<!-- STATIC_NEWSLETTERS_END -->';
const INNER_INDENT   = '          '; // 10 spaces — matches indentation inside the grid divs

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', {
    day:      'numeric',
    month:    'short',
    year:     'numeric',
    timeZone: 'UTC',
  });
}

function buildList(entries) {
  if (!entries.length) {
    return `${INNER_INDENT}<p>No newsletters published yet.</p>`;
  }

  const items = entries.map(e => {
    const url   = escapeHtml(e.url);
    const title = escapeHtml(e.title);
    const iso   = escapeHtml(e.date);
    const label = escapeHtml(formatDate(e.date));
    return `${INNER_INDENT}  <li><a href="${url}">${title}</a> &mdash; <time datetime="${iso}">${label}</time></li>`;
  }).join('\n');

  return (
    `${INNER_INDENT}<ul class="static-newsletter-list" aria-label="Newsletter issues">\n` +
    items + '\n' +
    `${INNER_INDENT}</ul>`
  );
}

function inject(filePath, innerHtml) {
  const rel     = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  const startIdx = content.indexOf(START_MARKER);
  const endIdx   = content.indexOf(END_MARKER, startIdx + 1);

  if (startIdx === -1 || endIdx === -1) {
    console.warn(`⚠  Markers not found in ${rel} — skipping`);
    return false;
  }

  const before  = content.slice(0, startIdx + START_MARKER.length);
  const after   = content.slice(endIdx);
  const updated = `${before}\n${innerHtml}\n          ${after}`;

  fs.writeFileSync(filePath, updated, 'utf8');
  return true;
}

function main() {
  let newsletters = [];
  if (fs.existsSync(JSON_PATH)) {
    try {
      newsletters = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    } catch {
      console.warn('⚠  Could not parse newsletters.json');
    }
  }

  const homeCount    = Math.min(newsletters.length, LATEST_LIMIT);
  const homeOk       = inject(HOME_PAGE,    buildList(newsletters.slice(0, LATEST_LIMIT)));
  const archiveOk    = inject(ARCHIVE_PAGE, buildList(newsletters));

  if (homeOk)    console.log(`✓ index.html updated — ${homeCount} static link(s)`);
  if (archiveOk) console.log(`✓ newsletters/index.html updated — ${newsletters.length} static link(s)`);
}

main();
