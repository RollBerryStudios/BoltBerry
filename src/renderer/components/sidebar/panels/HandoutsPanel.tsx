import { useState, useEffect } from 'react'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'
import { useImageUrl } from '../../../hooks/useImageUrl'
import type { HandoutRecord } from '@shared/ipc-types'

// ─── Simple Markdown renderer ─────────────────────────────────────────────────
// Supports: # headings, **bold**, *italic*, - lists, blank-line paragraphs

function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const htmlLines: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Headings
    if (/^### (.+)/.test(line)) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      line = line.replace(/^### (.+)/, '<h4 style="margin:8px 0 4px;font-size:0.9em;color:var(--text-primary)">$1</h4>')
      htmlLines.push(line); continue
    }
    if (/^## (.+)/.test(line)) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      line = line.replace(/^## (.+)/, '<h3 style="margin:10px 0 4px;font-size:1em;color:var(--text-primary)">$1</h3>')
      htmlLines.push(line); continue
    }
    if (/^# (.+)/.test(line)) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      line = line.replace(/^# (.+)/, '<h2 style="margin:12px 0 6px;font-size:1.1em;color:var(--text-primary)">$1</h2>')
      htmlLines.push(line); continue
    }

    // List items
    if (/^[-*] (.+)/.test(line)) {
      if (!inList) { htmlLines.push('<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc">'); inList = true }
      line = line.replace(/^[-*] (.+)/, '<li>$1</li>')
      line = applyInline(line)
      htmlLines.push(line); continue
    } else if (inList) {
      htmlLines.push('</ul>'); inList = false
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      htmlLines.push('<br/>')
      continue
    }

    // Normal paragraph line
    htmlLines.push('<span>' + applyInline(line) + '</span><br/>')
  }

  if (inList) htmlLines.push('</ul>')
  return htmlLines.join('')
}

function applyInline(text: string): string {
  // Bold before italic to avoid greedy match issues
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--bg-overlay);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
}

