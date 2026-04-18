import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useImageUrl } from '../../../hooks/useImageUrl'
import { getFormationOffsets } from '../../../utils/formationLayout'
import type { FormationType, MapRecord, TokenVariant } from '@shared/ipc-types'

/* Token library — browsable stat blocks grouped into three categories
   (Monster / Player / NPC). The monster category ships pre-seeded with
   25 SRD creatures; all three accept user-created templates.

   Flow: category tabs → search → grid of cards → per-card actions
   (add-to-map, duplicate, delete, edit name/HP/AC inline). */

type Category = 'monster' | 'player' | 'npc'
type Source = 'srd' | 'user'
type SortKey = 'cr-asc' | 'cr-desc' | 'name-asc' | 'hp-desc' | 'ac-desc'

interface AbilityScores {
  str: number; dex: number; con: number
  int: number; wis: number; cha: number
}

interface StatAttack { name: string; bonus: string; damage: string }

interface StatBlock extends AbilityScores {
  attacks: StatAttack[]
  traits: string[]
}

interface TokenTemplate {
  id: number
  category: Category
  source: Source
  name: string
  image_path: string | null
  size: number
  hp_max: number
  ac: number | null
  speed: number | null
  cr: string | null
  creature_type: string | null
  faction: string
  marker_color: string | null
  notes: string | null
  stat_block: StatBlock | null
  slug: string | null
  created_at: string
}

const CATEGORIES: { id: Category; icon: string; i18n: string }[] = [
  { id: 'monster', icon: '👹', i18n: 'library.catMonster' },
  { id: 'player',  icon: '🧝', i18n: 'library.catPlayer' },
  { id: 'npc',     icon: '🧑', i18n: 'library.catNpc' },
]

