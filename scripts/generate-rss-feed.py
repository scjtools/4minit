#!/usr/bin/env python3
"""
Generate RSS 2.0 feed for the latest 3 newsletters.

Usage:
  python scripts/generate-rss-feed.py

Reads:  newsletters/YYYY-MM-DD.html files
Writes: feed.xml
"""

import re
from pathlib import Path
from datetime import datetime
from xml.etree.ElementTree import Element, SubElement, ElementTree
from html import unescape


def parse_newsletter(html_path):
    """Extract title and description from newsletter HTML."""
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract title from <title> tag and strip " — 4minit" suffix
    title_match = re.search(r'<title>([^<]+)<\/title>', content)
    if not title_match:
        return None, None
    title = unescape(title_match.group(1))
    title = re.sub(r'\s*[—\-]\s*4minit\s*$', '', title).strip()

    # Extract description from <meta name="description">
    desc_match = re.search(r'<meta name="description" content="([^"]+)"', content)
    if not desc_match:
        return None, None
    description = unescape(desc_match.group(1))

    return title, description


def get_date_from_filename(filename):
    """Extract date from filename (YYYY-MM-DD.html) and format as RFC-822."""
    date_str = filename.stem  # Remove .html extension
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        # RFC-822 format: Mon, 13 Apr 2026 06:00:00 +0400
        return date_obj.strftime('%a, %d %b %Y 06:00:00 +0400')
    except ValueError:
        return None


def generate_rss_feed():
    """Generate RSS 2.0 feed for latest 3 newsletters."""
    repo_dir = Path(__file__).parent.parent
    newsletters_dir = repo_dir / 'newsletters'

    # Find all newsletter HTML files and sort by date (newest first)
    html_files = sorted(
        newsletters_dir.glob('????-??-??.html'),
        reverse=True
    )

    if not html_files:
        print('✗ No newsletters found')
        return

    # Take latest 3
    latest = html_files[:3]

    # Create RSS root element
    rss = Element('rss', {'version': '2.0'})
    channel = SubElement(rss, 'channel')

    # Channel metadata
    SubElement(channel, 'title').text = '4minit - Mauritius News in 4 Minutes'
    SubElement(channel, 'link').text = 'https://4minit.xyz/'
    SubElement(channel, 'description').text = (
        'A free daily newsletter covering Mauritius news, regional developments, '
        'and the global headlines that matter — in your inbox every morning.'
    )
    SubElement(channel, 'language').text = 'en'

    # Build last build date from most recent newsletter
    most_recent_rfc822 = get_date_from_filename(latest[0])
    if most_recent_rfc822:
        SubElement(channel, 'lastBuildDate').text = most_recent_rfc822

    # Add items (newest first)
    for html_file in latest:
        title, subtitle = parse_newsletter(html_file)
        if not title or not subtitle:
            continue

        date_str = html_file.stem
        link = f'https://4minit.xyz/newsletters/{date_str}'
        rfc822_date = get_date_from_filename(html_file)

        item = SubElement(channel, 'item')
        SubElement(item, 'title').text = title
        SubElement(item, 'description').text = f"Today's 4minit: {subtitle}. Read more."
        SubElement(item, 'link').text = link
        SubElement(item, 'guid').text = link
        if rfc822_date:
            SubElement(item, 'pubDate').text = rfc822_date

    # Pretty-print XML with indentation
    indent_xml(rss)

    # Write to feed.xml
    feed_path = repo_dir / 'feed.xml'
    tree = ElementTree(rss)
    tree.write(feed_path, encoding='utf-8', xml_declaration=True)

    print(f'✓ RSS feed generated → {feed_path}')
    print(f'  Included {len(latest)} latest newsletters')


def indent_xml(elem, level=0):
    """Add indentation to XML elements for pretty-printing."""
    indent_str = '\n' + ('  ' * level)
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent_str + '  '
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent_str
        for child in elem:
            indent_xml(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = indent_str
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent_str


if __name__ == '__main__':
    generate_rss_feed()
