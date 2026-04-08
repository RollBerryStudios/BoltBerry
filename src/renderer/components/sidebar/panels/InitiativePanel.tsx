import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useInitiativeStore } from '../../../stores/initiativeStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'
import { useTokenStore } from '../../../stores/tokenStore'

const FACTION_COLORS: Record<string, string> = {
  enemy: '#ef4444',
  neutral: '#f59e0b',
  friendly: '#3b82f6',
  party: '#22c55e',
}

function broadcastInitiative() {
  if (useUIStore.getState().sessionMode === 'prep') return
  const { entries } = useInitiativeStore.getState()
  window.electronAPI?.sendInitiative(
    entries.map((e) => ({ name: e.combatantName, roll: e.roll, current: e.currentTurn }))
  )
}

export function InitiativePanel() {
  const { t } = useTranslation()
  const { entries, round, addEntry, removeEntry, updateEntry, sortEntries, nextTurn, resetCombat } = useInitiativeStore()
  const { activeMapId } = useCampaignStore()
  const tokens = useTokenStore((s) => s.tokens)
  const [name, setName] = useState('')
  const [roll, setRoll] = useState('')
  const [editingRollId, setEditingRollId] = useState<number | null>(null)
  const [editRollValue, setEditRollValue] = useState('')
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const mapTokens = tokens

  const filteredTokens = name.trim()
    ? mapTokens.filter((t) => t.name.toLowerCase().includes(name.toLowerCase()))
    : mapTokens

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) && nameInputRef.current && !nameInputRef.current.contains(e.target as Node)) {
        setSuggestionsVisible(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectToken(tokenId: number) {
    const token = mapTokens.find((t) => t.id === tokenId)
    if (token) {
      setName(token.name)
      setSelectedTokenId(token.id)
      if (token.ac != null && !roll) {
        setRoll('')
      }
      setSuggestionsVisible(false)
    }
  }

  function handleNameChange(val: string) {
    setName(val)
    setSelectedTokenId(null)
    setSuggestionsVisible(val.length > 0)
  }

  async function handleAdd() {
    if (!name.trim() || !activeMapId || !window.electronAPI) return
    const rollVal = parseInt(roll) || 0
    const tokenId = selectedTokenId
    try {
      const result = await window.electronAPI.dbRun(
        `INSERT INTO initiative (map_id, combatant_name, roll, token_id) VALUES (?, ?, ?, ?)`,
        [activeMapId, name.trim(), rollVal, tokenId]
      )
      addEntry({
        id: result.lastInsertRowid,
        mapId: activeMapId,
        combatantName: name.trim(),
        roll: rollVal,
        currentTurn: entries.length === 0,
        tokenId,
      })
      setName('')
      setRoll('')
      setSelectedTokenId(null)
      setSuggestionsVisible(false)
      broadcastInitiative()
    } catch (err) {
      console.error('[InitiativePanel] handleAdd failed:', err)
    }
  }

  function handleSort() {
    sortEntries()
    broadcastInitiative()
  }

  function handleNextTurn() {
    nextTurn()
    broadcastInitiative()
  }

  function handleReset() {
    resetCombat()
    broadcastInitiative()
    if (activeMapId && window.electronAPI) {
      window.electronAPI.dbRun('DELETE FROM initiative WHERE map_id = ?', [activeMapId]).catch((err: unknown) => {
        console.error('[InitiativePanel] reset delete failed:', err)
      })
    }
  }

  function startEditRoll(entryId: number, currentRoll: number) {
    setEditingRollId(entryId)
    setEditRollValue(String(currentRoll))
  }

  async function commitEditRoll(entryId: number) {
    const newRoll = parseInt(editRollValue)
    if (isNaN(newRoll)) {
      setEditingRollId(null)
      return
    }
    updateEntry(entryId, { roll: newRoll })
    try {
      await window.electronAPI?.dbRun('UPDATE initiative SET roll = ? WHERE id = ?', [newRoll, entryId])
      broadcastInitiative()
    } catch (err) {
      console.error('[InitiativePanel] commitEditRoll failed:', err)
    }
    setEditingRollId(null)
  }

  function getTokenFactionColor(tokenId: number | null): string | null {
    if (tokenId == null) return null
    const token = mapTokens.find((t) => t.id === tokenId)
    if (!token) return null
    return token.markerColor ?? FACTION_COLORS[token.faction] ?? null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sidebar-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
          <div className="sidebar-section-title">{t('initiative.title', { round })}</div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
              onClick={handleSort}
              title="Sortieren"
            >
              ↕ Sortieren
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
              onClick={handleNextTurn}
              title="Nächster Kämpfer [N]"
            >
              ▶ Weiter
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', color: 'var(--danger)' }}
              onClick={handleReset}
              title="Kampf beenden"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Add entry */}
        <div style={{ display: 'flex', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)', position: 'relative' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              ref={nameInputRef}
              className="input"
              placeholder={t('initiative.namePlaceholder')}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => { if (name.length > 0 && filteredTokens.length > 0) setSuggestionsVisible(true) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') setSuggestionsVisible(false)
              }}
              style={{ width: '100%' }}
            />
            {suggestionsVisible && filteredTokens.length > 0 && (
              <div
                ref={suggestionsRef}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  maxHeight: 150,
                  overflowY: 'auto',
                  zIndex: 1000,
                }}
              >
                {filteredTokens.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => selectToken(token.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '4px 8px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: token.markerColor ?? FACTION_COLORS[token.faction] ?? '#22c55e',
                      flexShrink: 0,
                    }} />
                    {token.name}
                    {token.hpMax > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 'auto' }}>HP {token.hpCurrent}/{token.hpMax}</span>}
                    {token.ac != null && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 4 }}>AC {token.ac}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            className="input"
            placeholder={t('initiative.rollPlaceholder')}
            type="number"
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{ width: 52 }}
          />
          <button className="btn btn-primary btn-icon" onClick={handleAdd}>+</button>
        </div>
      </div>

      {/* Combatant list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
            <div className="empty-state-icon" style={{ fontSize: 32 }}>⚔️</div>
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>{t('initiative.noCombat')}</div>
          </div>
        ) : (
          entries.map((entry) => {
            const dotColor = getTokenFactionColor(entry.tokenId)
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-2)',
                  padding: 'var(--sp-2) var(--sp-4)',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: entry.currentTurn ? 'var(--accent-dim)' : 'transparent',
                  borderLeft: entry.currentTurn ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                {editingRollId === entry.id ? (
                  <input
                    autoFocus
                    type="number"
                    value={editRollValue}
                    onChange={(e) => setEditRollValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEditRoll(entry.id)
                      if (e.key === 'Escape') setEditingRollId(null)
                    }}
                    onBlur={() => commitEditRoll(entry.id)}
                    style={{
                      width: 32,
                      background: '#182130',
                      border: '1px solid #2F6BFF',
                      borderRadius: 3,
                      color: '#F4F6FA',
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 4px',
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => startEditRoll(entry.id, entry.roll)}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      minWidth: 20,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                    title="Doppelklick zum Bearbeiten"
                  >
                    {entry.roll}
                  </span>
                )}
                {dotColor && (
                  <span style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }} />
                )}
                <span style={{
                  flex: 1,
                  fontSize: 'var(--text-sm)',
                  fontWeight: entry.currentTurn ? 600 : 400,
                  color: entry.currentTurn ? 'var(--accent-light)' : 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {entry.currentTurn ? '▶ ' : ''}{entry.combatantName}
                </span>
                <button
                  className="btn btn-ghost btn-icon"
                  style={{ fontSize: 10, padding: 2 }}
                  title={t('initiative.removeEntry') ?? '✕'}
                  aria-label={t('initiative.removeEntry') ?? '✕'}
                  onClick={() => {
                    window.electronAPI?.dbRun('DELETE FROM initiative WHERE id = ?', [entry.id])
                    removeEntry(entry.id)
                    broadcastInitiative()
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}