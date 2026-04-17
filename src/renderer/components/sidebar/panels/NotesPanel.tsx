import { useState, useEffect, useCallback, memo, useRef } from 'react'
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
      const campaignRows = await window.electronAPI.dbQuery<NoteRow & { category: string }>(
        `SELECT id, category, title, content, updated_at
         FROM notes
         WHERE campaign_id = ? AND map_id IS NULL AND pin_x IS NULL AND pin_y IS NULL
         ORDER BY updated_at DESC`,
        [campaignId],
      )
      const buckets: Record<string, NoteRow[]> = {}
      for (const cat of CAMPAIGN_CATEGORIES) buckets[cat.id] = []
      for (const row of campaignRows) {
        const { category, ...note } = row
        if (!buckets[category]) buckets[category] = []
        buckets[category].push(note)
      }

      if (mapId) {
        const mapRows = await window.electronAPI.dbQuery<NoteRow>(
          `SELECT id, title, content, updated_at
           FROM notes
           WHERE campaign_id = ? AND map_id = ? AND pin_x IS NULL AND pin_y IS NULL
           ORDER BY updated_at DESC`,
          [campaignId, mapId],
        )
        buckets[MAP_BUCKET] = mapRows
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
    patch: { title?: string; content?: string },
  ) => {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      const fields: string[] = []
      const params: unknown[] = []
      if (patch.title !== undefined) { fields.push('title = ?'); params.push(patch.title) }
      if (patch.content !== undefined) { fields.push('content = ?'); params.push(patch.content) }
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
      const newRow: NoteRow = { id, title: 'Neue Notiz', content: '', updated_at: new Date().toISOString() }
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

  function setActiveNoteLocal(bucket: string, patch: { title?: string; content?: string }) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      {/* ── Main body: list + editor ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, opacity: disabled ? 0.5 : 1 }}>
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
      </div>
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
