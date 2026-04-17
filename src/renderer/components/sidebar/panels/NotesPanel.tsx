import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useCampaignStore } from '../../../stores/campaignStore'

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

// ─── NotesPanel ──────────────────────────────────────────────────────────────────

export function NotesPanel() {
  const { activeCampaignId, activeMapId } = useCampaignStore()

  // 'campaign' or 'map' top-level tab
  const [activeTab, setActiveTab] = useState<'campaign' | 'map'>('campaign')

  // Active category within the campaign tab
  const [activeCategory, setActiveCategory] = useState('Allgemein')

  // Note contents: keyed by category for campaign notes, plus 'map' for the map tab
  const [notes, setNotes] = useState<Record<string, string>>({})

  const [preview, setPreview] = useState(false)

  // Refs for auto-save on tab/category switch
  const notesRef = useRef(notes)
  useEffect(() => { notesRef.current = notes }, [notes])
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  const activeCategoryRef = useRef(activeCategory)
  useEffect(() => { activeCategoryRef.current = activeCategory }, [activeCategory])
  const activeMapIdRef = useRef(activeMapId)
  useEffect(() => { activeMapIdRef.current = activeMapId }, [activeMapId])

  // Load all notes for the current campaign
  useEffect(() => {
    if (!activeCampaignId) return
    loadAllNotes(activeCampaignId, activeMapId)
  }, [activeCampaignId, activeMapId])

  async function loadAllNotes(campaignId: number, mapId: number | null) {
    if (!window.electronAPI) return
    try {
      // All campaign-level notes (map_id IS NULL)
      const campaignRows = await window.electronAPI.dbQuery<{ category: string; content: string }>(
        `SELECT category, content FROM notes WHERE campaign_id = ? AND map_id IS NULL`,
        [campaignId]
      )
      const loaded: Record<string, string> = {}
      for (const row of campaignRows) {
        loaded[row.category] = row.content
      }

      // Map note
      if (mapId) {
        const [mNote] = await window.electronAPI.dbQuery<{ content: string }>(
          `SELECT content FROM notes WHERE campaign_id = ? AND map_id = ? LIMIT 1`,
          [campaignId, mapId]
        )
        loaded['__map__'] = mNote?.content ?? ''
      }

      setNotes(loaded)
    } catch (err) {
      console.error('[NotesPanel] loadAllNotes failed:', err)
    }
  }

  const saveNote = useCallback(async (content: string, mapId: number | null, category: string) => {
    if (!window.electronAPI || !activeCampaignId) return
    // SQLite treats NULL != NULL in UNIQUE constraints, so the old
    // UNIQUE(campaign_id, map_id, category) silently let campaign-level
    // notes (map_id IS NULL) accumulate duplicates. v24 replaces it with
    // a partial unique index on COALESCE(map_id, 0) where pin_x/pin_y are
    // NULL — target it explicitly in ON CONFLICT.
    try {
      await window.electronAPI.dbRun(
        `INSERT INTO notes (campaign_id, map_id, category, content, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT (campaign_id, COALESCE(map_id, 0), category)
           WHERE pin_x IS NULL AND pin_y IS NULL
           DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
        [activeCampaignId, mapId, category, content]
      )
    } catch (err) {
      console.error('[NotesPanel] saveNote failed:', err)
    }
  }, [activeCampaignId])

  // Auto-save before switching tabs
  function handleTabSwitch(tab: 'campaign' | 'map') {
    if (tab === activeTab) return
    flushCurrentNote()
    setActiveTab(tab)
  }

  // Auto-save before switching category
  function handleCategorySwitch(cat: string) {
    if (cat === activeCategory) return
    flushCurrentNote()
    setActiveCategory(cat)
  }

  function flushCurrentNote() {
    const tab = activeTabRef.current
    const cat = activeCategoryRef.current
    const mapId = activeMapIdRef.current
    const content = notesRef.current
    if (tab === 'campaign') {
      saveNote(content[cat] ?? '', null, cat)
    } else if (tab === 'map' && mapId) {
      saveNote(content['__map__'] ?? '', mapId, 'Allgemein')
    }
  }

  // Derive current note text
  const currentKey = activeTab === 'campaign' ? activeCategory : '__map__'
  const currentNote = notes[currentKey] ?? ''
  function setCurrentNote(val: string) {
    setNotes((prev) => ({ ...prev, [currentKey]: val }))
  }

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
            const hasContent = !!(notes[cat.id]?.trim())
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
                {hasContent && (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--accent)', display: 'inline-block', flexShrink: 0,
                  }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Note area ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column' }}>
        {preview ? (
          <MarkdownPreview text={currentNote} />
        ) : (
          <textarea
            value={currentNote}
            onChange={(e) => setCurrentNote(e.target.value)}
            onBlur={() => {
              if (activeTab === 'campaign') {
                saveNote(currentNote, null, activeCategory)
              } else if (activeMapId) {
                saveNote(currentNote, activeMapId, 'Allgemein')
              }
            }}
            placeholder={
              activeTab === 'campaign'
                ? `${CAMPAIGN_CATEGORIES.find(c => c.id === activeCategory)?.icon ?? ''} ${activeCategory}-Notizen…\n\n# Überschrift\n**Fett** *Kursiv* \`Code\`\n- Aufzählung`
                : activeMapId ? 'Karten-spezifische Notizen, Fallen, Raumhinweise…' : 'Keine Karte ausgewählt'
            }
            disabled={activeTab === 'map' && !activeMapId}
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
              opacity: activeTab === 'map' && !activeMapId ? 0.5 : 1,
            }}
          />
        )}
      </div>
    </div>
  )
}
