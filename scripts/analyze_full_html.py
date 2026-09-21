import re

with open('scripts/format_full.html', 'r', encoding='utf-8') as f:
    html = f.read()

app_idx = html.find('<div id="app">')
html_app = html[app_idx:]

# Find top level elements or comments
items = re.findall(r'(<!--.*?-->|<(?:article|section|div|nav|footer)\s+class="([^"]+)"[^>]*>)', html_app, re.DOTALL)

top_classes = [
    'curtain', 'logo-fixed', 'screen', 'nav', 'back-nav', 'strip-view',
    'block-one', 'ground', 'wide', 'tag', 'side', 'screens', 'clock-section',
    'tile', 'bar', 'pill', 'dial', 'side-a', 'tri', 'special', 'seven',
    'deck', 'fan', 'win', 'vee', 'gauge', 'poster', 'field', 'footer', 'splash'
]

print("=== FOUND ELEMENTS IN FORMAT ===")
for text, cls in items:
    if text.startswith('<!--'):
        clean = re.sub(r'\s+', ' ', text).strip()
        if len(clean) > 100: clean = clean[:100] + '...'
        print('COMMENT:', clean)
    else:
        base = cls.split()[0]
        if base in top_classes:
            print('  --> SECTION:', base, '| full class:', cls)
