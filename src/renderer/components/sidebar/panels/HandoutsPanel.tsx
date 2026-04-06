import { useState, useEffect } from 'react'
import { useCampaignStore } from '../../../stores/campaignStore'
import type { HandoutRecord } from '@shared/ipc-types'

export function HandoutsPanel() {
  const { activeCampaignId } = useCampaignStore()
  const [handouts, setHandouts] = useState<HandoutRecord[]>([])
  const [addingTitle, setAddingTitle] = useState('')
  const [addingText, setAddingText] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [sentId, setSentId] = useState<number | null>(null)

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
      const asset = await window.electronAPI.importFile('atmosphere')
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
    await window.electronAPI?.dbRun('DELETE FROM handouts WHERE id = ?', [id])
    setHandouts((prev) => prev.filter((h) => h.id !== id))
    if (sentId === id) {
      window.electronAPI?.sendHandout(null)
      setSentId(null)
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)' }}>
      <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-3)' }}>
        Handouts
      </div>

      {sentId != null && (
        <button
          className="btn btn-ghost"
          style={{ marginBottom: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--warning)' }}
          onClick={handleDismissFromPlayer}
        >
          ✕ Handout beim Spieler ausblenden
        </button>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {handouts.length === 0 && !isAdding && (
          <div className="empty-state" style={{ marginTop: 'auto', paddingBottom: 'var(--sp-8)' }}>
            <div className="empty-state-icon">📜</div>
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Keine Handouts</div>
            <div className="empty-state-desc">Bilder oder Texte an Spieler senden</div>
          </div>
        )}

        {handouts.map((h) => (
          <div
            key={h.id}
            style={{
              border: `1px solid ${sentId === h.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius)',
              padding: 'var(--sp-2)',
              background: sentId === h.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: h.imagePath || h.textContent ? 'var(--sp-2)' : 0 }}>
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 500 }}>{h.title}</span>
              <button
                className="btn btn-ghost btn-icon"
                style={{ fontSize: 'var(--text-xs)', color: sentId === h.id ? 'var(--accent-light)' : undefined }}
                title="An Spieler senden"
                onClick={() => handleSendToPlayer(h)}
              >
                {sentId === h.id ? '📺' : '→'}
              </button>
              <button
                className="btn btn-ghost btn-icon"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}
                title="Löschen"
                onClick={() => handleDeleteHandout(h.id)}
              >
                ✕
              </button>
            </div>
            {h.imagePath && (
              <img
                src={`file://${h.imagePath}`}
                style={{ width: '100%', maxHeight: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
              />
            )}
            {h.textContent && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--sp-1)', whiteSpace: 'pre-wrap' }}>
                {h.textContent.slice(0, 120)}{h.textContent.length > 120 ? '…' : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdding ? (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)', marginTop: 'var(--sp-2)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <input
            className="input"
            autoFocus
            placeholder="Titel…"
            value={addingTitle}
            onChange={(e) => setAddingTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setIsAdding(false) } }}
          />
          <textarea
            className="input"
            placeholder="Text (optional)…"
            value={addingText}
            onChange={(e) => setAddingText(e.target.value)}
            rows={2}
            style={{ resize: 'none', fontSize: 'var(--text-xs)' }}
          />
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)' }} onClick={handleAddHandout}>
              + Bild wählen & hinzufügen
            </button>
            <button className="btn btn-ghost" onClick={() => setIsAdding(false)}>✕</button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--sp-2)', fontSize: 'var(--text-xs)' }}
          onClick={() => setIsAdding(true)}
          disabled={!activeCampaignId}
        >
          + Handout hinzufügen
        </button>
      )}
    </div>
  )
}
