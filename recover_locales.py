import io, json, subprocess

BS = chr(92)  # backslash, avoid literal-escaping pitfalls
s = io.open('dist/assets/translate-k6PYaf3O.js', encoding='utf-8').read()

def extract_obj(text, start_brace):
    depth = 0
    i = start_brace
    quote = None
    esc = False
    while i < len(text):
        c = text[i]
        if quote:
            if esc:
                esc = False
            elif c == BS:
                esc = True
            elif c == quote:
                quote = None
        else:
            if c in '`\'"':
                quote = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return text[start_brace:i+1]
        i += 1
    raise ValueError('unbalanced')

marker = '{home:{there:'
found = []
idx = 0
while True:
    j = s.find(marker, idx)
    if j == -1:
        break
    found.append(extract_obj(s, j))
    idx = j + 1

print('found', len(found), 'locale objects; lengths:', [len(o) for o in found])

def to_json(obj_literal):
    script = 'const o=' + obj_literal + ';process.stdout.write(JSON.stringify(o));'
    out = subprocess.run(['node', '-e', script], capture_output=True, text=True, encoding='utf-8')
    if out.returncode != 0:
        raise RuntimeError(out.stderr[:800])
    return json.loads(out.stdout)

objs = [to_json(o) for o in found]
for o in objs:
    print('lang there=', o['home']['there'], '| top-level keys:', len(o.keys()))

io.open('.recovered_locales.json', 'w', encoding='utf-8').write(json.dumps(objs, ensure_ascii=False))
print('saved .recovered_locales.json')
