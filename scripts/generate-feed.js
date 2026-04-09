#!/usr/bin/env node
'use strict';

/**
 * generate-feed.js
 *
 * Generates /feed.xml (RSS 2.0) from assets/data/newsletters.json.
 * Includes an atom:link self-reference for RSS reader compatibility.
 *
 * Usage:
 *   node scripts/generate-feed.js
 *
 * Reads:  assets/data/newsletters.json
 * Writes: feed.xml (repo root)
 */

const fs   = require('fs');
const path = require('path');

const ROOT      = path.dirname(path.resolve(__filename, '..'));
const JSON_PATH = path.join(ROOT, 'assets', 'data', 'newsletters.json');
const FEED_OUT  = path.join(ROOT, 'feed.xml');
const BASE_URL  = 'https://4minit.xyz';

function escapeXml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function toRFC822(dateStr) {
  // dateStr: YYYY-MM-DD — publish at 04:00 UTC (= midnight Mauritius UTC+4)
  return new Date(dateStr + 'T04:00:00Z').toUTCString();
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

  const lastBuildDate = newsletters.length
    ? toRFC822(newsletters[0].date)
    : new Date().toUTCString();

  const items = newsletters.map(entry => {
    const url = BASE_URL + entry.url; // already clean URL, no .html
    return `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(entry.summary)}</description>
      <pubDate>${toRFC822(entry.date)}</pubDate>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>4minit — Mauritius News in 4 Minutes</title>
    <link>${BASE_URL}/</link>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>A free daily newsletter covering Mauritius news, regional developments, and the global headlines that matter.</description>
    <language>en-gb</language>
    <copyright>© 4minit</copyright>
    <managingEditor>4minit.mu@gmail.com (4minit)</managingEditor>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <ttl>1440</ttl>
    <image>
      <url>${BASE_URL}/assets/img/og-banner.webp</url>
      <title>4minit</title>
      <link>${BASE_URL}/</link>
    </image>
${items}
  </channel>
</rss>
`;

  fs.writeFileSync(FEED_OUT, xml, 'utf8');
  console.log(`✓ feed.xml generated (${newsletters.length} item(s))`);
}

main();
