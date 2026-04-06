import { useState } from 'react'
import { useInitiativeStore } from '../../../stores/initiativeStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'

function broadcastInitiative() {
  if (useUIStore.getState().sessionMode === 'prep') return
  const { entries } = useInitiativeStore.getState()
  window.electronAPI?.sendInitiative(
    entries.map((e) => ({ name: e.combatantName, roll: e.roll, current: e.currentTurn }))
  )
}

export function InitiativePanel() {
  const { entries, round, addEntry, removeEntry, nextTurn, resetCombat } = useInitiativeStore()
  const { activeMapId } = useCampaignStore()
  const [name, setName] = useState('')
  const [roll, setRoll] = useState('')

  async function handleAdd() {
    if (!name.trim() || !activeMapId || !window.electronAPI) return
    const rollVal = parseInt(roll) || 0
    try {
      const result = await window.electronAPI.dbRun(
        `INSERT INTO initiative (map_id, combatant_name, roll) VALUES (?, ?, ?)`,
        [activeMapId, name.trim(), rollVal]
      )
      addEntry({
        id: result.lastInsertRowid,
        mapId: activeMapId,
        combatantName: name.trim(),
        roll: rollVal,
        currentTurn: entries.length === 0,
      })
      setName('')
      setRoll('')
      broadcastInitiative()
    } catch (err) {
      console.error('[InitiativePanel] handleAdd failed:', err)
    }
  }

  function handleNextTurn() {
    nextTurn()
    broadcastInitiative()
  }

  function handleReset() {
    resetCombat()
    broadcastInitiative()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sidebar-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
          <div className="sidebar-section-title">Initiative – Runde {round}</div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
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
        <div style={{ display: 'flex', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}>
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="input"
            placeholder="Init"
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
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Kein Kampf aktiv</div>
          </div>
        ) : (
          entries.map((entry) => (
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
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                minWidth: 20,
                fontFamily: 'var(--font-mono)',
              }}>
                {entry.roll}
              </span>
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
                title="Aus Initiative entfernen"
                aria-label="Aus Initiative entfernen"
                onClick={() => {
                  window.electronAPI?.dbRun('DELETE FROM initiative WHERE id = ?', [entry.id])
                  removeEntry(entry.id)
                  broadcastInitiative()
                }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
