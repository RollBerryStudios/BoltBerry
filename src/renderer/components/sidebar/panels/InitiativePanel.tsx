import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useInitiativeStore } from '../../../stores/initiativeStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'
import { useTokenStore } from '../../../stores/tokenStore'
import { useUndoStore, nextCommandId } from '../../../stores/undoStore'

const FACTION_COLORS: Record<string, string> = {
  enemy: '#ef4444',
  neutral: '#f59e0b',
  friendly: '#3b82f6',
  party: '#22c55e',
}

const COMBAT_ICONS: Record<string, string> = {
  advantage: '▲', disadvantage: '▼', concentrating: '🎯',
  blessed: '✨', cursed: '🔮', hasted: '⚡',
  blinded: '🫣', charmed: '💫', dead: '💀',
  frightened: '😱', grappled: '🤛', incapacitated: '😵',
  invisible: '👻', paralyzed: '⚡', petrified: '🪨',
  poisoned: '☠️', prone: '⬇️', restrained: '⛓️',
  stunned: '⭐', unconscious: '💤', exhausted: '😫',
  deafened: '🔇',
}

function broadcastInitiative() {
  if (useUIStore.getState().sessionMode === 'prep') return
  const { entries } = useInitiativeStore.getState()
  window.electronAPI?.sendInitiative(
    entries.map((e) => ({ name: e.combatantName, roll: e.roll, current: e.currentTurn }))
  )
}

