import { useState, useEffect } from 'react'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useImageUrl } from '../../../hooks/useImageUrl'
import type { HandoutRecord } from '@shared/ipc-types'

export function HandoutsPanel() {
  const { activeCampaignId } = useCampaignStore()
  const [handouts, setHandouts] = useState<HandoutRecord[]>([])
  const [addingTitle, setAddingTitle] = useState('')
  const [addingText, setAddingText] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [sentId, setSentId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    if (!activeCampaignId) return
    loadHandouts(activeCampaignId)
  }, [activeCampaignId])

  async function loadHandouts(campaignId: number) {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number; campaign_id: number; title: string
        image_path: string | null; text_content: string | null; created_at: string
      }>('SELECT * FROM handouts WHERE campaign_id = ? ORDER BY created_at DESC', [campaignId])
      setHandouts(rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        title: r.title,
        imagePath: r.image_path,
        textContent: r.text_content,
        createdAt: r.created_at,
      })))
    } catch (err) {
      console.error('[HandoutsPanel] loadHandouts failed:', err)
    }
  }

  async function handleAddHandout() {
    if (!activeCampaignId || !window.electronAPI) return
    const title = addingTitle.trim() || 'Handout'
    let imagePath: string | null = null
    try {
      const asset = await window.electronAPI.importFile('handout')
      if (asset) imagePath = asset.path

      const result = await window.electronAPI.dbRun(
        'INSERT INTO handouts (campaign_id, title, image_path, text_content) VALUES (?, ?, ?, ?)',
        [activeCampaignId, title, imagePath, addingText.trim() || null]
      )
      const newHandout: HandoutRecord = {
        id: result.lastInsertRowid,
        campaignId: activeCampaignId,
        title,
        imagePath,
        textContent: addingText.trim() || null,
        createdAt: new Date().toISOString(),
      }
      setHandouts((prev) => [newHandout, ...prev])
      setAddingTitle('')
      setAddingText('')
      setIsAdding(false)
    } catch (err) {
      console.error('[HandoutsPanel] handleAddHandout failed:', err)
    }
  }

  async function handleDeleteHandout(id: number) {
    if (!window.electronAPI) return
    const handout = handouts.find((h) => h.id === id)
    const confirmed = await window.electronAPI.confirmDialog(
      `Handout "${handout?.title ?? ''}" löschen?`,
      'Diese Aktion kann nicht rükgängig gemacht werden.'
    )
    if (!confirmed) return
    try {
      await window.electronAPI.dbRun('DELETE FROM handouts WHERE id = ?', [id])
      setHandouts((prev) => prev.filter((h) => h.id !== id))
      if (sentId === id) {
        window.electronAPI.sendHandout(null)
        setSentId(null)
      }
    } catch (err) {
      console.error('[HandoutsPanel] handleDeleteHandout failed:', err)
    }
  }

  function handleSendToPlayer(handout: HandoutRecord) {
    window.electronAPI?.sendHandout({
      title: handout.title,
      imagePath: handout.imagePath,
      textContent: handout.textContent,
    })
    setSentId(handout.id)
  }

  function handleDismissFromPlayer() {
    window.electronAPI?.sendHandout(null)
    setSentId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-3) var(--sp-4)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-muted)', flex: 1,
        }}>
          {handouts.length} Handout{handouts.length !== 1 ? 's' : ''}
        </span>

        {sentId != null && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', padding: '3px 8px' }}
            onClick={handleDismissFromPlayer}
            title="Handout beim Spieler ausblenden"
          >
            ✕ Ausblenden
          </button>
        )}

        <button
          className="btn btn-secondary"
          style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
          onClick={() => setIsAdding(true)}
          disabled={!activeCampaignId || isAdding}
        >
          + Hinzufügen
        </button>
      </div>

      {/* ── Add form ────────────────────────────────────────────────────────── */}
      {isAdding && (
        <div style={{
          padding: 'var(--sp-4)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-2)',
        }}>
          <input
            className="input"
            autoFocus
            placeholder="Titel…"
            value={addingTitle}
            onChange={(e) => setAddingTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setIsAdding(false) }}
          />
          <textarea
            className="input"
            placeholder="Beschreibung / Notiz (optional)…"
            value={addingText}
            onChange={(e) => setAddingText(e.target.value)}
            rows={3}
            style={{ resize: 'vertical', fontSize: 'var(--text-sm)' }}
          />
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-sm)' }}
              onClick={handleAddHandout}
            >
              Bild wählen &amp; speichern
            </button>
            <button className="btn btn-ghost" onClick={() => setIsAdding(false)}>✕</button>
          </div>
        </div>
      )}

      {/* ── Card grid ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-4)' }}>
        {handouts.length === 0 && !isAdding ? (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">Keine Handouts</div>
            <div className="empty-state-desc">
              Bilder und Texte für Spieler vorbereiten und per Klick anzeigen.
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--sp-4)',
          }}>
            {handouts.map((h) => (
              <HandoutCard
                key={h.id}
                handout={h}
                isSent={sentId === h.id}
                isExpanded={expandedId === h.id}
                onSend={() => handleSendToPlayer(h)}
                onDelete={() => handleDeleteHandout(h.id)}
                onToggleExpand={() => setExpandedId(expandedId === h.id ? null : h.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Handout card ──────────────────────────────────────────────────────────────

function HandoutCard({
  handout, isSent, isExpanded, onSend, onDelete, onToggleExpand,
}: {
  handout: HandoutRecord
  isSent: boolean
  isExpanded: boolean
  onSend: () => void
  onDelete: () => void
  onToggleExpand: () => void
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: isSent ? 'var(--accent-dim)' : 'var(--bg-elevated)',
      border: `1px solid ${isSent ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      transition: 'border-color var(--transition), background var(--transition)',
    }}>
      {/* Thumbnail */}
      {handout.imagePath && (
        <HandoutThumbnail path={handout.imagePath} />
      )}

      {/* Card body */}
      <div style={{ padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', flex: 1 }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)' }}>
          <span style={{
            flex: 1,
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}>
            {handout.title}
          </span>
          {isSent && (
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 5px',
              borderRadius: 'var(--radius-sm)', flexShrink: 0,
            }}>
              Live
            </span>
          )}
        </div>

        {/* Text content */}
        {handout.textContent && (
          <div>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: 'pre-wrap',
              overflow: isExpanded ? undefined : 'hidden',
              display: isExpanded ? undefined : '-webkit-box',
              WebkitLineClamp: isExpanded ? undefined : 3,
              WebkitBoxOrient: isExpanded ? undefined : 'vertical',
            } as React.CSSProperties}>
              {handout.textContent}
            </p>
            {handout.textContent.length > 120 && (
              <button
                onClick={onToggleExpand}
                style={{
                  background: 'none', border: 'none', padding: 0, marginTop: 4,
                  color: 'var(--accent-blue-light)', cursor: 'pointer',
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                }}
              >
                {isExpanded ? 'Weniger' : 'Mehr anzeigen'}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'auto', paddingTop: 'var(--sp-1)' }}>
          <button
            className="btn btn-ghost"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: isSent ? 'var(--accent-light)' : 'var(--text-secondary)',
              borderColor: isSent ? 'var(--accent)' : 'var(--border-subtle)',
              border: '1px solid',
              borderRadius: 'var(--radius)',
              padding: '4px 8px',
            }}
            onClick={onSend}
            title={isSent ? 'Erneut senden' : 'An Spieler senden'}
          >
            {isSent ? '💺 Wird gezeigt' : '→ Zeigen'}
          </button>
          <button
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--danger)', flexShrink: 0 }}
            title="Handout löschen"
            onClick={onDelete}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function HandoutThumbnail({ path }: { path: string }) {
  const url = useImageUrl(path)
  if (!url) return null
  return (
    <img
      src={url}
      style={{
        width: '100%',
        height: 160,
        objectFit: 'cover',
        display: 'block',
        background: 'var(--bg-base)',
      }}
    />
  )
}
