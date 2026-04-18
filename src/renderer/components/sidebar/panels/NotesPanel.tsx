import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react'
import { useCampaignStore } from '../../../stores/campaignStore'

/* Notes panel — each category is now a folder of multiple notes.

   Layout per category:
     ┌── narrow list column ──┬── editor column ──┐
     │ Note title 1  (active) │ < editor body >   │
     │ Note title 2           │                   │
     │ + New note             │                   │
     └────────────────────────┴───────────────────┘
   Categories (tabs) and the Campaign/Map split stay the same; only the
   per-category content is now a list + editor instead of a single doc. */

// ── Simple inline markdown renderer (no external deps) ────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2]) parts.push(<strong key={m.index}>{m[2]}</strong>)
    else if (m[3]) parts.push(<em key={m.index}>{m[3]}</em>)
    else if (m[4]) parts.push(<code key={m.index} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '0 4px', fontSize: '0.9em' }}>{m[4]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const MarkdownPreview = memo(function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} style={{ margin: '8px 0 4px', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--accent-light)' }}>{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} style={{ margin: '10px 0 4px', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      nodes.push(<h1 key={i} style={{ margin: '12px 0 6px', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)' }}>{renderInline(line.slice(2))}</h1>)
    } else if (line.startsWith('---') && line.replace(/-/g, '').trim() === '') {
      nodes.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />)
    } else if (line.match(/^[-*] /)) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 6, paddingLeft: 8, marginBottom: 2 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (line === '') {
      nodes.push(<div key={i} style={{ height: 8 }} />)
    } else {
      nodes.push(<p key={i} style={{ margin: '0 0 4px', lineHeight: 1.6 }}>{renderInline(line)}</p>)
    }
    i++
  }

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      color: 'var(--text-primary)',
      fontSize: 'var(--text-sm)',
      padding: 'var(--sp-3)',
      lineHeight: 1.6,
    }}>
      {nodes}
    </div>
  )
})

// ── Campaign note categories ──────────────────────────────────────────────────

const CAMPAIGN_CATEGORIES = [
  { id: 'Allgemein',   icon: '📜' },
  { id: 'NSCs',        icon: '🧑' },
  { id: 'Orte',        icon: '🗺️' },
  { id: 'Quests',      icon: '⚔️' },
  { id: 'Gegenstände', icon: '🎒' },
  { id: 'Sonstiges',   icon: '📌' },
]

// Sentinel used as the category key for map-scoped notes — keeps the same
// DB category ('Allgemein') but a separate in-memory bucket from the
// campaign-level Allgemein folder.
const MAP_BUCKET = '__map__'

interface NoteRow {
  id: number
  title: string
  content: string
  updated_at: string
  tags: string[]
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : []
  } catch {
    return []
  }
}

// ─── NotesPanel ──────────────────────────────────────────────────────────────────

