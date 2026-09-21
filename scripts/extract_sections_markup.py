import re

with open('scripts/format_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

sections = [
    'block-one', 'wide', 'tag', 'side', 'screens', 'clock-section',
    'seven', 'deck', 'fan', 'win', 'vee', 'gauge', 'poster', 'field', 'footer'
]

for s in sections:
    print(f"\n==================== SECTION: {s} ====================")
    # Find tag start
    pattern = rf'(<(?:article|section|div|footer)\s+class="[^"]*\b{s}\b[^"]*"[^>]*>)'
    m = re.search(pattern, text)
    if m:
        start_tag = m.group(1)
        start_pos = m.start()
        # Grab ~800 characters or find end of section
        snippet = text[start_pos:start_pos+1200]
        # Clean up snippet
        lines = snippet.split('\n')
        print('\n'.join(lines[:30]))
    else:
        print("NOT FOUND")
