import re

with open(r'C:\Users\Irshad Patel\.gemini\antigravity\brain\85db9558-6766-4a64-94a0-c640632a595c\.system_generated\steps\5547\content.md', 'r', encoding='utf-8') as f:
    css = f.read()

# Let's extract all CSS rules matching key sections
sections = ['ground', 'clock-section', 'seven', 'deck', 'tile', 'bar', 'pill', 'dial', 'side-a', 'tri', 'special', 'fan', 'win', 'vee', 'gauge', 'poster', 'field', 'footer']

with open('scripts/format_sections.css', 'w', encoding='utf-8') as out:
    # Regex to extract each rule
    matches = re.finditer(r'([^{]+)\{([^}]+)\}', css)
    for m in matches:
        sel = m.group(1).strip()
        body = m.group(2).strip()
        for s in sections:
            # Check if selector contains the section class
            if re.search(r'\b\.' + s + r'\b', sel):
                out.write(f'{sel} {{\n  {body}\n}}\n\n')
                break

print("Extracted sections CSS to scripts/format_sections.css")
