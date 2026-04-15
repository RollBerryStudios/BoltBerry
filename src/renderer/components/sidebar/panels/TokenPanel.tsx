import React, { useState, useRef, useEffect } from 'react'
import { useTokenStore } from '../../../stores/tokenStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useInitiativeStore } from '../../../stores/initiativeStore'
import { useImageUrl } from '../../../hooks/useImageUrl'
import { invalidateImageCache } from '../../../hooks/useImage'
import { invalidateImageUrlCache } from '../../../hooks/useImageUrl'
import type { TokenRecord } from '@shared/ipc-types'

const LIGHT_COLORS = [
  { id: 'warm',  hex: '#ffcc44' },
  { id: 'cool',  hex: '#4488ff' },
  { id: 'white', hex: '#ffffff' },
  { id: 'green', hex: '#44ff88' },
]

const TOKEN_TEMPLATES = [
  { name: 'Goblin',   hp: 7,   ac: 15, size: 1, faction: 'enemy' as const },
  { name: 'Ork',     hp: 15,  ac: 13, size: 1, faction: 'enemy' as const },
  { name: 'Skelett', hp: 13,  ac: 13, size: 1, faction: 'enemy' as const },
  { name: 'Zombie',   hp: 22,  ac: 8,  size: 1, faction: 'enemy' as const },
  { name: 'Wolf',     hp: 11,  ac: 13, size: 1, faction: 'enemy' as const },
  { name: 'Bandit',   hp: 11,  ac: 12, size: 1, faction: 'enemy' as const },
  { name: 'Soldat',   hp: 16,  ac: 16, size: 1, faction: 'enemy' as const },
  { name: 'Magier',   hp: 40,  ac: 12, size: 1, faction: 'enemy' as const },
  { name: 'Drache',   hp: 200, ac: 19, size: 4, faction: 'enemy' as const },
]


const STATUS_EFFECTS = [
  { id: 'blinded',       icon: '🫣', label: 'Blind' },
  { id: 'charmed',       icon: '💫', label: 'Bezaubert' },
  { id: 'dead',          icon: '💀', label: 'Tot' },
  { id: 'deafened',      icon: '🔇', label: 'Taub' },
  { id: 'exhausted',     icon: '😫', label: 'Erschöpft' },
  { id: 'frightened',    icon: '😱', label: 'Verängstigt' },
  { id: 'grappled',      icon: '🤛', label: 'Gepackt' },
  { id: 'incapacitated', icon: '😵', label: 'Kampfunfähig' },
  { id: 'invisible',     icon: '👻', label: 'Unsichtbar' },
  { id: 'paralyzed',     icon: '⚡', label: 'Gelähmt' },
  { id: 'petrified',     icon: '🪨', label: 'Versteinert' },
  { id: 'poisoned',      icon: '☠️', label: 'Vergiftet' },
  { id: 'prone',         icon: '⬇️', label: 'Liegend' },
  { id: 'restrained',    icon: '⛓️', label: 'Gefesselt' },
  { id: 'stunned',       icon: '⭐', label: 'Betäubt' },
  { id: 'unconscious',   icon: '💤', label: 'Bewusstlos' },
  { id: 'advantage',     icon: '▲', label: 'Vorteil' },
  { id: 'disadvantage',  icon: '▼', label: 'Nachteil' },
  { id: 'concentrating', icon: '🎯', label: 'Konzentration' },
  { id: 'blessed',       icon: '✨', label: 'Gesegnet' },
  { id: 'cursed',        icon: '🔮', label: 'Verflucht' },
  { id: 'hasted',        icon: '⚡', label: 'Gehetzt' },
]

function SectionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-1)',
        width: '100%',
        background: 'none',
        border: 'none',
        borderTop: '1px solid var(--border-subtle)',
        padding: 'var(--sp-2) 0',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      {title}
    </button>
  )
}

