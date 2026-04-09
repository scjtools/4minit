#!/usr/bin/env node
'use strict';

/**
 * update-newsletters-json.js
 *
 * Extracts title + summary from a newsletter HTML file and prepends
 * the entry to assets/data/newsletters.json.
 *
 * Usage:
 *   node scripts/update-newsletters-json.js YYYY-MM-DD
 *
 * Reads:  newsletters/YYYY-MM-DD.html
 * Writes: assets/data/newsletters.json
 */

const fs   = require('fs');
const path = require('path');

const ROOT            = path.dirname(path.resolve(__filename, '..'));
const NEWSLETTERS_DIR = path.join(ROOT, 'newsletters');
const JSON_PATH       = path.join(ROOT, 'assets', 'data', 'newsletters.json');

function main() {
  const dateArg = process.argv[2];
  if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error('Usage: node scripts/update-newsletters-json.js YYYY-MM-DD');
    process.exit(1);
  }

  const htmlPath = path.join(NEWSLETTERS_DIR, `${dateArg}.html`);
  if (!fs.existsSync(htmlPath)) {
    console.error(`✗ Newsletter not found: ${htmlPath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract title — strip " - 4minit" or " — 4minit" suffix
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) {
    console.error('✗ Could not find <title> in newsletter HTML');
    process.exit(1);
  }
  const title = titleMatch[1]
    .replace(/\s*[—\-]\s*4minit\s*$/i, '')
    .trim();

  // Extract summary from the preheader div (text before the &#160; padding)
  const preheaderMatch = html.match(
    /<div[^>]*display:none[^>]*>\s*([\s\S]*?)(?:&#160;|&nbsp;|\u00a0)/i
  );
  if (!preheaderMatch) {
    console.error('✗ Could not find preheader summary in newsletter HTML');
    process.exit(1);
  }
  const summary = preheaderMatch[1].trim();

  // Read existing JSON
  let entries = [];
  if (fs.existsSync(JSON_PATH)) {
    try {
      entries = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    } catch {
      console.warn('⚠ newsletters.json unreadable — starting fresh');
    }
  }

  // Remove any existing entry for this date (idempotent re-runs)
  entries = entries.filter(e => e.date !== dateArg);

  // Prepend new entry
  entries.unshift({
    title,
    date:    dateArg,
    summary,
    url:     `/newsletters/${dateArg}`,
  });

  fs.writeFileSync(JSON_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  console.log(`✓ newsletters.json updated — "${title}" (${dateArg})`);
}

main();