function broadcastTokensFromInitiative() {
  if (useUIStore.getState().sessionMode === 'prep') return
  const tokens = useTokenStore.getState().tokens
  const visible = tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) => ({
      id: t.id, name: t.name, imagePath: t.imagePath,
      x: t.x, y: t.y, size: t.size,
      hpCurrent: t.hpCurrent, hpMax: t.hpMax,
      showName: t.showName, rotation: t.rotation,
      markerColor: t.markerColor, statusEffects: t.statusEffects,
      ac: t.ac, faction: t.faction,
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}

async function quickTokenUpdate(tokenId: number, updates: Record<string, any>) {
  const { updateToken } = useTokenStore.getState()
  const token = useTokenStore.getState().tokens.find((t) => t.id === tokenId)
  if (!token) return
  const oldValues: Record<string, any> = {}
  for (const key of Object.keys(updates)) {
    oldValues[key] = (token as any)[key]
  }
  updateToken(tokenId, updates)
  const cols = Object.keys(updates).map((k) => {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase()
    return `${col} = ?`
  }).join(', ')
  const vals = Object.values(updates).map((v) => typeof v === 'boolean' ? (v ? 1 : 0) : v)
  await window.electronAPI?.dbRun(`UPDATE tokens SET ${cols} WHERE id = ?`, [...vals, tokenId])
  broadcastTokensFromInitiative()
  useUndoStore.getState().pushCommand({
    id: nextCommandId(),
    label: `Token ${Object.keys(updates).join(', ')}`,
    undo: async () => {
      updateToken(tokenId, oldValues)
      const undoCols = Object.keys(oldValues).map((k) => {
        const col = k.replace(/([A-Z])/g, '_$1').toLowerCase()
        return `${col} = ?`
      }).join(', ')
      const undoVals = Object.values(oldValues).map((v) => typeof v === 'boolean' ? (v ? 1 : 0) : v)
      await window.electronAPI?.dbRun(`UPDATE tokens SET ${undoCols} WHERE id = ?`, [...undoVals, tokenId])
      broadcastTokensFromInitiative()
    },
    redo: async () => {
      updateToken(tokenId, updates)
      await window.electronAPI?.dbRun(`UPDATE tokens SET ${cols} WHERE id = ?`, [...vals, tokenId])
      broadcastTokensFromInitiative()
    },
  })
}

export function InitiativePanel() {
  const { t } = useTranslation()
  const { entries, round, addEntry, removeEntry, updateEntry, reorderEntries, sortEntries, nextTurn, resetCombat, addTimer, removeTimer } = useInitiativeStore()
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const tokens = useTokenStore((s) => s.tokens)
  const [name, setName] = useState('')
  const [roll, setRoll] = useState('')
  const [editingRollId, setEditingRollId] = useState<number | null>(null)
  const [editRollValue, setEditRollValue] = useState('')
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)
  const [timerEntryId, setTimerEntryId] = useState<number | null>(null)
  const [timerEffect, setTimerEffect] = useState('blessed')
  const [timerRounds, setTimerRounds] = useState('10')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const mapTokens = useMemo(() =>
    tokens.filter((t) => t.mapId === activeMapId),
    [tokens, activeMapId]
  )

  const filteredTokens = useMemo(() =>
    name.trim()
      ? mapTokens.filter((t) => t.name.toLowerCase().includes(name.toLowerCase()))
      : mapTokens,
    [mapTokens, name]
  )

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
        effectTimers: null,
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
    // Persist effect timer changes after round boundary
    const { entries } = useInitiativeStore.getState()
    for (const entry of entries) {
      if (entry.effectTimers != null) {
        window.electronAPI?.dbRun('UPDATE initiative SET effect_timers = ? WHERE id = ?', [
          entry.effectTimers.length > 0 ? JSON.stringify(entry.effectTimers) : null,
          entry.id,
        ])
      }
    }
  }

  async function handleReset() {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.confirmDialog(
      'Kampf zurücksetzen?',
      'Alle Initiative-Einträge werden gelöscht. Diese Aktion kann nicht rükgängig gemacht werden.'
    )
    if (!confirmed) return
    resetCombat()
    broadcastInitiative()
    if (activeMapId) {
      window.electronAPI.dbRun('DELETE FROM initiative WHERE map_id = ?', [activeMapId]).catch((err: unknown) => {
        console.error('[InitiativePanel] reset delete failed:', err)
      })
    }
  }

  async function handleAddAllTokens() {
    if (!activeMapId || !window.electronAPI) return
    const existingTokenIds = new Set(entries.map((e) => e.tokenId).filter(Boolean))
    const tokensToAdd = mapTokens.filter((t) => !existingTokenIds.has(t.id))
    if (tokensToAdd.length === 0) return
    for (const token of tokensToAdd) {
      try {
        const result = await window.electronAPI.dbRun(
          'INSERT INTO initiative (map_id, combatant_name, roll, current_turn, token_id) VALUES (?, ?, 0, 0, ?)',
          [activeMapId, token.name, token.id]
        )
        addEntry({
          id: result.lastInsertRowid, mapId: activeMapId,
          combatantName: token.name, roll: 0, currentTurn: false,
          tokenId: token.id, effectTimers: null,
        })
      } catch (err) {
        console.error('[InitiativePanel] handleAddAllTokens failed:', err)
      }
    }
    broadcastInitiative()
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

  const TIMER_PRESETS = [
    { id: 'blessed', label: '✨ Gesegnet' },
    { id: 'cursed', label: '🔮 Verflucht' },
    { id: 'hasted', label: '⚡ Verlangsamt' },
    { id: 'concentrating', label: '🎯 Konzentration' },
    { id: 'advantage', label: '▲ Vorteil' },
    { id: 'disadvantage', label: '▼ Nachteil' },
    { id: 'blinded', label: '🫣 Blind' },
    { id: 'invisible', label: '👻 Unsichtbar' },
    { id: 'charmed', label: '💫 Bezaubert' },
  ]

  function handleAddTimer() {
    if (timerEntryId == null) return
    const rounds = parseInt(timerRounds) || 10
    addTimer(timerEntryId, { effectId: timerEffect, roundsLeft: rounds })
    const { entries } = useInitiativeStore.getState()
    const entry = entries.find((e) => e.id === timerEntryId)
    if (entry) {
      const timers = entry.effectTimers ?? []
      window.electronAPI?.dbRun('UPDATE initiative SET effect_timers = ? WHERE id = ?', [
        JSON.stringify(timers), entry.id,
      ])
    }
    setTimerEntryId(null)
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
              onClick={handleAddAllTokens}
              title={`Alle ${mapTokens.length} Karten-Token zur Initiative hinzufügen`}
              disabled={mapTokens.length === 0}
            >
              ⊕ Alle
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
          entries.map((entry, entryIdx) => {
            const dotColor = getTokenFactionColor(entry.tokenId)
            const linkedToken = entry.tokenId != null ? mapTokens.find((t) => t.id === entry.tokenId) : null
            const hpRatio = linkedToken && linkedToken.hpMax > 0 ? Math.max(0, Math.min(1, linkedToken.hpCurrent / linkedToken.hpMax)) : -1
            const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444'
            const activeEffects = linkedToken?.statusEffects ?? []

            return (
              <div
                key={entry.id}
                draggable
                onDragStart={() => { dragIndexRef.current = entryIdx }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(entryIdx) }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={() => {
                  if (dragIndexRef.current != null && dragIndexRef.current !== entryIdx) {
                    reorderEntries(dragIndexRef.current, entryIdx)
                    broadcastInitiative()
                  }
                  dragIndexRef.current = null
                  setDragOverIndex(null)
                }}
                onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null) }}
                style={{
                  padding: 'var(--sp-2) var(--sp-4)',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: entry.currentTurn ? 'var(--accent-dim)' : 'transparent',
                  borderLeft: entry.currentTurn ? '3px solid var(--accent)' : '3px solid transparent',
                  outline: dragOverIndex === entryIdx ? '1px solid var(--accent-blue)' : undefined,
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
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
                  {linkedToken && linkedToken.ac != null && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      RK{linkedToken.ac}
                    </span>
                  )}
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                    onClick={() => setTimerEntryId(timerEntryId === entry.id ? null : entry.id)}
                    title="Effekt-Timer hinzufügen"
                  >⏱</button>
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

                {linkedToken && linkedToken.hpMax > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${hpRatio * 100}%`,
                        background: hpColor,
                        borderRadius: 2,
                        transition: 'width 0.15s',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 38, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {linkedToken.hpCurrent}/{linkedToken.hpMax}
                    </span>
                    <button
                      style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                      onClick={() => quickTokenUpdate(linkedToken.id, { hpCurrent: Math.min(linkedToken.hpMax, linkedToken.hpCurrent + 5) })}
                      title="+5 HP"
                    >+5</button>
                    <button
                      style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                      onClick={() => quickTokenUpdate(linkedToken.id, { hpCurrent: Math.min(linkedToken.hpMax, linkedToken.hpCurrent + 1) })}
                      title="+1 HP"
                    >+1</button>
                    <button
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                      onClick={() => quickTokenUpdate(linkedToken.id, { hpCurrent: Math.max(0, linkedToken.hpCurrent - 1) })}
                      title="-1 HP"
                    >-1</button>
                    <button
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                      onClick={() => quickTokenUpdate(linkedToken.id, { hpCurrent: Math.max(0, linkedToken.hpCurrent - 5) })}
                      title="-5 HP"
                    >-5</button>
                  </div>
                )}

                {activeEffects.length > 0 && (
                  <div style={{ fontSize: 10, marginTop: 2, letterSpacing: 0.5 }}>
                    {activeEffects.slice(0, 8).map((eff) => (
                      <span key={eff} title={eff} style={{ marginRight: 2 }}>{COMBAT_ICONS[eff] ?? '❓'}</span>
                    ))}
                    {activeEffects.length > 8 && <span style={{ color: 'var(--text-muted)' }}>+{activeEffects.length - 8}</span>}
                  </div>
                )}

                {entry.effectTimers && entry.effectTimers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                    {entry.effectTimers.map((timer) => (
                      <span
                        key={timer.effectId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 9,
                          background: 'var(--bg-overlay)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 3,
                          padding: '1px 4px',
                          color: timer.roundsLeft <= 1 ? '#ef4444' : 'var(--text-muted)',
                        }}
                      >
                        {COMBAT_ICONS[timer.effectId] ?? '❓'} {timer.roundsLeft}R
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 9, padding: 0, lineHeight: 1 }}
                          onClick={() => {
                            removeTimer(entry.id, timer.effectId)
                            const { entries: ents } = useInitiativeStore.getState()
                            const updated = ents.find((e) => e.id === entry.id)
                            const newTimers = updated?.effectTimers?.filter((t) => t.effectId !== timer.effectId) ?? null
                            window.electronAPI?.dbRun('UPDATE initiative SET effect_timers = ? WHERE id = ?', [
                              newTimers && newTimers.length > 0 ? JSON.stringify(newTimers) : null, entry.id,
                            ])
                          }}
                          title="Timer entfernen"
                        >✕</button>
                      </span>
                    ))}
                  </div>
                )}

                {timerEntryId === entry.id && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
                    <select
                      value={timerEffect}
                      onChange={(e) => setTimerEffect(e.target.value)}
                      style={{
                        fontSize: 10,
                        background: 'var(--bg-overlay)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--text-primary)',
                        padding: '1px 4px',
                      }}
                    >
                      {TIMER_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={timerRounds}
                      onChange={(e) => setTimerRounds(e.target.value)}
                      style={{
                        width: 36,
                        fontSize: 10,
                        background: 'var(--bg-overlay)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--text-primary)',
                        padding: '1px 4px',
                        textAlign: 'center',
                      }}
                    />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Runden</span>
                    <button
                      style={{ fontSize: 9, padding: '0 6px', background: 'var(--accent-blue-dim)', border: '1px solid var(--accent-blue)', borderRadius: 3, color: 'var(--text-primary)', cursor: 'pointer' }}
                      onClick={handleAddTimer}
                    >OK</button>
                    <button
                      style={{ fontSize: 9, padding: '0 4px', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 3, color: 'var(--text-muted)', cursor: 'pointer' }}
                      onClick={() => setTimerEntryId(null)}
                    >✕</button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
