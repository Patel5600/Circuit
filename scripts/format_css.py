import re

with open('scripts/format_site.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Let's clean and format css into nicely formatted rules
# Split by closing brace
rules = []
current = []
in_brace = 0
in_media = False

# Simple css formatter
formatted = []
i = 0
while i < len(css):
    c = css[i]
    if c == '{':
        formatted.append(' {\n  ')
    elif c == '}':
        formatted.append('\n}\n\n')
    elif c == ';':
        formatted.append(';\n  ')
    else:
        formatted.append(c)
    i += 1

formatted_css = ''.join(formatted)
with open('scripts/format_site_formatted.css', 'w', encoding='utf-8') as f:
    f.write(formatted_css)

print("Wrote scripts/format_site_formatted.css, length:", len(formatted_css))