export function TokenLibraryPanel() {
  const { t } = useTranslation()
  const { activeCampaignId, activeMapId, activeMaps, setActiveMap } = useCampaignStore()

  const [category, setCategory] = useState<Category>('monster')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [factionFilter, setFactionFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<'' | 'srd' | 'user'>('')
  const [sortBy, setSortBy] = useState<SortKey>('cr-asc')
  const [templates, setTemplates] = useState<TokenTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insertTick, setInsertTick] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [insertedName, setInsertedName] = useState('')

  const load = useCallback(async () => {
    if (!window.electronAPI) return
    setLoading(true)
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number
        category: string
        source: string
        name: string
        image_path: string | null
        size: number
        hp_max: number
        ac: number | null
        speed: number | null
        cr: string | null
        creature_type: string | null
        faction: string
        marker_color: string | null
        notes: string | null
        stat_block: string | null
        slug: string | null
        created_at: string
      }>(
        `SELECT id, category, source, name, image_path, size, hp_max, ac, speed,
                cr, creature_type, faction, marker_color, notes, stat_block, slug, created_at
         FROM token_templates
         ORDER BY
           CASE source WHEN 'user' THEN 0 ELSE 1 END,
           CASE
             WHEN cr LIKE '1/8' THEN 0.125
             WHEN cr LIKE '1/4' THEN 0.25
             WHEN cr LIKE '1/2' THEN 0.5
             WHEN cr GLOB '[0-9]*' THEN CAST(cr AS REAL)
             ELSE 999
           END,
           name`,
      )
      setTemplates(rows.map(parseTemplate))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = templates.filter((tpl) => {
      if (tpl.category !== category) return false
      if (typeFilter && tpl.creature_type !== typeFilter) return false
      if (factionFilter && tpl.faction !== factionFilter) return false
      if (sourceFilter && tpl.source !== sourceFilter) return false
      if (!q) return true
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.creature_type?.toLowerCase().includes(q) ||
        tpl.cr?.includes(q)
      )
    })
    return matched.sort(compareBy(sortBy))
  }, [templates, category, query, typeFilter, factionFilter, sourceFilter, sortBy])

  // Distinct creature types actually present in the current category —
  // drives the type filter dropdown so empty categories don't offer empty
  // options. Same for factions (faction is freeform text in DB).
  const availableTypes = useMemo(() => {
    const set = new Set<string>()
    for (const tpl of templates) {
      if (tpl.category === category && tpl.creature_type) set.add(tpl.creature_type)
    }
    return Array.from(set).sort()
  }, [templates, category])

  const availableFactions = useMemo(() => {
    const set = new Set<string>()
    for (const tpl of templates) {
      if (tpl.category === category && tpl.faction) set.add(tpl.faction)
    }
    return Array.from(set).sort()
  }, [templates, category])

  const counts = useMemo(() => {
    const out: Record<Category, number> = { monster: 0, player: 0, npc: 0 }
    for (const t of templates) out[t.category] += 1
    return out
  }, [templates])

  // Create a new user-scoped template. Opens straight into edit mode inline.
  async function handleCreate() {
    if (!window.electronAPI) return
    try {
      const defaults = {
        monster: { name: 'Neues Monster', faction: 'enemy', marker_color: '#ef4444' },
        player:  { name: 'Neuer Spieler', faction: 'party', marker_color: '#22c55e' },
        npc:     { name: 'Neuer NSC',     faction: 'neutral', marker_color: '#f59e0b' },
      }[category]
      const res = await window.electronAPI.dbRun(
        `INSERT INTO token_templates (category, source, name, size, hp_max, ac, speed, faction, marker_color)
         VALUES (?, 'user', ?, 1, 10, 10, 30, ?, ?)`,
        [category, defaults.name, defaults.faction, defaults.marker_color],
      )
      await load()
      // Bring the new one into focus by scrolling the list — the name field
      // autoFocuses for user-source cards with a recent id.
      setQuery('')
      void res
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleDuplicate(tpl: TokenTemplate) {
    if (!window.electronAPI) return
    try {
      const copyName = `${tpl.name} (Kopie)`
      await window.electronAPI.dbRun(
        `INSERT INTO token_templates
           (category, source, name, image_path, size, hp_max, ac, speed, cr,
            creature_type, faction, marker_color, notes, stat_block)
           VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tpl.category, copyName, tpl.image_path, tpl.size, tpl.hp_max,
          tpl.ac, tpl.speed, tpl.cr, tpl.creature_type, tpl.faction,
          tpl.marker_color, tpl.notes,
          tpl.stat_block ? JSON.stringify(tpl.stat_block) : null,
        ],
      )
      await load()
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleDelete(tpl: TokenTemplate) {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.confirmDialog(
      t('library.confirmDeleteTitle'),
      t('library.confirmDeleteMessage', { name: tpl.name }),
    )
    if (!confirmed) return
    try {
      await window.electronAPI.dbRun('DELETE FROM token_templates WHERE id = ?', [tpl.id])
      await load()
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleEdit(tpl: TokenTemplate, patch: Partial<Pick<TokenTemplate,
    'name' | 'hp_max' | 'ac' | 'speed' | 'size' | 'cr' | 'creature_type' | 'faction' | 'marker_color'>>) {
    if (!window.electronAPI) return
    const fields: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(patch)) {
      fields.push(`${key} = ?`)
      params.push(value)
    }
    if (fields.length === 0) return
    params.push(tpl.id)
    try {
      await window.electronAPI.dbRun(
        `UPDATE token_templates SET ${fields.join(', ')} WHERE id = ?`,
        params,
      )
      setTemplates((prev) => prev.map((x) => (x.id === tpl.id ? { ...x, ...patch } : x)))
    } catch (err) {
      setError(String(err))
    }
  }

  // Full update — used by the edit modal. Handles every editable field
  // including stat_block and image_path with one UPDATE round-trip.
  async function handleSaveFull(tpl: TokenTemplate, next: TokenTemplate) {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.dbRun(
        `UPDATE token_templates
         SET name = ?, image_path = ?, size = ?, hp_max = ?, ac = ?, speed = ?,
             cr = ?, creature_type = ?, faction = ?, marker_color = ?,
             notes = ?, stat_block = ?
         WHERE id = ?`,
        [
          next.name,
          next.image_path,
          next.size,
          next.hp_max,
          next.ac,
          next.speed,
          next.cr,
          next.creature_type,
          next.faction,
          next.marker_color,
          next.notes,
          next.stat_block ? JSON.stringify(next.stat_block) : null,
          tpl.id,
        ],
      )
      setTemplates((prev) => prev.map((x) => (x.id === tpl.id ? next : x)))
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleInsertOnMap(tpl: TokenTemplate, count: number = 1, formation: FormationType = 'cluster') {
    if (!window.electronAPI || !activeCampaignId) return
    const targetMap = activeMapId
      ? activeMaps.find((m) => m.id === activeMapId)
      : activeMaps[0]
    if (!targetMap) {
      setError(t('library.noMapForInsert'))
      return
    }
    try {
      // Pre-fetch the variant list once so we can re-roll per spawn, giving
      // each of the N tokens a different face instead of N identical copies.
      const variants = tpl.slug && window.electronAPI
        ? await window.electronAPI.listTokenVariants(tpl.slug)
        : []

      const offsets = getFormationOffsets(formation, count, targetMap.gridSize)
      for (let i = 0; i < count; i++) {
        const image = variants.length > 0
          ? variants[Math.floor(Math.random() * variants.length)].path
          : tpl.image_path
        const { dx, dy } = offsets[i] ?? { dx: 0, dy: 0 }
        await insertTokenForTemplate(tpl, targetMap, image, dx, dy)
      }
      // If we were not currently on a map, switch into play view with the
      // selected one so the DM sees the new tokens immediately.
      if (!activeMapId) setActiveMap(targetMap.id)
      setInsertedName(count > 1 ? `${count}× ${tpl.name}` : tpl.name)
      setInsertTick((n) => n + 1)
    } catch (err) {
      setError(String(err))
    }
  }

  useEffect(() => {
    if (insertTick === 0) return
    const id = window.setTimeout(() => setInsertTick(0), 1600)
    return () => window.clearTimeout(id)
  }, [insertTick])

  const disabled = !activeCampaignId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      {/* Attribution strip — CC-BY-4.0 requires visible credit for SRD content. */}
      <div style={{
        padding: '6px var(--sp-4)',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10,
        color: 'var(--text-muted)',
        lineHeight: 1.4,
      }}>
        {t('library.attributionPrefix')}{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--accent-blue-light)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
        >
          CC-BY-4.0
        </a>
        {' · '}
        <span style={{ fontStyle: 'italic' }}>{t('library.attributionSuffix')}</span>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 12px',
              background: 'none',
              border: 'none',
              borderBottom: category === c.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: category === c.id ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: category === c.id ? 700 : 500,
              fontFamily: 'inherit',
            }}
          >
            <span>{c.icon}</span>
            <span>{t(c.i18n)}</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              minWidth: 18, textAlign: 'center',
              padding: '1px 5px',
              background: category === c.id ? 'var(--accent-blue)' : 'var(--bg-overlay)',
              color: category === c.id ? 'var(--text-inverse)' : 'var(--text-muted)',
              borderRadius: 8,
            }}>{counts[c.id]}</span>
          </button>
        ))}
      </div>

      {/* Toolbar: search + new */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px var(--sp-4)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            className="input"
            placeholder={t('library.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          style={{
            padding: '7px 14px',
            background: 'var(--accent)',
            color: 'var(--text-inverse)',
            border: 'none', borderRadius: 'var(--radius)',
            fontWeight: 700, fontSize: 12, letterSpacing: '0.02em',
            cursor: 'pointer', fontFamily: 'inherit',
            flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255, 198, 46, 0.28), 0 4px 10px rgba(255, 198, 46, 0.18)',
          }}
        >
          + {t('library.new')}
        </button>
      </div>

      {error && (
        <div style={{
          margin: 12, padding: '8px 12px',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius)',
          color: 'var(--danger)',
          fontSize: 12,
        }}>⚠️ {error}</div>
      )}

      {/* Filter + sort bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px var(--sp-4)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
      }}>
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          label={t('library.filterType')}
          allLabel={t('library.filterAll')}
          options={availableTypes.map((v) => ({ value: v, label: v }))}
        />
        <FilterSelect
          value={factionFilter}
          onChange={setFactionFilter}
          label={t('library.filterFaction')}
          allLabel={t('library.filterAll')}
          options={availableFactions.map((v) => ({ value: v, label: t(`library.faction_${v}`, v) }))}
        />
        <FilterSelect
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as '' | 'srd' | 'user')}
          label={t('library.filterSource')}
          allLabel={t('library.filterAll')}
          options={[
            { value: 'srd', label: t('library.sourceSrd') },
            { value: 'user', label: t('library.sourceUser') },
          ]}
        />
        <div style={{ flex: 1 }} />
        <FilterSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as SortKey)}
          label={t('library.sortBy')}
          allLabel=""
          options={[
            { value: 'cr-asc', label: t('library.sortCrAsc') },
            { value: 'cr-desc', label: t('library.sortCrDesc') },
            { value: 'name-asc', label: t('library.sortNameAsc') },
            { value: 'hp-desc', label: t('library.sortHpDesc') },
            { value: 'ac-desc', label: t('library.sortAcDesc') },
          ]}
        />
        {(typeFilter || factionFilter || sourceFilter) && (
          <button
            type="button"
            onClick={() => { setTypeFilter(''); setFactionFilter(''); setSourceFilter('') }}
            style={{
              padding: '5px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ✕ {t('library.clearFilters')}
          </button>
        )}
      </div>

      {/* Card grid */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--sp-4)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 'var(--sp-3)',
        alignContent: 'start',
      }}>
        {loading && templates.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
            …
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center', padding: 48,
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            {query ? t('library.noMatches') : t('library.empty')}
          </div>
        ) : (
          filtered.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              onEdit={(patch) => handleEdit(tpl, patch)}
              onOpenEditor={() => setEditingId(tpl.id)}
              onDuplicate={() => handleDuplicate(tpl)}
              onDelete={() => handleDelete(tpl)}
              onInsert={(count, formation) => handleInsertOnMap(tpl, count, formation)}
              canInsert={!disabled && activeMaps.length > 0}
            />
          ))
        )}
      </div>

      {insertTick > 0 && (
        <div style={{
          position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 14px',
          background: 'rgba(13, 16, 21, 0.92)',
          border: '1px solid var(--success)',
          borderRadius: 999,
          color: 'var(--success)',
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          ✓ {t('library.inserted', { name: insertedName })}
        </div>
      )}

      {editingId !== null && (() => {
        const tpl = templates.find((x) => x.id === editingId)
        if (!tpl) return null
        return (
          <TemplateEditor
            tpl={tpl}
            onSave={(next) => { void handleSaveFull(tpl, next); setEditingId(null) }}
            onClose={() => setEditingId(null)}
          />
        )
      })()}
    </div>
  )
}

// ─── Template card ──────────────────────────────────────────────────

function TemplateCard({
  tpl,
  onEdit,
  onOpenEditor,
  onDuplicate,
  onDelete,
  onInsert,
  canInsert,
}: {
  tpl: TokenTemplate
  onEdit: (patch: Partial<Pick<TokenTemplate, 'name' | 'hp_max' | 'ac' | 'speed' | 'size' | 'cr' | 'creature_type' | 'faction' | 'marker_color'>>) => void
  onOpenEditor: () => void
  onDuplicate: () => void
  onDelete: () => void
  onInsert: (count: number, formation: FormationType) => void
  canInsert: boolean
}) {
  const { t } = useTranslation()
  const isUser = tpl.source === 'user'
  const [spawnCount, setSpawnCount] = useState(1)
  const [spawnFormation, setSpawnFormation] = useState<FormationType>('cluster')
  const color = tpl.marker_color ?? 'var(--text-muted)'

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isUser ? (
            <input
              defaultValue={tpl.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== tpl.name) {
                  onEdit({ name: e.target.value.trim() })
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: "'Fraunces', Georgia, serif",
                fontSize: 17, fontWeight: 500, letterSpacing: '-0.005em',
                padding: '2px 0',
                outline: 'none',
              }}
            />
          ) : (
            <div style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 17, fontWeight: 500, letterSpacing: '-0.005em',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {tpl.name}
            </div>
          )}
          <div style={{
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginTop: 2,
            display: 'flex', gap: 8, flexWrap: 'wrap',
          }}>
            {tpl.cr && <span>CR {tpl.cr}</span>}
            {tpl.creature_type && <span style={{ opacity: 0.7 }}>·</span>}
            {tpl.creature_type && <span>{tpl.creature_type}</span>}
            <span style={{ opacity: 0.7 }}>·</span>
            <span>{sizeLabel(tpl.size)}</span>
          </div>
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 3,
          background: isUser ? 'var(--accent-blue-dim)' : 'var(--bg-overlay)',
          color: isUser ? 'var(--accent-blue-light)' : 'var(--text-muted)',
        }}>
          {isUser ? t('library.sourceUser') : t('library.sourceSrd')}
        </span>
      </div>

      {/* Core stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6, padding: '0 12px 8px',
      }}>
        <StatBox label="HP" value={String(tpl.hp_max)} />
        <StatBox label="AC" value={tpl.ac != null ? String(tpl.ac) : '—'} />
        <StatBox label={t('library.speed')} value={tpl.speed != null ? `${tpl.speed} ft` : '—'} />
      </div>

      {/* Abilities */}
      {tpl.stat_block && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 4, padding: '4px 12px 8px',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {(['str','dex','con','int','wis','cha'] as const).map((k) => (
            <AbilityCell key={k} label={k.toUpperCase()} score={tpl.stat_block![k]} />
          ))}
        </div>
      )}

      {/* Attacks */}
      {tpl.stat_block && tpl.stat_block.attacks.length > 0 && (
        <div style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {tpl.stat_block.attacks.map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{a.name}</span>{' '}
              <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{a.bonus}</span>{' '}
              — <span>{a.damage}</span>
            </div>
          ))}
        </div>
      )}

      {/* Traits */}
      {tpl.stat_block && tpl.stat_block.traits.length > 0 && (
        <div style={{
          padding: '6px 12px 10px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
          {tpl.stat_block.traits.map((tr, i) => (
            <div key={i}>· {tr}</div>
          ))}
        </div>
      )}

      {/* Variant strip — bundled + user artwork per slug */}
      {tpl.slug && (
        <VariantStrip slug={tpl.slug} />
      )}

      {/* Actions */}
      <div style={{
        display: 'flex', gap: 4, alignItems: 'center',
        padding: 8,
        marginTop: 'auto',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
      }}>
        <input
          type="number"
          min={1}
          max={12}
          value={spawnCount}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            setSpawnCount(Number.isFinite(n) ? Math.max(1, Math.min(12, n)) : 1)
          }}
          title={t('library.spawnCount')}
          style={{
            width: 42,
            padding: '6px 4px',
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            textAlign: 'center',
            fontWeight: 700,
          }}
        />
        <select
          value={spawnFormation}
          onChange={(e) => setSpawnFormation(e.target.value as FormationType)}
          disabled={spawnCount <= 1}
          title={t('library.spawnFormation')}
          style={{
            padding: '6px 4px',
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: spawnCount > 1 ? 'var(--text-primary)' : 'var(--text-muted)',
            fontFamily: 'inherit', fontSize: 10,
            cursor: spawnCount > 1 ? 'pointer' : 'not-allowed',
          }}
        >
          <option value="cluster">⚫ {t('library.formationCluster')}</option>
          <option value="line">▬ {t('library.formationLine')}</option>
          <option value="circle">◯ {t('library.formationCircle')}</option>
          <option value="wing">◣ {t('library.formationWing')}</option>
          <option value="v-formation">⋎ {t('library.formationV')}</option>
        </select>
        <button
          type="button"
          onClick={() => onInsert(spawnCount, spawnFormation)}
          disabled={!canInsert}
          title={canInsert ? t('library.insertOnMap') : t('library.noMapForInsert')}
          style={{
            flex: 1,
            padding: '6px 8px',
            background: canInsert ? 'var(--accent)' : 'transparent',
            color: canInsert ? 'var(--text-inverse)' : 'var(--text-muted)',
            border: canInsert ? 'none' : '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: canInsert ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
          }}
        >
          + {t('library.addToken')}
        </button>
        {isUser && (
          <button
            type="button"
            onClick={onOpenEditor}
            title={t('library.edit')}
            style={iconBtn}
          >✏️</button>
        )}
        <button
          type="button"
          onClick={onDuplicate}
          title={t('library.duplicate')}
          style={iconBtn}
        >📋</button>
        {isUser && (
          <button
            type="button"
            onClick={onDelete}
            title={t('library.delete')}
            style={{
              ...iconBtn,
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: 'var(--danger)',
            }}
          >🗑</button>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-sm)',
      padding: '6px 8px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 2,
    }}>
      <div style={{ fontSize: 9, letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  )
}

function AbilityCell({ label, score }: { label: string; score: number }) {
  const mod = Math.floor((score - 10) / 2)
  const modStr = mod >= 0 ? `+${mod}` : `${mod}`
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{score}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{modStr}</div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  padding: '6px 8px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  flexShrink: 0,
}

// ─── Variant strip ────────────────────────────────────────────────────

function VariantStrip({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const [variants, setVariants] = useState<TokenVariant[]>([])

  const reload = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const list = await window.electronAPI.listTokenVariants(slug)
      setVariants(list)
    } catch {
      /* ignore — empty strip is fine */
    }
  }, [slug])

  useEffect(() => { void reload() }, [reload])

  async function handleImport() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.importTokenVariants(slug)
    if (result?.success) await reload()
  }

  async function handleOpenFolder() {
    await window.electronAPI?.openTokenVariantsFolder(slug)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 12px',
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
        color: 'var(--text-muted)', textTransform: 'uppercase',
        flexShrink: 0, marginRight: 4,
      }}>
        {t('library.variantsLabel')}
      </div>
      <div style={{ display: 'flex', gap: 4, flex: 1, overflow: 'hidden' }}>
        {variants.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {t('library.noVariants')}
          </div>
        ) : (
          variants.slice(0, 8).map((v) => (
            <VariantThumb key={v.path} variant={v} />
          ))
        )}
        {variants.length > 8 && (
          <div style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 600,
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
          }}>+{variants.length - 8}</div>
        )}
      </div>
      <button
        type="button"
        onClick={handleImport}
        title={t('library.importVariants')}
        style={variantIconBtn}
      >📥</button>
      <button
        type="button"
        onClick={handleOpenFolder}
        title={t('library.openVariantsFolder')}
        style={variantIconBtn}
      >📁</button>
    </div>
  )
}

function VariantThumb({ variant }: { variant: TokenVariant }) {
  const url = useImageUrl(variant.path)
  return (
    <div
      title={`${variant.name} · ${variant.source === 'bundled' ? 'Seed' : 'Eigene'}`}
      style={{
        width: 32, height: 32,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--bg-elevated)',
        border: variant.source === 'bundled'
          ? '1px solid var(--border-subtle)'
          : '1px solid var(--accent-blue)',
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  )
}

// ─── Template editor (user-scoped rows only) ──────────────────────────

function TemplateEditor({
  tpl,
  onSave,
  onClose,
}: {
  tpl: TokenTemplate
  onSave: (next: TokenTemplate) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<TokenTemplate>(tpl)

  // Shortcut for mutating nested stat_block.
  function mutStat<K extends keyof StatBlock>(key: K, value: StatBlock[K]) {
    setDraft((d) => ({
      ...d,
      stat_block: { ...(d.stat_block ?? emptyStatBlock()), [key]: value },
    }))
  }

  function setAttack(i: number, patch: Partial<StatAttack>) {
    setDraft((d) => {
      const sb = d.stat_block ?? emptyStatBlock()
      const attacks = sb.attacks.map((a, j) => (i === j ? { ...a, ...patch } : a))
      return { ...d, stat_block: { ...sb, attacks } }
    })
  }
  function addAttack() {
    setDraft((d) => {
      const sb = d.stat_block ?? emptyStatBlock()
      return { ...d, stat_block: { ...sb, attacks: [...sb.attacks, { name: '', bonus: '', damage: '' }] } }
    })
  }
  function removeAttack(i: number) {
    setDraft((d) => {
      const sb = d.stat_block ?? emptyStatBlock()
      return { ...d, stat_block: { ...sb, attacks: sb.attacks.filter((_, j) => j !== i) } }
    })
  }
  function setTrait(i: number, text: string) {
    setDraft((d) => {
      const sb = d.stat_block ?? emptyStatBlock()
      const traits = sb.traits.map((tr, j) => (i === j ? text : tr))
      return { ...d, stat_block: { ...sb, traits } }
    })
  }
  function addTrait() {
    setDraft((d) => {
      const sb = d.stat_block ?? emptyStatBlock()
      return { ...d, stat_block: { ...sb, traits: [...sb.traits, ''] } }
    })
  }
  function removeTrait(i: number) {
    setDraft((d) => {
      const sb = d.stat_block ?? emptyStatBlock()
      return { ...d, stat_block: { ...sb, traits: sb.traits.filter((_, j) => j !== i) } }
    })
  }

  const sb = draft.stat_block ?? emptyStatBlock()

  return (
    <div className="bb-lib-modal-backdrop" onClick={onClose}>
      <div className="bb-lib-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bb-lib-modal-header">
          <h2 className="display" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>
            {t('library.editTitle')}
          </h2>
          <button type="button" onClick={onClose} className="bb-lib-modal-close">✕</button>
        </div>

        <div className="bb-lib-modal-body">
          {/* Row: name + CR + type */}
          <div className="bb-lib-row-3">
            <Field label={t('library.fieldName')}>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="CR">
              <input
                className="input"
                value={draft.cr ?? ''}
                onChange={(e) => setDraft({ ...draft, cr: e.target.value })}
                placeholder="1/4"
              />
            </Field>
            <Field label={t('library.fieldType')}>
              <input
                className="input"
                value={draft.creature_type ?? ''}
                onChange={(e) => setDraft({ ...draft, creature_type: e.target.value })}
                placeholder="humanoid"
              />
            </Field>
          </div>

          {/* Row: HP / AC / Speed / Size */}
          <div className="bb-lib-row-4">
            <Field label="HP">
              <input
                type="number" className="input"
                value={draft.hp_max}
                onChange={(e) => setDraft({ ...draft, hp_max: parseInt(e.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="AC">
              <input
                type="number" className="input"
                value={draft.ac ?? ''}
                onChange={(e) => setDraft({ ...draft, ac: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
              />
            </Field>
            <Field label={t('library.speed')}>
              <input
                type="number" className="input"
                value={draft.speed ?? ''}
                onChange={(e) => setDraft({ ...draft, speed: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
              />
            </Field>
            <Field label={t('library.fieldSize')}>
              <select
                className="input"
                value={draft.size}
                onChange={(e) => setDraft({ ...draft, size: parseInt(e.target.value, 10) })}
              >
                <option value={1}>Medium (1)</option>
                <option value={2}>Large (2)</option>
                <option value={3}>Huge (3)</option>
                <option value={4}>Gargantuan (4)</option>
              </select>
            </Field>
          </div>

          {/* Row: faction + marker color */}
          <div className="bb-lib-row-3">
            <Field label={t('library.filterFaction')}>
              <select
                className="input"
                value={draft.faction}
                onChange={(e) => setDraft({ ...draft, faction: e.target.value })}
              >
                <option value="enemy">{t('library.faction_enemy')}</option>
                <option value="neutral">{t('library.faction_neutral')}</option>
                <option value="friendly">{t('library.faction_friendly')}</option>
                <option value="party">{t('library.faction_party')}</option>
              </select>
            </Field>
            <Field label={t('library.fieldMarkerColor')}>
              <input
                type="color"
                value={draft.marker_color ?? '#ef4444'}
                onChange={(e) => setDraft({ ...draft, marker_color: e.target.value })}
                style={{ height: 32, width: '100%', padding: 0, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
              />
            </Field>
            <div />
          </div>

          {/* Ability scores */}
          <div className="bb-lib-section-title">{t('library.editAbilities')}</div>
          <div className="bb-lib-abilities">
            {(['str','dex','con','int','wis','cha'] as const).map((k) => (
              <Field key={k} label={k.toUpperCase()}>
                <input
                  type="number" className="input"
                  value={sb[k]}
                  onChange={(e) => mutStat(k, parseInt(e.target.value, 10) || 0)}
                />
              </Field>
            ))}
          </div>

          {/* Attacks */}
          <div className="bb-lib-section-header">
            <div className="bb-lib-section-title">{t('library.editAttacks')}</div>
            <button type="button" className="bb-lib-add-btn" onClick={addAttack}>+ {t('library.add')}</button>
          </div>
          {sb.attacks.length === 0 ? (
            <div className="bb-lib-empty-hint">{t('library.noAttacks')}</div>
          ) : (
            <div className="bb-lib-rows">
              {sb.attacks.map((a, i) => (
                <div key={i} className="bb-lib-attack-row">
                  <input
                    className="input" placeholder={t('library.attackName')}
                    value={a.name}
                    onChange={(e) => setAttack(i, { name: e.target.value })}
                  />
                  <input
                    className="input" placeholder="+4"
                    value={a.bonus}
                    onChange={(e) => setAttack(i, { bonus: e.target.value })}
                  />
                  <input
                    className="input" placeholder={t('library.attackDamage')}
                    value={a.damage}
                    onChange={(e) => setAttack(i, { damage: e.target.value })}
                  />
                  <button type="button" className="bb-lib-remove-btn" onClick={() => removeAttack(i)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Traits */}
          <div className="bb-lib-section-header">
            <div className="bb-lib-section-title">{t('library.editTraits')}</div>
            <button type="button" className="bb-lib-add-btn" onClick={addTrait}>+ {t('library.add')}</button>
          </div>
          {sb.traits.length === 0 ? (
            <div className="bb-lib-empty-hint">{t('library.noTraits')}</div>
          ) : (
            <div className="bb-lib-rows">
              {sb.traits.map((tr, i) => (
                <div key={i} className="bb-lib-trait-row">
                  <input
                    className="input"
                    value={tr}
                    onChange={(e) => setTrait(i, e.target.value)}
                  />
                  <button type="button" className="bb-lib-remove-btn" onClick={() => removeTrait(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bb-lib-modal-footer">
          <button type="button" className="bb-lib-btn-ghost" onClick={onClose}>{t('dashboard.cancel')}</button>
          <button type="button" className="bb-lib-btn-primary" onClick={() => onSave(draft)}>
            {t('library.save')}
          </button>
        </div>
      </div>
      <TemplateEditorStyles />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function emptyStatBlock(): StatBlock {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, attacks: [], traits: [] }
}

function TemplateEditorStyles() {
  return (
    <style>{`
      .bb-lib-modal-backdrop {
        position: fixed; inset: 0; z-index: 9950;
        background: rgba(0, 0, 0, 0.65);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(2px);
      }
      .bb-lib-modal {
        width: min(640px, 94vw);
        max-height: 90vh;
        display: flex; flex-direction: column;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
      }
      .bb-lib-modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: var(--sp-4) var(--sp-5);
        border-bottom: 1px solid var(--border-subtle);
      }
      .bb-lib-modal-close {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted); font-size: 16px;
      }
      .bb-lib-modal-body {
        flex: 1; min-height: 0;
        overflow-y: auto;
        padding: var(--sp-4) var(--sp-5);
        display: flex; flex-direction: column; gap: var(--sp-3);
      }
      .bb-lib-modal-footer {
        display: flex; justify-content: flex-end; gap: var(--sp-2);
        padding: var(--sp-3) var(--sp-5);
        border-top: 1px solid var(--border-subtle);
      }
      .bb-lib-row-3 { display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: var(--sp-3); }
      .bb-lib-row-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1.3fr; gap: var(--sp-3); }
      .bb-lib-abilities { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--sp-2); }
      .bb-lib-section-title {
        font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--text-muted); font-weight: 700;
        margin-top: var(--sp-2);
      }
      .bb-lib-section-header {
        display: flex; align-items: baseline; justify-content: space-between;
        margin-top: var(--sp-2);
      }
      .bb-lib-rows { display: flex; flex-direction: column; gap: 4px; }
      .bb-lib-attack-row {
        display: grid; grid-template-columns: 1.5fr 0.5fr 2fr 30px;
        gap: 6px;
      }
      .bb-lib-trait-row { display: grid; grid-template-columns: 1fr 30px; gap: 6px; }
      .bb-lib-add-btn {
        padding: 3px 8px;
        background: var(--accent-blue-dim);
        color: var(--accent-blue-light);
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        cursor: pointer; font-size: 10px; font-weight: 700; fontFamily: inherit;
      }
      .bb-lib-remove-btn {
        background: transparent; border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        color: var(--text-muted); cursor: pointer; font-size: 11px;
      }
      .bb-lib-remove-btn:hover { color: var(--danger); border-color: var(--danger); }
      .bb-lib-empty-hint {
        font-size: 11px; color: var(--text-muted); font-style: italic;
        padding: 4px;
      }
      .bb-lib-btn-ghost {
        padding: 7px 14px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-primary);
        cursor: pointer; font-family: inherit; font-size: 12px;
      }
      .bb-lib-btn-primary {
        padding: 7px 14px;
        background: var(--accent);
        color: var(--text-inverse);
        border: none; border-radius: var(--radius);
        cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700;
      }
    `}</style>
  )
}

function FilterSelect({
  value,
  onChange,
  label,
  allLabel,
  options,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  allLabel: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
        fontWeight: 700, color: 'var(--text-muted)',
      }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '4px 8px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          minWidth: 90,
        }}
      >
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

const variantIconBtn: React.CSSProperties = {
  padding: '4px 6px',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  flexShrink: 0,
}

// ─── Helpers ──────────────────────────────────────────────────────────

function parseTemplate(row: {
  id: number; category: string; source: string; name: string
  image_path: string | null; size: number; hp_max: number
  ac: number | null; speed: number | null; cr: string | null
  creature_type: string | null; faction: string
  marker_color: string | null; notes: string | null
  stat_block: string | null; slug: string | null; created_at: string
}): TokenTemplate {
  let parsed: StatBlock | null = null
  if (row.stat_block) {
    try { parsed = JSON.parse(row.stat_block) as StatBlock } catch { parsed = null }
  }
  return {
    ...row,
    category: row.category as Category,
    source: row.source as Source,
    stat_block: parsed,
  }
}

function sizeLabel(size: number): string {
  if (size <= 1) return 'M'
  if (size === 2) return 'L'
  if (size === 3) return 'H'
  return 'G'
}

// Parse CR strings like "1/8", "1/4", "1/2", "3", "13" into a sortable
// number. Unknown / null values go to the end.
function crValue(cr: string | null): number {
  if (!cr) return 9999
  if (cr.includes('/')) {
    const [a, b] = cr.split('/').map((s) => parseInt(s, 10))
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b
    return 9999
  }
  const n = parseFloat(cr)
  return Number.isFinite(n) ? n : 9999
}

function compareBy(key: SortKey): (a: TokenTemplate, b: TokenTemplate) => number {
  switch (key) {
    case 'cr-asc':
      return (a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name)
    case 'cr-desc':
      return (a, b) => crValue(b.cr) - crValue(a.cr) || a.name.localeCompare(b.name)
    case 'name-asc':
      return (a, b) => a.name.localeCompare(b.name)
    case 'hp-desc':
      return (a, b) => b.hp_max - a.hp_max || a.name.localeCompare(b.name)
    case 'ac-desc':
      return (a, b) => (b.ac ?? 0) - (a.ac ?? 0) || a.name.localeCompare(b.name)
  }
}

// Inserts a token derived from a library template onto the given map.
// Placed near the camera center by default + a per-token offset so bulk
// spawns land in a formation instead of overlapping on one spot.
async function insertTokenForTemplate(tpl: TokenTemplate, map: MapRecord, imageOverride: string | null, dx = 0, dy = 0) {
  if (!window.electronAPI) return
  const cx = (map.cameraX ?? 0) + dx
  const cy = (map.cameraY ?? 0) + dy
  await window.electronAPI.dbRun(
    `INSERT INTO tokens
       (map_id, name, image_path, x, y, size, hp_current, hp_max,
        visible_to_players, rotation, locked, z_index, marker_color,
        ac, notes, status_effects, faction, show_name, light_radius, light_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?, NULL, ?, 1, 0, '#ffffff')`,
    [
      map.id,
      tpl.name,
      imageOverride ?? tpl.image_path,
      cx, cy,
      tpl.size,
      tpl.hp_max, tpl.hp_max,
      tpl.marker_color,
      tpl.ac,
      tpl.notes,
      tpl.faction,
    ],
  )
}
