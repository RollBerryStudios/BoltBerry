import json, os, re

base = r'C:\Users\pdietric\Documents\GitHub\BoltBerry'
with open(os.path.join(base, 'ipc_audit.json'), 'r', encoding='utf-8') as f:
    data = json.load(f)

constants = data['constants']
main_by_val = {}
for m in data['main']:
    main_by_val[m['val']] = m

# Read preload to determine which API section each line belongs to
preload_path = os.path.join(base, 'src', 'preload', 'index.ts')
with open(preload_path, 'r', encoding='utf-8') as f:
    preload_lines = f.readlines()

# Determine if a line is inside dmApi or playerApi
in_dm = False
in_player = False
line_api = {}
for i, line in enumerate(preload_lines, 1):
    stripped = line.strip()
    if stripped.startswith('export const dmApi'):
        in_dm = True
        in_player = False
    elif stripped.startswith('export const playerApi'):
        in_dm = False
        in_player = True
    elif stripped.startswith('// ') and 'compatibility shim' in stripped.lower():
        in_dm = False
        in_player = False
    line_api[i] = 'dm' if in_dm else ('player' if in_player else 'other')

# Build per-channel preload usage summary
preload_usage = {}
for p in data['preload']:
    val = p['val']
    api = line_api.get(p['line'], 'unknown')
    preload_usage.setdefault(val, []).append((p['method'], api))

# Helper to infer direction
def direction_for(val):
    # Player→Main channels
    if val in ('player:request-sync', 'player:window-size'):
        return 'Player→Main'
    # Main→DM channels (no renderer send; main sends to DM)
    if val.startswith('dm:') or val == 'menu:action':
        return 'Main→DM'
    # DM→Player channels (DM sends, main relays to player)
    if val.startswith('player:'):
        return 'DM→Player'
    # Everything else: DM→Main (invoke from DM renderer)
    return 'DM→Main'

# Build rows for all constants (sorted by val)
rows = []
for key, val in sorted(constants.items(), key=lambda x: x[1]):
    # Handler info
    handler = main_by_val.get(val)
    if handler:
        handler_str = f"{handler['file']}:{handler['line']}"
        typ = handler['type']  # handle or on
    else:
        # Some channels are sent from main; look for .send usages in main code
        # We manually know a few from earlier grep results
        if val == 'dm:player-window-closed':
            handler_str = 'src/main/windows.ts:174'
            typ = 'send'
        elif val == 'dm:request-full-sync':
            handler_str = 'src/main/ipc/player-bridge.ts:91'
            typ = 'send'
        elif val == 'dm:player-window-size':
            handler_str = 'src/main/ipc/player-bridge.ts:199'
            typ = 'send'
        elif val == 'menu:action':
            handler_str = 'src/main/menu.ts:42'
            typ = 'send'
        else:
            handler_str = '-'
            typ = '-'

    # Validation/sender-check notes
    notes = []
    if handler and handler['type'] == 'on' and val.startswith('player:') and val not in ('player:request-sync', 'player:window-size'):
        notes.append('sender-checked (isFromDM)')
    if handler and handler['type'] == 'on' and val in ('player:request-sync', 'player:window-size'):
        notes.append('sender-checked (isFromPlayer)')
    # Check if handler uses _event (ignores sender) vs event (uses sender)
    if handler and handler['type'] == 'handle':
        # read a snippet around the line
        path = os.path.join(base, handler['file'])
        try:
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            idx = handler['line'] - 1
            snippet = ''.join(lines[idx:idx+5])
            # Check if it uses BrowserWindow.fromWebContents or event.sender
            if 'event.sender' in snippet or 'BrowserWindow.fromWebContents(event.sender)' in snippet:
                notes.append('uses event.sender')
            else:
                notes.append('no sender check')
        except Exception:
            pass
    # Preload check
    usages = preload_usage.get(val, [])
    dm_methods = [m for m,api in usages if api == 'dm']
    player_methods = [m for m,api in usages if api == 'player']
    if dm_methods or player_methods:
        parts = []
        if dm_methods:
            parts.append(f"dm:{','.join(sorted(set(dm_methods)))}")
        if player_methods:
            parts.append(f"player:{','.join(sorted(set(player_methods)))}")
        notes.append('preload ' + '; '.join(parts))
    note_str = ' | '.join(notes) if notes else ''
    rows.append((val, direction_for(val), handler_str, typ, note_str))

# Output markdown
md = "| Channel | Direction | Handler file:line | Type | Notes |\n"
md += "|---|---|---|---|---|\n"
for val, direction, handler, typ, notes in rows:
    md += f"| `{val}` | {direction} | {handler} | {typ} | {notes} |\n"

out_path = os.path.join(base, 'ipc_table.md')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(md)
print('written', out_path)
