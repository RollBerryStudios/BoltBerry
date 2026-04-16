import { useState, useMemo } from 'react'
import { EmptyState } from '../../EmptyState'

interface RollResult {
  dice: string
  rolls: number[]
  kept: number[]
  modifier: number
  total: number
  advantage: 'none' | 'adv' | 'dis'
  timestamp: number
}

const DICE = [4, 6, 8, 10, 12, 20, 100] as const

export function DiceRoller() {
  const [numDice, setNumDice] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [selectedDie, setSelectedDie] = useState(20)
  const [advantage, setAdvantage] = useState<'none' | 'adv' | 'dis'>('none')
  const [history, setHistory] = useState<RollResult[]>([])

  function roll() {
    const baseRolls = Array.from({ length: numDice }, () =>
      Math.floor(Math.random() * selectedDie) + 1
    )
    let allRolls = [...baseRolls]
    let kept = [...baseRolls]

    if (selectedDie === 20 && numDice === 1 && advantage !== 'none') {
      const extra = Math.floor(Math.random() * 20) + 1
      allRolls = [baseRolls[0], extra]
      kept = [advantage === 'adv' ? Math.max(baseRolls[0], extra) : Math.min(baseRolls[0], extra)]
    }

    const total = kept.reduce((a, b) => a + b, 0) + modifier
    const diceName = `${numDice}d${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`

    setHistory((prev) => [{
      dice: diceName,
      rolls: allRolls,
      kept,
      modifier,
      total,
      advantage: selectedDie === 20 ? advantage : 'none',
      timestamp: Date.now(),
    }, ...prev].slice(0, 20))
  }

  const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : String(modifier)) : ''
  const label = `${numDice}d${selectedDie}${modStr}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 'var(--sp-4)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div className="sidebar-section-title">Würfelsystem</div>

        {/* Die type buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
          {DICE.map((d) => (
            <button
              key={d}
              className={`btn btn-ghost ${selectedDie === d ? 'btn-active' : ''}`}
              style={{ flex: '1 1 calc(25% - 4px)', justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px 2px' }}
              onClick={() => setSelectedDie(d)}
            >
              d{d}
            </button>
          ))}
        </div>

        {/* Num dice + modifier */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>Anz.</label>
          <input
            className="input"
            type="number" min={1} max={20}
            value={numDice}
            onChange={(e) => setNumDice(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            style={{ width: 52 }}
          />
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>Mod.</label>
          <input
            className="input"
            type="number" min={-99} max={99}
            value={modifier}
            onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
            style={{ width: 60 }}
          />
        </div>

        {/* Advantage toggle (d20 only) */}
        {selectedDie === 20 && (
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            {([['none', 'Normal'], ['adv', '↑ Vorteil'], ['dis', '↓ Nachteil']] as const).map(([id, lbl]) => (
              <button
                key={id}
                className={`btn btn-ghost ${advantage === id ? 'btn-active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '3px' }}
                onClick={() => setAdvantage(id)}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}

        {/* Roll button */}
        <button
          className="btn btn-primary"
          style={{ justifyContent: 'center', fontWeight: 700, fontSize: 'var(--text-sm)' }}
          onClick={roll}
        >
          🎲 {label} würfeln
        </button>
      </div>

      {/* Roll history */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
        {history.length === 0 ? (
          <EmptyState size="sm" icon="🎲" title="Noch kein Wurf" />
        ) : (
          history.map((r, i) => (
            <div
              key={r.timestamp}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-2) var(--sp-4)',
                borderBottom: '1px solid var(--border-subtle)',
                background: i === 0 ? 'var(--accent-dim)' : 'transparent',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: i === 0 ? 'var(--accent-light)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {r.dice}
                  {r.advantage !== 'none' && (
                    <span style={{ marginLeft: 4, color: r.advantage === 'adv' ? 'var(--success)' : 'var(--danger)' }}>
                      {r.advantage === 'adv' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
                  [{r.rolls.join(', ')}]
                  {r.modifier !== 0 && ` ${r.modifier > 0 ? '+' : ''}${r.modifier}`}
                </div>
              </div>
              <div style={{
                fontSize: i === 0 ? 28 : 22,
                fontWeight: 800,
                color: i === 0 ? 'var(--accent-light)' : 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                minWidth: 36,
                textAlign: 'right',
              }}>
                {r.total}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
