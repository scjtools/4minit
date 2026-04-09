# SEO Implementation Notes

## What was changed and why

### 1. URL consistency fix (critical)

**Problem:** `newsletters.json` stored `.html`-suffixed URLs (e.g. `/newsletters/2026-04-06.html`) but the newsletter template canonical tags used clean URLs (`/newsletters/2026-04-06`). Vercel's `cleanUrls: true` redirects `.html` → clean, so the canonical was correct — but the sitemap and card links pointed to the redirecting URL, not the canonical one.

**Fix:** `newsletters.json` now stores clean URLs. `update-newsletters-json.js` generates clean URLs for new entries. `main.js` fallback URL generation also uses clean URLs. The sitemap now matches canonicals exactly.

**Files changed:** `assets/data/newsletters.json`, `scripts/update-newsletters-json.js`, `assets/js/main.js`

---

### 2. Crawlable static newsletter links

**Problem:** Both `index.html` (`#editionGrid`) and `newsletters/index.html` (`#archiveGrid`) were populated entirely by JavaScript fetching `newsletters.json`. Search crawlers that don't execute JS (and even those that do may not wait for the fetch) saw no newsletter links in the raw HTML.

**Fix:** Both pages now contain a `<ul class="static-newsletter-list">` with real `<a href>` links to every newsletter issue directly in the server-built HTML. JavaScript still runs on load and replaces the list with the full card grid UI — users see no difference. Crawlers see the links immediately.

The links are placed between marker comments:
```html
<!-- STATIC_NEWSLETTERS_START -->
<ul class="static-newsletter-list" aria-label="Newsletter issues">
  <li><a href="/newsletters/2026-04-06">Title</a> — <time datetime="2026-04-06">6 Apr 2026</time></li>
</ul>
<!-- STATIC_NEWSLETTERS_END -->
```

**How to keep these current:** Run `node scripts/build-static.js` after every new newsletter. This script reads `assets/data/newsletters.json` and re-injects the list between the markers. It is idempotent — safe to run multiple times. Call it from your pipeline after `update-newsletters-json.js`.

**Files changed:** `index.html`, `newsletters/index.html`, `scripts/build-static.js` (new), `assets/css/main.css`

---

### 3. RSS feed

**New file:** `/feed.xml` — RSS 2.0 feed with `atom:link` self-reference.

All newsletter issue pages, the homepage, and the archive page now include:
```html
<link rel="alternate" type="application/rss+xml" title="4minit — Mauritius News in 4 Minutes" href="https://4minit.xyz/feed.xml">
```

**How to keep current:** Run `node scripts/generate-feed.js` after every new newsletter. It reads `newsletters.json` and regenerates `feed.xml`.

`vercel.json` now sets `Content-Type: application/rss+xml` and a 1-hour cache for `feed.xml`.

**Files changed/created:** `feed.xml`, `scripts/generate-feed.js`, `newsletter-template.html`, `index.html`, `newsletters/index.html`, `vercel.json`

---

### 4. Sitemap improvements

**Changes:**
- Newsletter URLs in the sitemap now match canonical URLs (clean, no `.html`)
- `vercel.json` now sets `Content-Type: application/xml` and a 1-hour cache for `sitemap.xml`
- Existing script `scripts/generate-sitemap.js` was already solid; no logic changes needed after the URL fix

**Files changed:** `sitemap.xml` (regenerated), `vercel.json`

---

### 5. Structured data on newsletter issue pages

**Problem:** The newsletter template had `og:type=article` but no JSON-LD. Google needs machine-readable structured data for rich results and Google News consideration.

**Added to `newsletter-template.html`:**

- **`NewsArticle`** — marks each newsletter issue as a news article. Uses `{{NEWSLETTER_TITLE}}`, `{{NEWSLETTER_SUBTITLE}}`, `{{NEWSLETTER_DATE_ISO}}` placeholders, which are already populated by the existing pipeline. `author` and `publisher` are set to the 4minit organization.
- **`BreadcrumbList`** — signals the page hierarchy: Home → Archive → Issue. Helps Google understand site structure and can produce breadcrumb rich results in SERPs.

Also added to the template head: `og:image:alt`, `og:locale`, `twitter:image:alt` (were missing).

**Files changed:** `newsletter-template.html`

---

### 6. Structured data on homepage

**Added:**
- **`WebSite`** schema alongside the existing `NewsMediaOrganization`. The `NewsMediaOrganization` logo field now uses an `ImageObject` (preferred format).

**Files changed:** `index.html`

---

### 7. robots.txt

No changes needed. It already allows all crawlers and declares the sitemap. It remains:
```
User-agent: *
Allow: /

Sitemap: https://4minit.xyz/sitemap.xml
```

---

### 8. Build pipeline integration

**New `package.json` scripts:**
```
npm run build:static   # inject static newsletter links into HTML pages
npm run build:sitemap  # regenerate sitemap.xml
npm run build:feed     # regenerate feed.xml
npm run build          # all three in sequence
```

**Recommended pipeline step after publishing a new newsletter:**
```bash
node scripts/update-newsletters-json.js YYYY-MM-DD
node scripts/build-static.js
node scripts/generate-sitemap.js
node scripts/generate-feed.js
```

Or simply: `npm run build` (after `update-newsletters-json.js`).

---

## Google News readiness: honest assessment

### What is now in place

- `NewsArticle` structured data with `datePublished`, `headline`, `publisher`, `author` on every issue page
- `NewsMediaOrganization` on the homepage
- Canonical URLs consistent with sitemap
- Crawlable links to every issue in raw HTML
- RSS feed autodiscovery
- BreadcrumbList for SERP navigation
- Correct `og:type=article` on issue pages

### Current architectural limitation for Google News

Each issue page is a **multi-story newsletter digest** — one URL containing ~4–6 separate news stories. Google News ideally indexes **individual article pages**: one story, one URL, one headline.

This means:
- The site can be crawled and indexed by Google Search normally
- Google News *may* index the newsletter issues as individual "articles" — this sometimes works for newsletter-format publications
- But **Google News inclusion is not guaranteed** under this architecture; it depends on editorial review and whether Google classifies the digest format as acceptable
- You will not get per-story rich results or per-story Google News cards

### Recommended path to full Google News optimization (future, optional)

If you later want true article-level Google News indexing:

1. **Break each story out into its own page** — e.g. `/newsletters/2026-04-06/mmu-crisis` — each with a single headline, single `NewsArticle` schema, and a standalone body of ~200+ words
2. **Keep the digest page** as an index/summary linking to the individual story pages
3. **Apply for Google News inclusion** via Search Console once article-level URLs exist
4. The newsletter email can still be the source of truth — the pipeline would just need to parse stories into separate files on publish

This is a meaningful architectural change. There is no need to do it now; the current implementation is solid for general SEO and newsletter discoverability.
