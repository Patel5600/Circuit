import re

with open(r'C:\Users\Irshad Patel\.gemini\antigravity\brain\85db9558-6766-4a64-94a0-c640632a595c\.system_generated\steps\5528\content.md', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's extract all main container elements under #app
# Find all comments and element classes
elements = re.findall(r'(<!--.*?-->|<(?:div|article|section|nav|svg|main)\s+class="([^"]+)")', html, re.DOTALL)
for e in elements:
    if e[0].startswith('<!--'):
        comment = e[0].replace('\n', ' ').strip()
        if len(comment) > 120:
            comment = comment[:120] + '...'
        print('COMMENT:', comment)
    else:
        print('ELEMENT:', e[1])
