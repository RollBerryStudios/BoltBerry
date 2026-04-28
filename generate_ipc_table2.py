import json, os, re

base = r'C:\Users\pdietric\Documents\GitHub\BoltBerry'
with open(os.path.join(base, 'ipc_audit.json'), 'r', encoding='utf-8') as f:
    data = json.load(f)

constants = data['constants']

# multiline regex for ipcMain.handle/on anywhere in main
main_matches = {}
root = os.path.join(base, 'src', 'main')
for dirpath, dirnames, filenames in os.walk(root):
    for fname in filenames:
        if not fname.endswith('.ts'):
            continue
        path = os.path.join(dirpath, fname)
        rel = os.path.relpath(path, base).replace('\\', '/')
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
        # find all ipcMain.handle/on calls and the following IPC ref literal string
        pattern = re.compile(
            r'ipcMain\.(handle|on)\s*\(\s*([^,)\s]+)',
            re.MULTILINE
        )
        for m in pattern.finditer(text):
            typ = m.group(1)
            ch = m.group(2).strip()
            # map IPC.X to value
            if ch.startswith('IPC.'):
                val = constants.get(ch[4:], ch)
            else:
                # try reverse lookup
                val = ch.strip("'\"")
            line = text[:m.start()].count('\n') + 1
            main_matches.setdefault(val, []).append({'file': rel, 'line': line, 'type': typ})

# Preload usage
preload_path = os.path.join(base, 'src', 'preload', 'index.ts')
with open(preload_path, 'r', encoding='utf-8') as f:
    preload_text = f.read()

preload_usage = {}
for method in ('invoke', 'send', 'on'):
    pattern = re.compile(
        r'ipcRenderer\.' + method + r'\(\s*([^,)\s]+)',
        re.MULTILINE
    )
    for m in pattern.finditer(preload_text):
        ch = m.group(1).strip()
        if ch.startswith('IPC.'):
            val = constants.get(ch[4:], ch)
        else:
            val = ch.strip("'\"")
        line = preload_text[:m.start()].count('\n') + 1
        preload_usage.setdefault(val, []).append((method, line))

# Determine sections in preload (dmApi / playerApi)
# Find line numbers of dmApi and playerApi
lines = preload_text.splitlines()
in_dm = False
in_player = False
line_api = {}
for i, line in enumerate(lines, 1):
    if 'export const dmApi' in line:
        in_dm = True
        in_player = False
    elif 'export const playerApi' in line:
        in_dm = False
        in_player = True
    line_api[i] = 'dm' if in_dm else ('player' if in_player else 'other')

# Update preload usage with api section
preload_usage_clean = {}
for val, methods in preload_usage.items():
    cleaned = []
    for method, line in methods:
        api = line_api.get(line, 'unknown')
        cleaned.append((method, api))
    preload_usage_clean[val] = cleaned

# Manual main-side send sources not captured by handle/on
extra_main = {
    'dm:player-window-closed': [{'file':'src/main/windows.ts','line':174,'type':'send'}],
    'dm:request-full-sync': [{'file':'src/main/ipc/player-bridge.ts','line':91,'type':'send'}],
    'dm:player-window-size': [{'file':'src/main/ipc/player-bridge.ts','line':199,'type':'send'}],
    'menu:action': [{'file':'src/main/menu.ts','line':42,'type':'send'}],
}
for val, items in extra_main.items():
    main_matches.setdefault(val, []).extend(items)

# Direction inference
def direction(val):
    if val in ('player:request-sync', 'player:window-size'):
        return 'Player→Main'
    if val.startswith('dm:') or val == 'menu:action':
        return 'Main→DM'
    if val.startswith('player:'):
        return 'DM→Player'
    return 'DM→Main'

# Build table
md = "| Channel | Direction | Handler file:line | Type | Notes |\n"
md += "|---|---|---|---|---|\n"

for key, val in sorted(constants.items(), key=lambda x: x[1]):
    handlers = main_matches.get(val, [])
    if not handlers:
        handler_str = '-'
        typ = '-'
    else:
        # Pick first for brevity
        h = handlers[0]
        handler_str = f"{h['file']}:{h['line']}"
        typ = h['type']
    notes = []
    # Sender checks for player-bridge on handlers
    if typ == 'on' and val.startswith('player:'):
        if val in ('player:request-sync', 'player:window-size'):
            notes.append('sender-checked (isFromPlayer)')
        else:
            notes.append('sender-checked (isFromDM)')
    # Check ipcRenderer usage
    usages = preload_usage_clean.get(val, [])
    dm_methods = sorted(set(m for m, api in usages if api == 'dm'))
    player_methods = sorted(set(m for m, api in usages if api == 'player'))
    if dm_methods:
        notes.append(f"preload dm:{','.join(dm_methods)}")
    if player_methods:
        notes.append(f"preload player:{','.join(player_methods)}")
    # Validation note: if no handler exists -> unvalidated
    if not handlers:
        notes.append('⚠️ NO MAIN HANDLER')
    else:
        # Check for validation in handler snippet quick-and-dirty
        # Read file around line
        path = os.path.join(base, h['file'])
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                content_lines = f.readlines()
            idx = h['line'] - 1
            snippet = ''.join(content_lines[idx:idx+6])
            # Heuristic: if handler uses _event and no event.sender check -> no validation unless input validators
            if typ == 'handle':
                if 'event.sender' in snippet or 'BrowserWindow.fromWebContents' in snippet:
                    notes.append('sender-aware')
                else:
                    notes.append('no sender check')
    note_str = ' | '.join(notes)
    md += f"| `{val}` | {direction(val)} | {handler_str} | {typ} | {note_str} |\n"

out = os.path.join(base, 'ipc_table.md')
with open(out, 'w', encoding='utf-8') as f:
    f.write(md)
print('done')