export function TokenPanel() {
  const { tokens, addToken, updateToken, removeToken } = useTokenStore()
  const { selectedTokenId, setSelectedToken } = useUIStore()
  const { activeMapId } = useCampaignStore()

  const selected = tokens.find((t) => t.id === selectedTokenId) ?? null

  const [secKampf, setSecKampf]       = useState(true)
  const [secAussehen, setSecAussehen] = useState(false)
  const [secLicht, setSecLicht]       = useState(false)
  const [secStatus, setSecStatus]     = useState(true)
  const [secNotizen, setSecNotizen]   = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const templateRef = useRef<HTMLDivElement>(null)

  async function handleAddToken() {
    if (!activeMapId || !window.electronAPI) return
    try {
      const asset = await window.electronAPI.importFile('token', activeMapId)
      if (!asset) return  // user cancelled the dialog
      const result = await window.electronAPI.dbRun(
        `INSERT INTO tokens (map_id, name, image_path, x, y, faction, show_name, light_radius, light_color) VALUES (?, ?, ?, ?, ?, 'party', 1, 0, '#ffcc44')`,
        [activeMapId, 'Token', asset?.path ?? null, 100, 100]
      )
      const token: TokenRecord = {
        id: result.lastInsertRowid,
        mapId: activeMapId,
        name: 'Token',
        imagePath: asset?.path ?? null,
        x: 100,
        y: 100,
        size: 1,
        hpCurrent: 0,
        hpMax: 0,
        visibleToPlayers: true,
        rotation: 0,
        locked: false,
        zIndex: 0,
        markerColor: null,
        ac: null,
        notes: null,
        statusEffects: null,
        faction: 'party',
        showName: true,
        lightRadius: 0,
        lightColor: '#ffcc44',
      }
      addToken(token)
      setSelectedToken(token.id)
      broadcastTokensFromPanel()
    } catch (err) {
      console.error('[TokenPanel] handleAddToken failed:', err)
    }
  }

  async function handleAddFromTemplate(template: typeof TOKEN_TEMPLATES[number] | null) {
    if (!activeMapId || !window.electronAPI) return
    setShowTemplates(false)
    try {
      const asset = await window.electronAPI.importFile('token', activeMapId)
      const name = template ? template.name : 'Token'
      const hp = template ? template.hp : 0
      const ac = template ? template.ac : null
      const size = template ? template.size : 1
      const faction = template ? template.faction : 'party'
      const result = await window.electronAPI.dbRun(
        `INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, ac, faction, visible_to_players, show_name, light_radius, light_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, '#ffcc44')`,
        [activeMapId, name, asset?.path ?? null, 100, 100, size, hp, hp, ac, faction]
      )
      const token: TokenRecord = {
        id: result.lastInsertRowid,
        mapId: activeMapId,
        name,
        imagePath: asset?.path ?? null,
        x: 100,
        y: 100,
        size,
        hpCurrent: hp,
        hpMax: hp,
        visibleToPlayers: true,
        rotation: 0,
        locked: false,
        zIndex: 0,
        markerColor: null,
        ac,
        notes: null,
        statusEffects: null,
        faction,
        showName: true,
        lightRadius: 0,
        lightColor: '#ffcc44',
      }
      addToken(token)
      setSelectedToken(token.id)
      broadcastTokensFromPanel()
    } catch (err) {
      console.error('[TokenPanel] handleAddFromTemplate failed:', err)
    }
  }

  async function handleUpdate(id: number, patch: Partial<TokenRecord>) {
    updateToken(id, patch)
    if (patch.imagePath) {
      invalidateImageCache(`file://${patch.imagePath}`)
      invalidateImageUrlCache(patch.imagePath)
    }
    try {
      for (const [key, val] of Object.entries(patch)) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        let dbVal: unknown = val
        if (key === 'statusEffects') {
          dbVal = Array.isArray(val) && (val as string[]).length > 0 ? JSON.stringify(val) : null
        } else if (key === 'visibleToPlayers' || key === 'locked') {
          dbVal = val ? 1 : 0
        } else if (val === null || val === undefined) {
          dbVal = null
        }
        await window.electronAPI?.dbRun(`UPDATE tokens SET ${col} = ? WHERE id = ?`, [dbVal, id])
      }
      broadcastTokensFromPanel()
    } catch (err) {
      console.error('[TokenPanel] handleUpdate failed:', err)
    }
  }

  function toggleStatusEffect(tokenId: number, effectId: string, current: string[] | null) {
    const effects = current ? [...current] : []
    const idx = effects.indexOf(effectId)
    if (idx >= 0) effects.splice(idx, 1)
    else effects.push(effectId)
    handleUpdate(tokenId, { statusEffects: effects.length > 0 ? effects : null })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Add token button */}
      <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
          onClick={handleAddToken}
          disabled={!activeMapId}
        >
          + Token hinzufügen
        </button>
      </div>
      {/* Token list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Schnellerstellung (always visible) ── */}
        <div ref={templateRef} style={{ padding: 'var(--sp-2) var(--sp-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--sp-1)' }}>
            ⚡ Schnellerstellung
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TOKEN_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                disabled={!activeMapId}
                title={`${tmpl.name} — HP ${tmpl.hp}, RK ${tmpl.ac}${tmpl.size > 1 ? `, ${tmpl.size}×${tmpl.size}` : ''}`}
                onClick={() => handleAddFromTemplate(tmpl)}
                style={{
                  padding: '2px 8px',
                  fontSize: 'var(--text-xs)',
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 99,
                  color: 'var(--text-secondary)',
                  cursor: activeMapId ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (activeMapId) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
              >
                {tmpl.name}
              </button>
            ))}
            <button
              disabled={!activeMapId}
              title="Leeres Token (Bild wählen)"
              onClick={() => handleAddFromTemplate(null)}
              style={{
                padding: '2px 8px',
                fontSize: 'var(--text-xs)',
                background: 'none',
                border: '1px dashed var(--border)',
                borderRadius: 99,
                color: 'var(--text-muted)',
                cursor: activeMapId ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (activeMapId) e.currentTarget.style.background = 'var(--bg-overlay)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              + Eigenes…
            </button>
          </div>
        </div>

        {tokens.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
            <div className="empty-state-icon" style={{ fontSize: 32 }}>⬤</div>
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Keine Token</div>
            <div className="empty-state-desc" style={{ fontSize: 'var(--text-xs)' }}>
              Token hinzufügen und auf der Karte platzieren
            </div>
          </div>
        ) : (
          tokens.map((token) => (
            <div
              key={token.id}
              onClick={() => setSelectedToken(token.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-2) var(--sp-4)',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                background: selectedTokenId === token.id ? 'var(--accent-blue-dim)' : 'transparent',
                borderLeft: selectedTokenId === token.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
              }}
            >
              {/* Token preview */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, overflow: 'hidden', flexShrink: 0,
              }}>
                {token.imagePath
                  ? <TokenThumbnail path={token.imagePath} />
                  : '⬤'}
              </div>

              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {token.name}
                </div>
                {token.hpMax > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.max(0, (token.hpCurrent / token.hpMax) * 100)}%`,
                        background: token.hpCurrent / token.hpMax > 0.5 ? 'var(--hp-high)' : token.hpCurrent / token.hpMax > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)',
                        borderRadius: 2, transition: 'width var(--transition)',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>
                      {token.hpCurrent}/{token.hpMax}
                    </span>
                  </div>
                )}
                {/* Status effect icons in list */}
                {token.statusEffects && token.statusEffects.length > 0 && (
                  <div style={{ fontSize: 10, marginTop: 2, letterSpacing: 1 }}>
                    {token.statusEffects.slice(0, 6).map((id) =>
                      STATUS_EFFECTS.find((e) => e.id === id)?.icon ?? ''
                    ).join(' ')}
                  </div>
                )}
              </div>

              <span style={{ fontSize: 10, color: token.visibleToPlayers ? 'var(--success)' : 'var(--text-muted)' }}>
                {token.visibleToPlayers ? '👁' : '🙈'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Selected token detail */}
      {selected && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
          overflowY: 'auto',
          maxHeight: '65%',
        }}>
          <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
            Token bearbeiten
          </div>

          {/* Name (always visible) */}
          <input
            className="input"
            value={selected.name}
            onChange={(e) => handleUpdate(selected.id, { name: e.target.value })}
            placeholder="Name"
            style={{ marginBottom: 'var(--sp-2)' }}
          />

          {/* ── Kampf ────────────────────────────────────────────────── */}
          <SectionHeader title="Kampf" open={secKampf} onToggle={() => setSecKampf((v) => !v)} />
          {secKampf && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' }}>
              {/* HP */}
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <input className="input" type="number" min={0} value={selected.hpCurrent}
                  onChange={(e) => handleUpdate(selected.id, { hpCurrent: Math.max(0, parseInt(e.target.value) || 0) })}
                  placeholder="HP aktuell" />
                <input className="input" type="number" min={0} value={selected.hpMax}
                  onChange={(e) => handleUpdate(selected.id, { hpMax: Math.max(0, parseInt(e.target.value) || 0) })}
                  placeholder="HP max" />
              </div>
              {/* Size presets (D&D 5e grid squares) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Größe</label>
                <div style={{ display: 'flex', gap: 3 }}>
                  {([
                    { label: '1×1', title: 'Klein/Mittel (1 Feld)', size: 1 },
                    { label: '2×2', title: 'Groß (Large)',           size: 2 },
                    { label: '3×3', title: 'Riesig (Huge)',          size: 3 },
                    { label: '4×4', title: 'Kolossal (Gargantuan)', size: 4 },
                  ] as { label: string; title: string; size: number }[]).map(({ label, title, size }) => (
                    <button
                      key={size}
                      title={title}
                      onClick={() => handleUpdate(selected.id, { size })}
                      style={{
                        flex: 1,
                        padding: '3px 0',
                        fontSize: 10,
                        fontWeight: selected.size === size ? 700 : 400,
                        background: selected.size === size ? 'var(--accent-blue-dim)' : 'var(--bg-overlay)',
                        border: selected.size === size ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                        borderRadius: 3,
                        color: selected.size === size ? 'var(--accent-blue-light)' : 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* AC + visibility */}
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>RK</label>
                <input className="input" type="number"
                  value={selected.ac ?? ''}
                  onChange={(e) => handleUpdate(selected.id, { ac: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="–" style={{ width: 52 }} />
                <button
                  className="btn btn-ghost"
                  title={selected.visibleToPlayers ? 'Für Spieler sichtbar' : 'Für Spieler unsichtbar'}
                  aria-label={selected.visibleToPlayers ? 'Token verstecken' : 'Token sichtbar machen'}
                  style={{ fontSize: 'var(--text-xs)', marginLeft: 'auto' }}
                  onClick={() => handleUpdate(selected.id, { visibleToPlayers: !selected.visibleToPlayers })}
                >
                  {selected.visibleToPlayers ? '👁' : '🙈'}
                </button>
              </div>
              {/* Faction selector */}
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Fraktion</label>
                <select className="input" value={selected.faction}
                  onChange={(e) => handleUpdate(selected.id, { faction: e.target.value })}
                  style={{ width: 'auto' }}>
                  <option value="party">🟢 Spieler</option>
                  <option value="enemy">🔴 Gegner</option>
                  <option value="neutral">🟡 Neutral</option>
                  <option value="friendly">🔵 Freundlich</option>
                </select>
              </div>
              {/* Quick initiative add */}
              <AddToInitiativeButton token={selected} mapId={activeMapId} />
            </div>
          )}

          {/* ── Status-Effekte ───────────────────────────────────────── */}
          <SectionHeader title="Status-Effekte" open={secStatus} onToggle={() => setSecStatus((v) => !v)} />
          {secStatus && (
            <div style={{ paddingBottom: 'var(--sp-2)' }}>
              {/* Filter input */}
              <input
                className="input"
                placeholder="Filter…"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ marginBottom: 6, fontSize: 'var(--text-xs)', padding: '3px 8px', height: 24 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {STATUS_EFFECTS
                  .filter((eff) => !statusFilter || eff.label.toLowerCase().includes(statusFilter.toLowerCase()))
                  .map((eff) => (
                    <button
                      key={eff.id}
                      title={eff.label}
                      onClick={() => toggleStatusEffect(selected.id, eff.id, selected.statusEffects)}
                      style={{
                        width: 30, height: 30, borderRadius: 'var(--radius)',
                        background: selected.statusEffects?.includes(eff.id) ? 'var(--accent-blue-dim)' : 'var(--bg-overlay)',
                        border: selected.statusEffects?.includes(eff.id) ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {eff.icon}
                    </button>
                  ))}
              </div>
              {selected.statusEffects && selected.statusEffects.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  {selected.statusEffects.map((id) =>
                    STATUS_EFFECTS.find((e) => e.id === id)?.label
                  ).filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* ── Aussehen ─────────────────────────────────────────────── */}
          <SectionHeader title="Aussehen" open={secAussehen} onToggle={() => setSecAussehen((v) => !v)} />
          {secAussehen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' }}>
              {/* Replace image */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-xs)', width: '100%' }}
                onClick={async () => {
                  if (!window.electronAPI) return
                  const asset = await window.electronAPI.importFile('token')
                  if (asset?.path) handleUpdate(selected.id, { imagePath: asset.path })
                }}
              >
                🖼 Bild ersetzen
              </button>
              {/* Rotation + lock */}
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>°</label>
                <input className="input" type="number" min={0} max={359} step={45}
                  value={selected.rotation}
                  onChange={(e) => handleUpdate(selected.id, { rotation: parseInt(e.target.value) || 0 })}
                  style={{ width: 64 }} />
                <button
                  className="btn btn-ghost btn-icon"
                  title={selected.locked ? 'Gesperrt' : 'Entsperrt'}
                  aria-label={selected.locked ? 'Token entsperren' : 'Token sperren'}
                  style={{ fontSize: 'var(--text-xs)', color: selected.locked ? 'var(--warning)' : undefined }}
                  onClick={() => handleUpdate(selected.id, { locked: !selected.locked })}
                >
                  {selected.locked ? '🔒' : '🔓'}
                </button>
              </div>
              {/* Marker ring */}
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Ring</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[null, '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'].map((color) => (
                    <button
                      key={color ?? 'none'}
                      title={color ?? 'Kein Ring'}
                      onClick={() => handleUpdate(selected.id, { markerColor: color })}
                      style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: color ?? 'transparent',
                        border: selected.markerColor === color
                          ? '2px solid var(--text-primary)'
                          : color ? '1px solid rgba(255,255,255,0.3)' : '1px solid var(--border)',
                        cursor: 'pointer', padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Licht ──────────────────────────────────────────────────── */}
          <SectionHeader title="Licht" open={secLicht} onToggle={() => setSecLicht((v) => !v)} />
          {secLicht && (() => {
            const lightOn = selected.lightRadius > 0
            const radius = selected.lightRadius || 5
            const color = selected.lightColor || '#ffcc44'
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--text-xs)', flex: 1, justifyContent: 'center',
                      background: lightOn ? 'var(--accent-blue-dim)' : undefined,
                      border: lightOn ? '1px solid var(--accent-blue)' : undefined,
                    }}
                    onClick={() => handleUpdate(selected.id, { lightRadius: lightOn ? 0 : 5, lightColor: color })}
                  >
                    💡 Lichtquelle {lightOn ? 'an' : 'aus'}
                  </button>
                </div>
                {lightOn && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 80 }}>Radius (Felder)</label>
                      <input
                        type="range" min={1} max={30}
                        value={radius}
                        onChange={(e) => handleUpdate(selected.id, { lightRadius: parseInt(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>{radius}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 80 }}>Farbe</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {LIGHT_COLORS.map((c) => (
                          <button
                            key={c.id}
                            title={c.id}
                            onClick={() => handleUpdate(selected.id, { lightColor: c.hex })}
                            style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: c.hex,
                              border: color === c.hex ? '2px solid var(--text-primary)' : '1px solid rgba(255,255,255,0.3)',
                              cursor: 'pointer', padding: 0,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      <span style={{ color, textShadow: `0 0 6px ${color}` }}>○</span> Radius {radius} Felder
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          {/* ── Notizen ──────────────────────────────────────────────── */}
          <SectionHeader title="Notizen" open={secNotizen} onToggle={() => setSecNotizen((v) => !v)} />
          {secNotizen && (
            <div style={{ paddingBottom: 'var(--sp-2)' }}>
              <textarea
                className="input"
                value={selected.notes ?? ''}
                onChange={(e) => handleUpdate(selected.id, { notes: e.target.value || null })}
                placeholder="Notizen zum Token…"
                rows={3}
                style={{ resize: 'none', fontSize: 'var(--text-xs)', width: '100%' }}
              />
            </div>
          )}

          <button
            className="btn btn-danger"
            style={{ fontSize: 'var(--text-xs)', justifyContent: 'center', marginTop: 'var(--sp-2)', width: '100%' }}
            onClick={async () => {
              if (!window.electronAPI) return
              const confirmed = await window.electronAPI.deleteTokenConfirm(selected.name)
              if (!confirmed) return
              removeToken(selected.id)
              setSelectedToken(null)
              try {
                await window.electronAPI.dbRun('DELETE FROM tokens WHERE id = ?', [selected.id])
                broadcastTokensFromPanel()
              } catch (err) {
                console.error('[TokenPanel] delete failed:', err)
              }
            }}
          >
            Token löschen
          </button>
        </div>
      )}

    </div>
  )
}

function broadcastTokensFromPanel() {
  if (useUIStore.getState().sessionMode === 'prep') return
  const tokens = useTokenStore.getState().tokens
  const visible = tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) => ({
      id: t.id,
      name: t.name,
      imagePath: t.imagePath,
      x: t.x,
      y: t.y,
      size: t.size,
      hpCurrent: t.hpCurrent,
      hpMax: t.hpMax,
      showName: t.showName,
      rotation: t.rotation,
      markerColor: t.markerColor,
      statusEffects: t.statusEffects,
      ac: t.ac,
      faction: t.faction,
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}

function TokenThumbnail({ path }: { path: string }) {
  const url = useImageUrl(path)
  if (!url) return null
  return <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
}

// ─── Add to Initiative Button ─────────────────────────────────────────────────

function AddToInitiativeButton({ token, mapId }: { token: TokenRecord; mapId: number | null }) {
  const entries = useInitiativeStore((s) => s.entries)
  const alreadyIn = entries.some((e) => e.tokenId === token.id || e.combatantName === token.name)

  async function handleAdd() {
    if (!mapId || !window.electronAPI) return
    try {
      const result = await window.electronAPI.dbRun(
        'INSERT INTO initiative (map_id, combatant_name, roll, token_id) VALUES (?, ?, 0, ?)',
        [mapId, token.name, token.id]
      )
      useInitiativeStore.getState().addEntry({
        id: result.lastInsertRowid,
        mapId,
        combatantName: token.name,
        roll: 0,
        currentTurn: false,
        tokenId: token.id,
        effectTimers: null,
      })
      // Switch to initiative tab so user can set the roll
      useUIStore.getState().setSidebarTab('initiative')
    } catch (err) {
      console.error('[TokenPanel] addToInitiative failed:', err)
    }
  }

  if (alreadyIn) {
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--success)' }}>✓</span> In Initiative
      </div>
    )
  }

  return (
    <button
      className="btn btn-ghost"
      style={{ fontSize: 'var(--text-xs)', justifyContent: 'flex-start', gap: 6 }}
      onClick={handleAdd}
      disabled={!mapId}
      title="Token zur Initiative hinzufügen und Initiative-Tab öffnen"
    >
      ⚔️ Zur Initiative hinzufügen
    </button>
  )
}
