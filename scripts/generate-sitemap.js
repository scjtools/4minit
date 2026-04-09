#!/usr/bin/env node
'use strict';

/**
 * generate-sitemap.js
 *
 * Generates sitemap.xml from:
 *   - static pages defined in STATIC_PAGES
 *   - all entries in assets/data/newsletters.json
 *
 * Usage:
 *   node scripts/generate-sitemap.js
 *
 * Writes: sitemap.xml (repo root)
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.dirname(path.resolve(__filename, '..'));
const JSON_PATH   = path.join(ROOT, 'assets', 'data', 'newsletters.json');
const SITEMAP_OUT = path.join(ROOT, 'sitemap.xml');
const BASE_URL    = 'https://4minit.xyz';

// Static pages — path : changefreq : priority
const STATIC_PAGES = [
  { path: '/',             changefreq: 'daily',   priority: '1.0' },
  { path: '/newsletters/', changefreq: 'daily',   priority: '0.9' },
  { path: '/contact/',     changefreq: 'monthly', priority: '0.4' },
  { path: '/privacy/',     changefreq: 'monthly', priority: '0.3' },
  { path: '/terms/',       changefreq: 'monthly', priority: '0.3' },
];

function toW3CDate(dateStr) {
  // dateStr is YYYY-MM-DD
  return `${dateStr}T00:00:00+04:00`;
}

function escapeXml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function main() {
  // Load newsletter entries
  let newsletters = [];
  if (fs.existsSync(JSON_PATH)) {
    try {
      newsletters = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    } catch {
      console.warn('⚠ Could not parse newsletters.json — skipping newsletter URLs');
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const urls = [];

  // Static pages
  for (const page of STATIC_PAGES) {
    urls.push(`  <url>
    <loc>${escapeXml(BASE_URL + page.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
  }

  // Newsletter pages — newest first (array is already newest-first)
  for (const entry of newsletters) {
    urls.push(`  <url>
    <loc>${escapeXml(BASE_URL + entry.url)}</loc>
    <lastmod>${toW3CDate(entry.date)}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.7</priority>
  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  fs.writeFileSync(SITEMAP_OUT, xml, 'utf8');
  console.log(`✓ sitemap.xml generated (${STATIC_PAGES.length} static + ${newsletters.length} newsletter URLs)`);
}

main();
