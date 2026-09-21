import re

with open('scripts/format_full.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Find <div id="app"> and the top-level tags
app_start = text.find('<div id="app">') + 14
app_end = text.rfind('</div>')
app_html = text[app_start:app_end]

# Extract tags that are at the top level of #app
# We can track depth
pos = 0
depth = 0
tag_regex = re.compile(r'<!--.*?-->|<(/?[a-zA-Z0-9]+)([^>]*)>', re.DOTALL)

for match in tag_regex.finditer(app_html):
    full = match.group(0)
    if full.startswith('<!--'):
        continue
    tag = match.group(1)
    attrs = match.group(2)
    
    if tag.startswith('/'):
        depth -= 1
    elif full.endswith('/>') or tag.lower() in ['img', 'br', 'hr', 'input', 'meta', 'link']:
        if depth == 0:
            cls = re.search(r'class="([^"]+)"', attrs)
            print(f"SELF-CLOSING: <{tag}> class={cls.group(1) if cls else 'none'}")
    else:
        if depth == 0:
            cls = re.search(r'class="([^"]+)"', attrs)
            print(f"TOP ELEMENT: <{tag}> class={cls.group(1) if cls else 'none'}")
        depth += 1
