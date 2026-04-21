/**
 * Uniquifying helpers for the `token_templates` table.
 *
 * `token_templates` carries `UNIQUE(source, name)` — any insert that
 * re-uses an existing `source='user'` name throws SqliteError. The NPC
 * clone wizard, the Token Library "new" and "duplicate" flows all hit
 * that edge the moment a DM creates two items from the same monster
 * template or double-clicks a duplicate button. Rather than bubbling
 * the raw SQL error up to the UI, we pick the next free name here
 * ("Goblin" → "Goblin (2)" → "Goblin (3)"…) and let the caller insert
 * with confidence.
 *
 * The check is best-effort: if the dbQuery fails we fall back to a
 * timestamp-suffixed name so a transient IPC glitch still lets the
 * save succeed with *a* collision-free row.
 */
export async function uniqueUserTemplateName(baseName: string): Promise<string> {
  const base = (baseName ?? '').trim() || 'Neu'
  if (!window.electronAPI) return base
  let taken: Set<string>
  try {
    const rows = await window.electronAPI.dbQuery<{ name: string }>(
      `SELECT name FROM token_templates WHERE source = 'user'`,
    )
    taken = new Set(rows.map((r) => r.name))
  } catch {
    return `${base} (${Date.now().toString(36).slice(-4)})`
  }
  if (!taken.has(base)) return base
  // Cap the loop so a pathological taken-set (thousands of identical
  // names) can't hang the renderer. Falls back to a short timestamp
  // suffix past the cap — extremely unlikely in practice but keeps
  // the API total.
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} (${i})`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} (${Date.now().toString(36).slice(-4)})`
}