export function HandoutsPanel() {
  const { activeCampaignId } = useCampaignStore()
  const sessionMode = useUIStore((s) => s.sessionMode)
  const isSession = sessionMode === 'session'

  const [handouts, setHandouts] = useState<HandoutRecord[]>([])
  const [addingTitle, setAddingTitle] = useState('')
  const [addingText, setAddingText] = useState('')
  const [addingImagePath, setAddingImagePath] = useState<string | null>(null)
  const [addingImageName, setAddingImageName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [composeTab, setComposeTab] = useState<'write' | 'preview'>('write')
  const [lightboxId, setLightboxId] = useState<number | null>(null)
  // Only relevant in session mode: which handout is currently shown to players
  const [sentId, setSentId] = useState<number | null>(null)

  useEffect(() => {
    if (!activeCampaignId) return
    loadHandouts(activeCampaignId)
  }, [activeCampaignId])

  // Clear player handout when leaving session mode
  useEffect(() => {
    if (!isSession && sentId != null) {
      window.electronAPI?.sendHandout(null)
      setSentId(null)
    }
  }, [isSession])

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

  async function handlePickImage() {
    if (!window.electronAPI) return
    try {
      const asset = await window.electronAPI.importFile('handout')
      if (asset) {
        setAddingImagePath(asset.path)
        setAddingImageName(asset.path.split(/[\\/]/).pop() ?? '')
      }
    } catch (err) {
      console.error('[HandoutsPanel] handlePickImage failed:', err)
    }
  }

  async function handleSaveHandout() {
    if (!activeCampaignId || !window.electronAPI) return
    const title = addingTitle.trim() || 'Handout'
    try {
      const result = await window.electronAPI.dbRun(
        'INSERT INTO handouts (campaign_id, title, image_path, text_content) VALUES (?, ?, ?, ?)',
        [activeCampaignId, title, addingImagePath, addingText.trim() || null]
      )
      const newHandout: HandoutRecord = {
        id: result.lastInsertRowid,
        campaignId: activeCampaignId,
        title,
        imagePath: addingImagePath,
        textContent: addingText.trim() || null,
        createdAt: new Date().toISOString(),
      }
      setHandouts((prev) => [newHandout, ...prev])
      setAddingTitle('')
      setAddingText('')
      setAddingImagePath(null)
      setAddingImageName('')
      setIsAdding(false)
    } catch (err) {
      console.error('[HandoutsPanel] handleSaveHandout failed:', err)
    }
  }

  function handleCancelAdding() {
    setIsAdding(false)
    setComposeTab('write')
    setAddingTitle('')
    setAddingText('')
    setAddingImagePath(null)
    setAddingImageName('')
  }

  async function handleDeleteHandout(id: number) {
    if (!window.electronAPI) return
    const handout = handouts.find((h) => h.id === id)
    const confirmed = await window.electronAPI.confirmDialog(
      `Handout "${handout?.title ?? ''}" löschen?`,
      'Diese Aktion kann nicht rückgängig gemacht werden.'
    )
    if (!confirmed) return
    try {
      await window.electronAPI.dbRun('DELETE FROM handouts WHERE id = ?', [id])
      setHandouts((prev) => prev.filter((h) => h.id !== id))
      if (lightboxId === id) setLightboxId(null)
      if (sentId === id) {
        window.electronAPI?.sendHandout(null)
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

  const lightboxHandout = lightboxId != null ? handouts.find((h) => h.id === lightboxId) ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      {lightboxHandout && (
        <HandoutLightbox
          handout={lightboxHandout}
          onClose={() => setLightboxId(null)}
        />
      )}

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

        {/* "Dismiss from players" — only in session mode when something is shown */}
        {isSession && sentId != null && (
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
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          margin: 'var(--sp-3) var(--sp-3) 0',
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
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancelAdding() }}
          />

          {/* Write / Preview tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)' }}>
            {(['write', 'preview'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setComposeTab(tab)}
                style={{
                  padding: '4px 12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: composeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  color: composeTab === tab ? 'var(--accent-blue-light)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  fontWeight: composeTab === tab ? 700 : 400,
                  marginBottom: -1,
                  transition: 'color var(--transition)',
                }}
              >
                {tab === 'write' ? '✏ Schreiben' : '👁 Vorschau'}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: '28px', paddingRight: 4 }}>
              Markdown
            </span>
          </div>

          {composeTab === 'write' ? (
            <textarea
              className="input"
              placeholder="Beschreibung / Notiz (optional)…  Markdown: **fett**, *kursiv*, # Überschrift, - Liste"
              value={addingText}
              onChange={(e) => setAddingText(e.target.value)}
              rows={5}
              style={{ resize: 'vertical', fontSize: 'var(--text-sm)' }}
            />
          ) : (
            <div style={{
              minHeight: 96,
              maxHeight: 300,
              overflowY: 'auto',
              padding: '8px 10px',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              {addingText.trim() ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(addingText) }} />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Nichts zu Vorschau — wechsle zu „Schreiben" und gib Text ein.
                </span>
              )}
            </div>
          )}

          {/* Image picker */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'flex-start', gap: 6, fontSize: 'var(--text-xs)' }}
            onClick={handlePickImage}
          >
            🖼
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              color: addingImagePath ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              {addingImagePath ? addingImageName : 'Bild wählen (optional)…'}
            </span>
            {addingImagePath && (
              <span
                style={{ color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                onClick={(e) => { e.stopPropagation(); setAddingImagePath(null); setAddingImageName('') }}
                title="Bild entfernen"
              >
                ✕
              </span>
            )}
          </button>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-sm)' }}
              onClick={handleSaveHandout}
            >
              ✓ Speichern
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-sm)' }}
              onClick={handleCancelAdding}
            >
              Abbrechen
            </button>
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
              {isSession
                ? 'Bilder und Texte für Spieler vorbereiten und per Klick anzeigen.'
                : 'Bilder und Texte für die Spielrunde vorbereiten.'}
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
                isSession={isSession}
                isSent={sentId === h.id}
                onZoom={() => setLightboxId(h.id)}
                onSend={() => handleSendToPlayer(h)}
                onDelete={() => handleDeleteHandout(h.id)}
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
  handout, isSession, isSent, onZoom, onSend, onDelete,
}: {
  handout: HandoutRecord
  isSession: boolean
  isSent: boolean
  onZoom: () => void
  onSend: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

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
      {/* Thumbnail — click to zoom */}
      {handout.imagePath && (
        <HandoutThumbnail path={handout.imagePath} onClick={onZoom} />
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
              overflow: expanded ? undefined : 'hidden',
              display: expanded ? undefined : '-webkit-box',
              WebkitLineClamp: expanded ? undefined : 3,
              WebkitBoxOrient: expanded ? undefined : 'vertical',
            } as React.CSSProperties}>
              {handout.textContent}
            </p>
            {handout.textContent.length > 120 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{
                  background: 'none', border: 'none', padding: 0, marginTop: 4,
                  color: 'var(--accent-blue-light)', cursor: 'pointer',
                  fontSize: 'var(--text-xs)', fontWeight: 600,
                }}
              >
                {expanded ? 'Weniger' : 'Mehr anzeigen'}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'auto', paddingTop: 'var(--sp-1)' }}>
          {/* Zoom — always visible */}
          <button
            className="btn btn-ghost"
            style={{ flex: isSession ? undefined : 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px 8px' }}
            onClick={onZoom}
            title="Vergrößert anzeigen"
          >
            ⛶
          </button>

          {/* Send to players — only in session mode */}
          {isSession && (
            <button
              className="btn btn-ghost"
              style={{
                flex: 1,
                justifyContent: 'center',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                padding: '4px 8px',
                color: isSent ? 'var(--accent-light)' : 'var(--text-secondary)',
                borderColor: isSent ? 'var(--accent)' : 'var(--border-subtle)',
                border: '1px solid',
                borderRadius: 'var(--radius)',
              }}
              onClick={onSend}
              title={isSent ? 'Erneut senden' : 'An Spieler senden'}
            >
              {isSent ? '📺 Wird gezeigt' : '→ Spieler'}
            </button>
          )}

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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function HandoutLightbox({ handout, onClose }: { handout: HandoutRecord; onClose: () => void }) {
  const imageUrl = useImageUrl(handout.imagePath)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#182130',
          borderRadius: 12,
          border: '1px solid #1E2A3E',
          maxWidth: 800,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '50%', width: 32, height: 32, fontSize: 16, color: '#F4F6FA',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Schließen (Esc)"
        >
          ✕
        </button>

        {imageUrl && (
          <img
            src={imageUrl}
            style={{
              width: '100%',
              borderRadius: '12px 12px 0 0',
              display: 'block',
              maxHeight: '60vh',
              objectFit: 'contain',
              background: '#0d1117',
            }}
          />
        )}

        {(handout.title || handout.textContent) && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#F4F6FA', marginBottom: handout.textContent ? 12 : 0 }}>
              {handout.title}
            </div>
            {handout.textContent && (
              <div style={{ fontSize: 15, color: '#94A0B2', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {handout.textContent}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function HandoutThumbnail({ path, onClick }: { path: string; onClick: () => void }) {
  const url = useImageUrl(path)
  if (!url) return null
  return (
    <img
      src={url}
      onClick={onClick}
      style={{
        width: '100%',
        height: 160,
        objectFit: 'cover',
        display: 'block',
        background: 'var(--bg-base)',
        cursor: 'zoom-in',
      }}
      title="Vergrößert anzeigen"
    />
  )
}
