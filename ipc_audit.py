import os, re, json

base = r'C:\Users\pdietric\Documents\GitHub\BoltBerry'

# Extract IPC constants
ipc_path = os.path.join(base, 'src', 'shared', 'ipc-types.ts')
constants = {}
with open(ipc_path, 'r', encoding='utf-8') as f:
    for line in f:
        m = re.match(r"^\s+(\w+):\s*'([^']+)',?\s*$", line)
        if m:
            key, val = m.group(1), m.group(2)
            constants[key] = val

# Extract main handlers
main_matches = []
root = os.path.join(base, 'src', 'main')
for dirpath, dirnames, filenames in os.walk(root):
    for fname in filenames:
        if not fname.endswith('.ts'):
            continue
        path = os.path.join(dirpath, fname)
        with open(path, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                m = re.search(r'ipcMain\.(handle|on)\s*\(\s*(IPC\.\w+|\'[^\']+\')', line)
                if m:
                    typ = m.group(1)
                    ch = m.group(2)
                    if ch.startswith('IPC.'):
                        ch_key = ch[4:]
                        ch_val = constants.get(ch_key, ch)
                    else:
                        ch_val = ch.strip("'")
                        ch_key = None
                        for k, v in constants.items():
                            if v == ch_val:
                                ch_key = k
                                break
                    rel = os.path.relpath(path, base).replace('\\', '/')
                    main_matches.append({'key': ch_key, 'val': ch_val, 'type': typ, 'file': rel, 'line': i})

# Extract preload usage
preload_path = os.path.join(base, 'src', 'preload', 'index.ts')
preload_matches = []
with open(preload_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f, 1):
        for method in ('invoke', 'send', 'on'):
            pattern = r'ipcRenderer\.' + method + r"\(\s*(IPC\.\w+|\'[^\']+\')"
            for m in re.finditer(pattern, line):
                ch = m.group(1)
                if ch.startswith('IPC.'):
                    ch_key = ch[4:]
                    ch_val = constants.get(ch_key, ch)
                else:
                    ch_val = ch.strip("'")
                    ch_key = None
                    for k, v in constants.items():
                        if v == ch_val:
                            ch_key = k
                            break
                preload_matches.append({'key': ch_key, 'val': ch_val, 'method': method, 'line': i})

out = {
    'constants': constants,
    'main': main_matches,
    'preload': preload_matches,
}
out_path = os.path.join(base, 'ipc_audit.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2)
print('done', len(constants), len(main_matches), len(preload_matches))
