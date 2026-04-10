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

// ─── NotesPanel ──────────────────────────────────────────────────────────────────

export function NotesPanel() {
  const { activeCampaignId, activeMapId } = useCampaignStore()
  const [campaignNote, setCampaignNote] = useState('')
  const [mapNote, setMapNote] = useState('')
  const [activeTab, setActiveTab] = useState<'campaign' | 'map'>('campaign')
  const [preview, setPreview] = useState(false)
  const prevTabRef = useRef<'campaign' | 'map'>('campaign')
  const campaignNoteRef = useRef(campaignNote)
  const mapNoteRef = useRef(mapNote)
  useEffect(() => { campaignNoteRef.current = campaignNote }, [campaignNote])
  useEffect(() => { mapNoteRef.current = mapNote }, [mapNote])

  useEffect(() => {
    if (!activeCampaignId) return
    loadNotes()
  }, [activeCampaignId, activeMapId])

  async function loadNotes() {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      const [cNote] = await window.electronAPI.dbQuery<{ content: string }>(
        `SELECT content FROM notes WHERE campaign_id = ? AND map_id IS NULL LIMIT 1`,
        [activeCampaignId]
      )
      setCampaignNote(cNote?.content ?? '')

      if (activeMapId) {
        const [mNote] = await window.electronAPI.dbQuery<{ content: string }>(
          `SELECT content FROM notes WHERE campaign_id = ? AND map_id = ? LIMIT 1`,
          [activeCampaignId, activeMapId]
        )
        setMapNote(mNote?.content ?? '')
      }
    } catch (err) {
      console.error('[NotesPanel] loadNotes failed:', err)
    }
  }

  const saveNote = useCallback(async (content: string, mapId: number | null) => {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      await window.electronAPI.dbRun(
        `INSERT INTO notes (campaign_id, map_id, content, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(campaign_id, map_id) DO UPDATE
           SET content = excluded.content, updated_at = excluded.updated_at`,
        [activeCampaignId, mapId, content]
      )
    } catch (err) {
      console.error('[NotesPanel] saveNote failed:', err)
    }
  }, [activeCampaignId])

  // Save the previous tab's note when switching tabs
  function handleTabSwitch(tab: 'campaign' | 'map') {
    if (tab === activeTab) return
    const prevTab = prevTabRef.current
    prevTabRef.current = tab
    if (prevTab === 'campaign') {
      saveNote(campaignNoteRef.current, null)
    } else if (activeMapId) {
      saveNote(mapNoteRef.current, activeMapId)
    }
    setActiveTab(tab)
  }

  const currentNote = activeTab === 'campaign' ? campaignNote : mapNote
  const setCurrentNote = activeTab === 'campaign' ? setCampaignNote : setMapNote

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs + preview toggle */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        alignItems: 'center',
      }}>
        {(['campaign', 'map'] as const).map((tab) => (
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

      {/* Note area */}
      <div style={{ flex: 1, padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column' }}>
        {preview ? (
          <MarkdownPreview text={currentNote} />
        ) : (
          <textarea
            value={currentNote}
            onChange={(e) => setCurrentNote(e.target.value)}
            onBlur={() => saveNote(currentNote, activeTab === 'map' ? activeMapId : null)}
            placeholder={
              activeTab === 'campaign'
                ? 'Kampagnen-Notizen, NSC-Namen, Passworte, Plots…\n\n# Überschrift\n**Fett** *Kursiv* `Code`\n- Aufzählung'
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
