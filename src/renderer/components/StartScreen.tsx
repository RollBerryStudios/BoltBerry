import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { formatError } from '../utils/formatError'
import { useCampaignStore } from '../stores/campaignStore'
import type { Campaign } from '@shared/ipc-types'
import logoWide from '../assets/boltberry-logo-wide.png'
import { EmptyState } from './EmptyState'

export function StartScreen() {
  const { t } = useTranslation()
  const { campaigns, setActiveCampaign, addCampaign, removeCampaign, updateCampaign } = useCampaignStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [duplicating, setDuplicating] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onMenuNew = () => setCreating(true)
    window.addEventListener('menu:new-campaign', onMenuNew)
    return () => window.removeEventListener('menu:new-campaign', onMenuNew)
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    if (!window.electronAPI) {
      setError('Datenbankverbindung nicht verfügbar')
      return
    }
    setError(null)
    try {
      const result = await window.electronAPI.dbRun(
        `INSERT INTO campaigns (name) VALUES (?)`,
        [newName.trim()]
      )
      const campaign: Campaign = {
        id: result.lastInsertRowid,
        name: newName.trim(),
        createdAt: new Date().toISOString(),
        lastOpened: new Date().toISOString(),
      }
      addCampaign(campaign)
      setActiveCampaign(campaign.id)
      setCreating(false)
      setNewName('')
    } catch (err) {
      console.error('[StartScreen] create failed:', err)
      setError(`Kampagne konnte nicht erstellt werden: ${formatError(err)}`)
    }
  }

  async function handleDuplicate(campaignId: number) {
    if (!window.electronAPI || duplicating) return
    setDuplicating(campaignId)
    try {
      const result = await window.electronAPI.duplicateCampaign(campaignId)
      if (result?.success && result.campaign) {
        addCampaign(result.campaign)
      }
    } catch (err) {
      console.error('[StartScreen] duplicate failed:', err)
    } finally {
      setDuplicating(null)
    }
  }

  async function handleDelete(campaign: Campaign) {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.confirmDialog(
      'Kampagne löschen',
      `"${campaign.name}" unwiderruflich löschen? Alle Karten, Tokens und Daten gehen verloren.`
    )
    if (!confirmed) return
    try {
      await window.electronAPI.dbRun('DELETE FROM campaigns WHERE id = ?', [campaign.id])
      removeCampaign(campaign.id)
    } catch (err) {
      console.error('[StartScreen] delete campaign failed:', err)
      setError(`Löschen fehlgeschlagen: ${formatError(err)}`)
    }
  }

  async function handleRename(campaign: Campaign, newName: string) {
    if (!newName.trim() || newName.trim() === campaign.name || !window.electronAPI) return
    try {
      await window.electronAPI.dbRun('UPDATE campaigns SET name = ? WHERE id = ?', [newName.trim(), campaign.id])
      updateCampaign(campaign.id, { name: newName.trim() })
    } catch (err) {
      console.error('[StartScreen] rename campaign failed:', err)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 'var(--sp-6)',
      background: 'var(--bg-base)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <img
          src={logoWide}
          alt="BoltBerry"
          style={{
            height: 120,
            width: 'auto',
            filter: 'drop-shadow(0 4px 20px rgba(245, 168, 0, 0.35))',
            marginBottom: 'var(--sp-3)',
          }}
        />
        <h1 style={{
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          BoltBerry
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--sp-1)' }}>
          {t('app.tagline')}
        </p>
      </div>

      {!window.electronAPI && (
        <div style={{
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius)',
          color: 'var(--danger)',
          fontSize: 'var(--text-sm)',
          width: 440,
          marginBottom: 'var(--sp-3)',
        }}>
          ⚠️ Preload-Skript nicht geladen (<code>window.electronAPI</code> fehlt). Die Datenbank ist nicht erreichbar — bitte App neu installieren oder <code>npm run build</code> ausführen und neu starten.
        </div>
      )}

      <div style={{
        width: 480,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'visible',
      }}>
        {campaigns.length === 0 ? (
          <EmptyState
            icon="📜"
            title={t('startScreen.noCampaigns')}
            description={t('startScreen.noCampaignsDesc')}
            style={{ padding: 'var(--sp-8)' }}
          />
        ) : (
          <div>
            <div style={{
              padding: 'var(--sp-3) var(--sp-4)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {t('startScreen.recentlyUsed')}
            </div>
            {campaigns.map((c) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                duplicating={duplicating === c.id}
                onOpen={() => setActiveCampaign(c.id)}
                onDuplicate={() => handleDuplicate(c.id)}
                onDelete={() => handleDelete(c)}
                onRename={(name) => handleRename(c, name)}
              />
            ))}
          </div>
        )}

        {error && (
          <div style={{
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'rgba(239, 68, 68, 0.15)',
            borderTop: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--danger)',
            fontSize: 'var(--text-sm)',
          }}>
            ⚠️ {error}
          </div>
        )}
        <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
          {creating ? (
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                className="input"
                autoFocus
                placeholder={t('startScreen.campaignNamePlaceholder')}
                maxLength={60}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
              />
              <button className="btn btn-primary" onClick={handleCreate}>
                {t('startScreen.create')}
              </button>
              <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewName('') }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setCreating(true)}
              >
                {t('startScreen.newCampaign')}
              </button>
              {/* Campaign import was previously only reachable via the
                  command palette — new DMs receiving a shared .boltberry
                  ZIP had no visible path to it. Surfaced here as a
                  secondary ghost button so the happy path stays obvious
                  but the import is one click away. */}
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
                onClick={async () => {
                  if (!window.electronAPI) return
                  try {
                    const result = await window.electronAPI.importCampaign()
                    if (result?.success && result.campaignId) {
                      const row = await window.electronAPI.dbQuery<Campaign>(
                        'SELECT id, name, created_at as createdAt, last_opened as lastOpened FROM campaigns WHERE id = ?',
                        [result.campaignId],
                      )
                      if (row[0]) addCampaign(row[0])
                    } else if (result && !result.success) {
                      setError(result.error ?? 'Import fehlgeschlagen.')
                    }
                  } catch (err) {
                    setError(`Import fehlgeschlagen: ${formatError(err)}`)
                  }
                }}
              >
                📥 {t('startScreen.importCampaign', 'Kampagne importieren…')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Row Component ────────────────────────────────────────────────────

function CampaignRow({
  campaign, duplicating, onOpen, onDuplicate, onDelete, onRename,
}: {
  campaign: Campaign
  duplicating: boolean
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
  onRename: (name: string) => void
}) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(campaign.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) {
      setRenameValue(campaign.name)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [renaming, campaign.name])

  function commitRename() {
    onRename(renameValue)
    setRenaming(false)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Main click area */}
      <button
        onClick={renaming ? undefined : onOpen}
        onKeyDown={(e) => {
          if (!renaming && e.key === 'F2') {
            e.preventDefault()
            setRenaming(true)
          }
        }}
        disabled={renaming}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: renaming ? 'default' : 'pointer',
          textAlign: 'left',
          transition: 'background var(--transition)',
        }}
        onMouseEnter={(e) => { if (!renaming) e.currentTarget.style.background = 'var(--bg-overlay)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span style={{ fontSize: 24, flexShrink: 0 }}>🗺️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input
              ref={inputRef}
              className="input"
              maxLength={60}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setRenameValue(campaign.name); setRenaming(false) }
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 'var(--text-sm)', padding: '2px 6px', height: 28 }}
            />
          ) : (
            <>
              <div
                style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onDoubleClick={() => setRenaming(true)}
              >
                {campaign.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t('startScreen.lastOpened', {
                  date: new Date(campaign.lastOpened).toLocaleDateString(),
                })}
              </div>
            </>
          )}
        </div>
      </button>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 'var(--sp-2)', flexShrink: 0 }}>
        {renaming ? (
          <>
            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 8px', height: 26 }}
              onClick={commitRename}
            >
              ✓
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', height: 26 }}
              onClick={() => setRenaming(false)}
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <button
              title="Umbenennen"
              onClick={() => setRenaming(true)}
              style={{
                padding: '4px 6px',
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✏️
            </button>
            <button
              title={t('startScreen.duplicateCampaign')}
              onClick={onDuplicate}
              disabled={duplicating}
              style={{
                padding: '4px 6px',
                background: 'none',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                opacity: duplicating ? 0.5 : 1,
              }}
            >
              {duplicating ? '…' : '📋'}
            </button>
            <button
              title="Kampagne löschen"
              onClick={onDelete}
              style={{
                padding: '4px 6px',
                background: 'none',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius)',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  )
}