export function NotesPanel() {
  const { activeCampaignId, activeMapId } = useCampaignStore()

  const [activeTab, setActiveTab] = useState<'campaign' | 'map'>('campaign')
  const [activeCategory, setActiveCategory] = useState('Allgemein')

  // notes by bucket key. Campaign buckets use the category name, map uses MAP_BUCKET.
  const [notesByBucket, setNotesByBucket] = useState<Record<string, NoteRow[]>>({})
  // selected note id per bucket; null means "no selection" (shows empty hint).
  const [selectedByBucket, setSelectedByBucket] = useState<Record<string, number | null>>({})

  const [preview, setPreview] = useState(false)
  // Cross-bucket search — when non-empty, replaces the list column with a
  // result list spanning every category and the map notes.
  const [searchQuery, setSearchQuery] = useState('')

  // Active bucket key derives from tab+category. When tab is map, the bucket
  // is MAP_BUCKET regardless of category selection.
  const activeBucket = activeTab === 'campaign' ? activeCategory : MAP_BUCKET
  const notes = notesByBucket[activeBucket] ?? []
  const selectedId = selectedByBucket[activeBucket] ?? null
  const selectedNote = notes.find((n) => n.id === selectedId) ?? null

  // Keep refs for the flush-on-switch path so we commit the currently-edited
  // note before the UI swaps to a different tab / category / note.
  const notesRef = useRef(notesByBucket)
  useEffect(() => { notesRef.current = notesByBucket }, [notesByBucket])
  const activeBucketRef = useRef(activeBucket)
  useEffect(() => { activeBucketRef.current = activeBucket }, [activeBucket])
  const selectedIdRef = useRef(selectedId)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // Load all notes for the campaign (+ active map) whenever either changes.
  useEffect(() => {
    if (!activeCampaignId) return
    void loadAllNotes(activeCampaignId, activeMapId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaignId, activeMapId])

  async function loadAllNotes(campaignId: number, mapId: number | null) {
    if (!window.electronAPI) return
    try {
      const campaignRows = await window.electronAPI.dbQuery<{
        id: number; category: string; title: string; content: string
        updated_at: string; tags: string | null
      }>(
        `SELECT id, category, title, content, updated_at, tags
         FROM notes
         WHERE campaign_id = ? AND map_id IS NULL AND pin_x IS NULL AND pin_y IS NULL
         ORDER BY updated_at DESC`,
        [campaignId],
      )
      const buckets: Record<string, NoteRow[]> = {}
      for (const cat of CAMPAIGN_CATEGORIES) buckets[cat.id] = []
      for (const row of campaignRows) {
        const { category, tags, ...rest } = row
        if (!buckets[category]) buckets[category] = []
        buckets[category].push({ ...rest, tags: parseTags(tags) })
      }

      if (mapId) {
        const mapRows = await window.electronAPI.dbQuery<{
          id: number; title: string; content: string
          updated_at: string; tags: string | null
        }>(
          `SELECT id, title, content, updated_at, tags
           FROM notes
           WHERE campaign_id = ? AND map_id = ? AND pin_x IS NULL AND pin_y IS NULL
           ORDER BY updated_at DESC`,
          [campaignId, mapId],
        )
        buckets[MAP_BUCKET] = mapRows.map(({ tags, ...r }) => ({ ...r, tags: parseTags(tags) }))
      } else {
        buckets[MAP_BUCKET] = []
      }

      setNotesByBucket(buckets)
      // Default-select the first note per bucket (keep nulls where empty).
      const nextSelected: Record<string, number | null> = {}
      for (const key of Object.keys(buckets)) {
        nextSelected[key] = buckets[key][0]?.id ?? null
      }
      setSelectedByBucket(nextSelected)
    } catch (err) {
      console.error('[NotesPanel] loadAllNotes failed:', err)
    }
  }

  // Persist an edit. INSERT or UPDATE depending on whether the note has an id.
  // The in-memory state is updated alongside the DB so switching categories
  // doesn't drop the edit.
  const saveNote = useCallback(async (
    bucket: string,
    noteId: number,
    patch: { title?: string; content?: string; tags?: string[] },
  ) => {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      const fields: string[] = []
      const params: unknown[] = []
      if (patch.title !== undefined) { fields.push('title = ?'); params.push(patch.title) }
      if (patch.content !== undefined) { fields.push('content = ?'); params.push(patch.content) }
      if (patch.tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(patch.tags)) }
      if (fields.length === 0) return
      fields.push(`updated_at = datetime('now')`)
      params.push(noteId)
      await window.electronAPI.dbRun(
        `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`,
        params,
      )
      setNotesByBucket((prev) => ({
        ...prev,
        [bucket]: (prev[bucket] ?? []).map((n) =>
          n.id === noteId
            ? { ...n, ...patch, updated_at: new Date().toISOString() }
            : n,
        ),
      }))
    } catch (err) {
      console.error('[NotesPanel] saveNote failed:', err)
    }
  }, [activeCampaignId])

  async function createNote(bucket: string) {
    if (!window.electronAPI || !activeCampaignId) return
    const category = bucket === MAP_BUCKET ? 'Allgemein' : bucket
    const mapId = bucket === MAP_BUCKET ? activeMapId : null
    try {
      const result = await window.electronAPI.dbRun(
        `INSERT INTO notes (campaign_id, map_id, category, title, content, updated_at)
         VALUES (?, ?, ?, ?, '', datetime('now'))`,
        [activeCampaignId, mapId, category, 'Neue Notiz'],
      )
      const id = result.lastInsertRowid
      const newRow: NoteRow = { id, title: 'Neue Notiz', content: '', updated_at: new Date().toISOString(), tags: [] }
      setNotesByBucket((prev) => ({ ...prev, [bucket]: [newRow, ...(prev[bucket] ?? [])] }))
      setSelectedByBucket((prev) => ({ ...prev, [bucket]: id }))
    } catch (err) {
      console.error('[NotesPanel] createNote failed:', err)
    }
  }

  async function deleteNote(bucket: string, noteId: number) {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.dbRun('DELETE FROM notes WHERE id = ?', [noteId])
      setNotesByBucket((prev) => {
        const next = (prev[bucket] ?? []).filter((n) => n.id !== noteId)
        return { ...prev, [bucket]: next }
      })
      setSelectedByBucket((prev) => {
        if (prev[bucket] !== noteId) return prev
        const remaining = (notesByBucket[bucket] ?? []).filter((n) => n.id !== noteId)
        return { ...prev, [bucket]: remaining[0]?.id ?? null }
      })
    } catch (err) {
      console.error('[NotesPanel] deleteNote failed:', err)
    }
  }

  function setActiveNoteLocal(bucket: string, patch: { title?: string; content?: string; tags?: string[] }) {
    setNotesByBucket((prev) => ({
      ...prev,
      [bucket]: (prev[bucket] ?? []).map((n) =>
        n.id === selectedIdRef.current ? { ...n, ...patch } : n,
      ),
    }))
  }

  function handleTabSwitch(tab: 'campaign' | 'map') {
    if (tab === activeTab) return
    setActiveTab(tab)
  }

  function handleCategorySwitch(cat: string) {
    if (cat === activeCategory) return
    setActiveCategory(cat)
  }

  const disabled = activeTab === 'map' && !activeMapId
  const trimmedQuery = searchQuery.trim().toLowerCase()
  const isSearching = trimmedQuery.length > 0

  // Cross-bucket search: scan title + content + tags in every bucket.
  // Returns a flat list with the bucket the match came from, so a hit
  // can deep-link into its category tab.
  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const hits: Array<{ bucket: string; note: NoteRow; snippet: string }> = []
    for (const [bucket, notes] of Object.entries(notesByBucket)) {
      for (const n of notes) {
        const hay = `${n.title}\n${n.content}\n${n.tags.join(' ')}`.toLowerCase()
        const idx = hay.indexOf(trimmedQuery)
        if (idx === -1) continue
        const source = `${n.title} · ${n.content}`
        const cleanIdx = source.toLowerCase().indexOf(trimmedQuery)
        const start = Math.max(0, cleanIdx - 20)
        const end = Math.min(source.length, cleanIdx + trimmedQuery.length + 60)
        const snippet = (start > 0 ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '')
        hits.push({ bucket, note: n, snippet })
      }
    }
    return hits.slice(0, 100)
  }, [isSearching, trimmedQuery, notesByBucket])

  function jumpToHit(bucket: string, noteId: number) {
    setSearchQuery('')
    if (bucket === MAP_BUCKET) {
      setActiveTab('map')
    } else {
      setActiveTab('campaign')
      setActiveCategory(bucket)
    }
    setSelectedByBucket((prev) => ({ ...prev, [bucket]: noteId }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Search bar ───────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Alle Notizen durchsuchen…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'inherit',
          }}
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 12, padding: '0 4px',
            }}
            title="Suche schließen"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Top tab bar: Campaign / Map ─────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        alignItems: 'center',
      }}>
        {(activeMapId ? (['campaign', 'map'] as const) : (['campaign'] as const)).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabSwitch(tab)}
            style={{
              flex: 1,
              padding: 'var(--sp-2)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
            }}
          >
            {tab === 'campaign' ? '📜 Kampagne' : '🗺️ Karte'}
          </button>
        ))}
        <button
          onClick={() => setPreview((v) => !v)}
          title={preview ? 'Bearbeiten' : 'Vorschau'}
          style={{
            padding: '4px 8px', marginRight: 4,
            background: preview ? 'var(--accent-blue-dim)' : 'none',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
            color: preview ? 'var(--accent-blue-light)' : 'var(--text-muted)',
            cursor: 'pointer', fontSize: 10,
          }}
        >
          {preview ? '✏️' : '👁'}
        </button>
      </div>

      {/* ── Category tabs (campaign tab only) ──────────────────────────── */}
      {activeTab === 'campaign' && (
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {CAMPAIGN_CATEGORIES.map((cat) => {
            const count = notesByBucket[cat.id]?.length ?? 0
            return (
              <button
                key={cat.id}
                onClick={() => handleCategorySwitch(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeCategory === cat.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: activeCategory === cat.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: activeCategory === cat.id ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title={cat.id}
              >
                <span>{cat.icon}</span>
                <span>{cat.id}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    minWidth: 16, textAlign: 'center',
                    padding: '1px 4px',
                    background: activeCategory === cat.id ? 'var(--accent)' : 'var(--bg-overlay)',
                    color: activeCategory === cat.id ? 'var(--text-inverse)' : 'var(--text-muted)',
                    borderRadius: 8,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Search results (replaces list + editor while searching) ─── */}
      {isSearching && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {searchResults.length === 0 ? (
            <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Keine Treffer für „{searchQuery}"
            </div>
          ) : (
            searchResults.map((hit) => {
              const cat = CAMPAIGN_CATEGORIES.find((c) => c.id === hit.bucket)
              const label = cat ? `${cat.icon} ${cat.id}` : '🗺️ Karte'
              return (
                <button
                  key={`${hit.bucket}-${hit.note.id}`}
                  type="button"
                  onClick={() => jumpToHit(hit.bucket, hit.note.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {hit.note.title || 'Ohne Titel'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {hit.snippet}
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* ── Main body: list + editor ─────────────────────────────────── */}
      {!isSearching && <div style={{ flex: 1, display: 'flex', minHeight: 0, opacity: disabled ? 0.5 : 1 }}>
        {!disabled && (
          <NoteList
            notes={notes}
            selectedId={selectedId}
            onSelect={(id) => setSelectedByBucket((prev) => ({ ...prev, [activeBucket]: id }))}
            onCreate={() => createNote(activeBucket)}
            onDelete={(id) => deleteNote(activeBucket, id)}
          />
        )}

        <div style={{ flex: 1, padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {disabled ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              Keine Karte ausgewählt
            </div>
          ) : !selectedNote ? (
            <EmptyEditor
              onCreate={() => createNote(activeBucket)}
              category={activeTab === 'campaign' ? activeCategory : 'Karte'}
            />
          ) : (
            <>
              <input
                value={selectedNote.title}
                onChange={(e) => setActiveNoteLocal(activeBucket, { title: e.target.value })}
                onBlur={() => saveNote(activeBucket, selectedNote.id, { title: selectedNote.title })}
                placeholder="Titel"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  padding: '8px 10px',
                  outline: 'none',
                  marginBottom: 'var(--sp-2)',
                }}
              />
              <TagsEditor
                tags={selectedNote.tags}
                onChange={(next) => {
                  setActiveNoteLocal(activeBucket, { tags: next })
                  saveNote(activeBucket, selectedNote.id, { tags: next })
                }}
              />
              {preview ? (
                <MarkdownPreview text={selectedNote.content} />
              ) : (
                <textarea
                  value={selectedNote.content}
                  onChange={(e) => setActiveNoteLocal(activeBucket, { content: e.target.value })}
                  onBlur={() => saveNote(activeBucket, selectedNote.id, { content: selectedNote.content })}
                  placeholder={`${CAMPAIGN_CATEGORIES.find(c => c.id === activeCategory)?.icon ?? ''} ${activeCategory}-Notiz…\n\n# Überschrift\n**Fett** *Kursiv* \`Code\`\n- Aufzählung`}
                  style={{
                    flex: 1,
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 'var(--text-sm)',
                    padding: 'var(--sp-3)',
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.6,
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>}
    </div>
  )
}

// ─── Note list (left column) ─────────────────────────────────────────────────

function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: {
  notes: NoteRow[]
  selectedId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onDelete: (id: number) => void
}) {
  return (
    <div style={{
      width: 168,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border-subtle)',
    }}>
      <button
        type="button"
        onClick={onCreate}
        style={{
          padding: '8px 10px',
          background: 'var(--accent-dim)',
          color: 'var(--accent)',
          border: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.02em',
          fontFamily: 'inherit',
          textAlign: 'left',
          flexShrink: 0,
          transition: 'background var(--transition)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 198, 46, 0.2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-dim)')}
      >
        + Neue Notiz
      </button>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {notes.length === 0 ? (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Noch keine Notiz.
          </div>
        ) : (
          notes.map((n) => (
            <NoteRowItem
              key={n.id}
              note={n}
              active={n.id === selectedId}
              onSelect={() => onSelect(n.id)}
              onDelete={() => onDelete(n.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function NoteRowItem({
  note,
  active,
  onSelect,
  onDelete,
}: {
  note: NoteRow
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [hover, setHover] = useState(false)
  const subtitle = note.content.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 48) || '—'
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--border-subtle)',
        background: active ? 'var(--accent-blue-dim)' : hover ? 'var(--bg-overlay)' : 'transparent',
        borderLeft: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          color: active ? 'var(--accent-blue-light)' : 'var(--text-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 11,
        }}
      >
        <div style={{
          fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {note.title || 'Ohne Titel'}
        </div>
        <div style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {subtitle}
        </div>
      </button>
      {hover && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Notiz löschen"
          style={{
            padding: '0 8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          🗑
        </button>
      )}
    </div>
  )
}

// ─── Tags editor ─────────────────────────────────────────────────────
// Chip list with an inline add-input. Enter or comma commits, Backspace
// on empty input removes the last chip. Simple + keyboard-friendly.

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function commit() {
    const v = draft.trim()
    if (!v) return
    if (tags.includes(v)) { setDraft(''); return }
    onChange([...tags, v])
    setDraft('')
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
      padding: '4px 6px',
      marginBottom: 'var(--sp-2)',
      background: 'var(--bg-base)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
    }}>
      {tags.map((t) => (
        <span
          key={t}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px',
            background: 'var(--accent-blue-dim)',
            color: 'var(--accent-blue-light)',
            borderRadius: 999,
            fontSize: 10, fontWeight: 600,
          }}
        >
          #{t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'inherit', fontSize: 11, padding: 0, lineHeight: 1,
            }}
          >×</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? 'Tags…' : ''}
        style={{
          flex: 1, minWidth: 60,
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--text-primary)', fontSize: 11, fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

function EmptyEditor({ onCreate, category }: { onCreate: () => void; category: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, color: 'var(--text-muted)', textAlign: 'center',
      padding: 'var(--sp-4)',
    }}>
      <div style={{ fontSize: 32, opacity: 0.5 }}>📝</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Keine Notiz in <strong>{category}</strong>.
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          padding: '8px 14px',
          background: 'var(--accent)',
          color: 'var(--text-inverse)',
          border: 'none',
          borderRadius: 'var(--radius)',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        + Neue Notiz
      </button>
    </div>
  )
}
