# Token Optimization Strategy

**Last Updated:** 2026-04-15  
**Target:** Reduce tokens per newsletter by 23-44K without compromising quality

---

## Overview

Token optimization focuses on **process efficiency**, not quality degradation. The master_prompt.md is fully loaded every time to maintain newsletter standards.

---

## Optimization Areas

### 1. ✅ Fetch URLs AFTER Story Selection

**Process:**
1. Read feed.json
2. Load master_prompt.md (full)
3. Select final ~20 stories (based on feed summaries only)
4. THEN fetch URLs for selected stories only
5. Write newsletter using fresh content + feed summaries

**Token Savings:** 10-20K per newsletter  
**Quality Impact:** None (feed summaries are sufficient for initial selection)

---

### 2. ✅ WebFetch Blocklist

**File:** `webfetch_blocklist.yaml`

Skip fetching from:
- `bbc.com`, `bbc.co.uk` — Authentication required, 0% utilization
- `mega.mu` — Redirect pages only, no article content
- Any URL matching paywall/subscription/login patterns

**Token Savings:** 3-6K per newsletter (skip 10-20 failed attempts)  
**Quality Impact:** None (blocklist sources have 0% utilization)

---

### 3. ✅ Previous Newsletter Headlines Cache

**File:** `previous_newsletter.json`

**Workflow:**
1. After publishing newsletter, extract all story headlines
2. Save to `previous_newsletter.json` with date and story count
3. Next run: Load this file (~1K tokens) for deduplication checks
4. Repeat after each newsletter publication

**Token Savings:** 5-10K per newsletter (1K JSON vs 18K HTML)  
**Quality Impact:** None (deduplication is more efficient, not less thorough)

**Update Process:**
```bash
# Run this after each newsletter is published
python3 scripts/cache_previous_newsletter.py newsletters/2026-04-15.html
```

---

### 4. ✅ Drop Low-Utilization Feed Sources

**Sources to remove:**
- Al Jazeera (0% utilization, 16 items)
- BBC News (0% utilization, 13 items)
- Finance data sources (0% utilization, 4 items)
- Total: 33 items removed

**Feed reduction:** 135 → ~100 items  
**Token Savings:** 5-8K per newsletter  
**Quality Impact:** Positive (less noise, better signal)

---

## Master Prompt — NO OPTIMIZATION

The `master_prompt.md` must be fully loaded every newsletter run. It contains:
- Editorial guidelines and rules
- Tone and style examples
- Self-check criteria
- Known pitfalls and anti-patterns

**Do NOT:**
- Split into subfiles with partial loading
- Skip sections to save tokens
- Reduce guidance scope

**Do:**
- Load fully every time
- Maintain all examples and checklists
- Treat it as a quality investment

---

### 5. ✅ Reuse Fetched Content in Session

**Process:**
- Maintain URL cache dictionary during newsletter writing
- Before fetching a URL, check if already fetched in this session
- If cached, use stored content (don't re-fetch)
- If new, fetch and cache

**Token Savings:** 0.5-1K per newsletter (rarely reuses URLs, but saves when it happens)  
**Quality Impact:** None (identical content)

---

## Total Token Savings

| Area | Savings | Method |
|------|---------|--------|
| Fetch after selection | 10-20K | Process change |
| WebFetch blocklist | 3-6K | Skip known failures |
| Newsletter cache | 5-10K | Load JSON not HTML |
| Feed source reduction | 5-8K | Remove Al Jazeera, BBC |
| Reuse fetched content | 0.5-1K | Session cache |
| **TOTAL** | **23-45K** | |

**Daily impact:** 23-44K tokens saved  
**Monthly impact:** ~690K-1.32M tokens saved  
**Quality impact:** None (all optimizations are efficiency-based, not quality-based)

---

## Implementation Checklist

- [x] Create `webfetch_blocklist.yaml` with blocked domains
- [x] Create `previous_newsletter.json` cache file
- [x] Update `.gitignore` for local-only files
- [ ] Create `scripts/cache_previous_newsletter.py` script
- [ ] Update newsletter writing process to fetch-after-selection
- [ ] Document in README or wiki

---

## Maintenance

Review quarterly:
- Are blocklisted sources still failing consistently?
- Are low-utilization sources still low?
- Are there new high-noise sources to consider dropping?
