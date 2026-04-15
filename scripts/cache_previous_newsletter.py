#!/usr/bin/env python3
"""
Cache previous newsletter headlines for deduplication.

Extracts story headlines from a published newsletter HTML and saves them
to previous_newsletter.json for use in the next newsletter run.

Usage:
  python scripts/cache_previous_newsletter.py newsletters/2026-04-15.html

Run this script after publishing each newsletter to update the cache.
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

def extract_headlines(html_path):
    """Extract story headlines from newsletter HTML."""
    with open(html_path) as f:
        html = f.read()

    # Extract all <b>...</b> content (headlines)
    headlines = re.findall(r'<b>([^<]+)</b>', html)

    # Filter: keep only actual story headlines
    # (> 15 chars, not metadata like "Good morning!", not prices like "$98.10")
    story_headlines = [
        h.strip() for h in headlines
        if len(h.strip()) > 15 and not h.strip().startswith('$')
    ]

    return story_headlines

def extract_date_from_path(html_path):
    """Extract date from filename like newsletters/2026-04-15.html"""
    match = re.search(r'(\d{4}-\d{2}-\d{2})', html_path)
    return match.group(1) if match else None

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/cache_previous_newsletter.py newsletters/2026-04-15.html")
        sys.exit(1)

    html_path = sys.argv[1]

    # Verify file exists
    if not Path(html_path).exists():
        print(f"❌ File not found: {html_path}")
        sys.exit(1)

    # Extract headlines
    headlines = extract_headlines(html_path)
    date = extract_date_from_path(html_path)

    if not headlines:
        print(f"⚠️  No headlines found in {html_path}")
        sys.exit(1)

    # Create cache object
    cache = {
        "date": date or "unknown",
        "total_stories": len(headlines),
        "headlines": headlines,
        "cached_at": datetime.now().isoformat(),
        "note": "Use this for deduplication when writing the next newsletter"
    }

    # Write cache file
    output_path = Path("previous_newsletter.json")
    with output_path.open("w") as f:
        json.dump(cache, f, indent=2)

    print(f"✅ Cached {len(headlines)} headlines from {date or html_path}")
    print(f"✅ Written to {output_path}")
    print(f"\nFirst 3 headlines:")
    for h in headlines[:3]:
        print(f"  • {h[:70]}{'...' if len(h) > 70 else ''}")

if __name__ == "__main__":
    main()
