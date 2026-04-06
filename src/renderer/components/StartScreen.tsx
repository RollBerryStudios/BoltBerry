import { useState } from 'react'
import { useCampaignStore } from '../stores/campaignStore'
import type { Campaign } from '@shared/ipc-types'
import logoWide from '../assets/boltberry-logo-wide.png'

export function StartScreen() {
  const { campaigns, setActiveCampaign, addCampaign } = useCampaignStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [duplicating, setDuplicating] = useState<number | null>(null)

  async function handleCreate() {
    if (!newName.trim() || !window.electronAPI) return
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
      {/* Logo / Title */}
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
          Dein lokales Virtual Tabletop
        </p>
      </div>

      {/* Campaign list */}
      <div style={{
        width: 440,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {campaigns.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
            <div className="empty-state-icon">📜</div>
            <div className="empty-state-title">Noch keine Kampagnen</div>
            <div className="empty-state-desc">Erstelle deine erste Kampagne und leg los</div>
          </div>
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
              Zuletzt verwendet
            </div>
            {campaigns.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  onClick={() => setActiveCampaign(c.id)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-3)',
                    padding: 'var(--sp-3) var(--sp-4)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background var(--transition)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 24 }}>🗺️</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Zuletzt: {new Date(c.lastOpened).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                </button>
                <button
                  title="Kampagne duplizieren"
                  onClick={() => handleDuplicate(c.id)}
                  disabled={duplicating === c.id}
                  style={{
                    padding: 'var(--sp-2) var(--sp-3)',
                    marginRight: 'var(--sp-2)',
                    background: 'none',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                    opacity: duplicating === c.id ? 0.5 : 1,
                  }}
                >
                  {duplicating === c.id ? '…' : '📋'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create new */}
        <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
          {creating ? (
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                className="input"
                autoFocus
                placeholder="Kampagnen-Name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
              />
              <button className="btn btn-primary" onClick={handleCreate}>Erstellen</button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setCreating(true)}
            >
              + Neue Kampagne
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
