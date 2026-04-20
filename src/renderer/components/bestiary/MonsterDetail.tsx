import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MonsterRecord, NamedText } from '@shared/ipc-types'
import type { AppLanguage } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useUIStore } from '../../stores/uiStore'
import { showToast } from '../shared/Toast'
import { formatMod, localized, localizedArray, pickName, tokenTint } from './util'
import { monsterHandout, spawnMonsterOnMap } from './actions'

type LoadedMonster = (MonsterRecord & {
  tokenDefaultUrl: string | null
  userDefaultFile: string | null
  tokensMissing: boolean
}) | null

export function MonsterDetail({ slug, language }: { slug: string; language: AppLanguage }) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<LoadedMonster>(null)
  const [tokenIndex, setTokenIndex] = useState(0)
  const [tokenUrls, setTokenUrls] = useState<Record<string, string>>({})
  // Bumped by the "Set as default" action so the detail refetches and
  // every surface (hero portrait, thumbnail badges, spawn image) picks up
  // the new override without unmounting the whole pane.
  const [refreshNonce, setRefreshNonce] = useState(0)
  // Variant strip is hidden by default — opening a monster only fetches
  // the hero's data URL, not the 12-thumbnail preload. The DM opts in
  // via the "Varianten anzeigen" button. Reset on slug change so the
  // next monster starts collapsed again.
  const [stripOpen, setStripOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setRecord(null)
    setTokenIndex(0)
    setTokenUrls({})
    setStripOpen(false)
    ;(async () => {
      try {
        const row = await window.electronAPI?.getMonster?.(slug) ?? null
        if (!alive) return
        setRecord(row)
      } catch {
        if (alive) setRecord(null)
      }
    })()
    return () => { alive = false }
  }, [slug, refreshNonce])

  async function handleSetDefault(file: string | null) {
    const res = await window.electronAPI?.setMonsterDefault?.(slug, file)
    if (res?.success) {
      setRefreshNonce((n) => n + 1)
      showToast(
        file
          ? t('bestiary.defaultSet')
          : t('bestiary.defaultCleared'),
        'success',
      )
    } else {
      showToast(res?.error ?? 'Fehler', 'error')
    }
  }

  const tokens = useMemo(() => {
    if (!record) return [] as Array<{ file: string; variant: string }>
    const all = [
      ...(record.token ? [record.token] : []),
      ...(record.tokens ?? []),
    ]
    // Deduplicate: record.token is the dataset primary and sometimes also
    // appears in record.tokens (no existing entry is known, but it's a
    // cheap guarantee). Then pin the user's chosen default to index 0 so
    // the hero portrait renders it first — both on mount (sync fallback
    // via tokenDefaultUrl) and after the async thumbnail load resolves.
    const seen = new Set<string>()
    const unique = all.filter((t) => (seen.has(t.file) ? false : (seen.add(t.file), true)))
    const override = record.userDefaultFile
    if (!override) return unique
    const idx = unique.findIndex((t) => t.file === override)
    if (idx <= 0) return unique
    const [chosen] = unique.splice(idx, 1)
    unique.unshift(chosen)
    return unique
  }, [record])

  // Resolve each token filename to a local-asset URL the first time the
  // DM scrolls to it. Avoids firing 30+ IPCs per monster up-front.
  useEffect(() => {
    if (!record || tokens.length === 0) return
    const current = tokens[tokenIndex]
    if (!current) return
    if (tokenUrls[current.file]) return
    let alive = true
    ;(async () => {
      const url = await window.electronAPI?.getMonsterTokenUrl?.(record.slug, current.file) ?? null
      if (!alive || !url) return
      setTokenUrls((prev) => ({ ...prev, [current.file]: url }))
    })()
    return () => { alive = false }
  }, [record, tokens, tokenIndex, tokenUrls])

  if (!record) {
    return <div className="bb-best-loading">…</div>
  }

  const displayName = pickName(record, language)
  const tint = tokenTint(record.type.en)
  const currentToken = tokens[tokenIndex]
  // The first token is also resolved server-side during getMonster and
  // arrives on `record.tokenDefaultUrl`. Use it as a synchronous fallback
  // so the hero paints an image on the first render instead of the glyph.
  const currentUrl = currentToken
    ? (tokenUrls[currentToken.file]
        ?? (tokenIndex === 0 ? record.tokenDefaultUrl ?? undefined : undefined))
    : record.tokenDefaultUrl ?? undefined

  return (
    <article className="bb-best-detail" style={{ borderLeftColor: tint }}>
      {/* Hero — portrait, name, subline */}
      <header className="bb-best-hero">
        <div className="bb-best-hero-portrait" style={{ borderColor: tint }}>
          {currentUrl ? (
            // The img is decorative — `alt=""` keeps the broken-image
            // fallback (e.g. unfetched LFS pointer) from leaking the
            // monster name across the portrait circle.
            <img src={currentUrl} alt="" draggable={false} />
          ) : (
            <span className="bb-best-hero-glyph" aria-hidden="true">
              {record.tokensMissing ? '⬇' : '👹'}
            </span>
          )}
        </div>
        <div className="bb-best-hero-text">
          <h2 className="bb-best-hero-name display">{displayName}</h2>
          <div className="bb-best-hero-sub">
            <span>{localized(record.size, language)}</span>
            <span className="bb-best-hero-dot">·</span>
            <span>{localized(record.type, language)}</span>
            <span className="bb-best-hero-dot">·</span>
            <span>{localized(record.alignment, language)}</span>
          </div>
          <div className="bb-best-hero-chips">
            <Chip label="CR" value={record.challenge} />
            <Chip label="XP" value={record.xp.toLocaleString()} />
            <Chip label="AC" value={stripParens(localized(record.ac, language))} />
            <Chip label="HP" value={stripParens(localized(record.hp, language))} />
          </div>
        </div>
      </header>

      {/* LFS hint — shown only when the dataset's token files are still
          Git-LFS pointers. Saves the DM from chasing "broken images" in
          a fresh clone. */}
      {record.tokensMissing && (
        <div className="bb-best-lfs-hint" role="status">
          <span className="bb-best-lfs-hint-icon" aria-hidden="true">⬇</span>
          <span>
            <strong>{t('bestiary.tokensMissingTitle')}</strong>{' '}
            {t('bestiary.tokensMissingBody')}
            <code className="mono"> git lfs install &amp;&amp; git lfs pull</code>
          </span>
        </div>
      )}

      {/* Action toolbar — connects the reference card to the table. */}
      <MonsterActions
        record={record}
        language={language}
        imageUrl={currentUrl ?? null}
        currentFile={currentToken?.file ?? null}
        isAlreadyDefault={
          currentToken?.file != null && currentToken.file === (record.userDefaultFile ?? record.token?.file ?? null)
        }
        onSetDefault={handleSetDefault}
      />

      {/* Token strip — hidden by default so opening a monster fires one
          image IPC (the hero) instead of thirteen. DMs who want to pick
          a different portrait expand the strip on demand; the lazy
          preload inside TokenStrip kicks in only after that click. */}
      {tokens.length > 1 && (
        stripOpen ? (
          <TokenStrip
            slug={record.slug}
            tokens={tokens}
            activeIndex={tokenIndex}
            onActivate={setTokenIndex}
            urls={tokenUrls}
            onResolve={(file, url) => setTokenUrls((prev) => ({ ...prev, [file]: url }))}
            defaultFile={record.userDefaultFile ?? record.token?.file ?? null}
            onSetDefault={handleSetDefault}
            onCollapse={() => setStripOpen(false)}
          />
        ) : (
          <button
            type="button"
            className="bb-best-variants-trigger"
            onClick={() => setStripOpen(true)}
          >
            🎨 {t('bestiary.showVariants', { count: tokens.length })}
          </button>
        )
      )}

      {/* Ability scores */}
      <section className="bb-best-abilities">
        <Ability label="STR" score={record.str} mod={record.strMod} />
        <Ability label="DEX" score={record.dex} mod={record.dexMod} />
        <Ability label="CON" score={record.con} mod={record.conMod} />
        <Ability label="INT" score={record.int} mod={record.intMod} />
        <Ability label="WIS" score={record.wis} mod={record.wisMod} />
        <Ability label="CHA" score={record.cha} mod={record.chaMod} />
      </section>

      {/* Metadata grid */}
      <section className="bb-best-metagrid">
        <MetaRow label={t('bestiary.speed')} value={speedLine(record, language)} />
        <MetaRow label={t('bestiary.savingThrows')} value={formatSavingThrows(record.savingThrows)} />
        <MetaRow label={t('bestiary.skills')} value={formatSkills(record.skills)} />
        <MetaRow label={t('bestiary.senses')} value={localizedArray(record.senses, language).join(', ')} />
        <MetaRow label={t('bestiary.languages')} value={localizedArray(record.languages, language).join(', ')} />
      </section>

      {/* Traits / actions / legendary / reactions */}
      <NamedSection title={t('bestiary.traits')} entries={getNamed(record.traits, language)} />
      <NamedSection title={t('bestiary.actions')} entries={getNamed(record.actions, language)} />
      <NamedSection title={t('bestiary.legendaryActions')} entries={getNamed(record.legendaryActions, language)} />
      <NamedSection title={t('bestiary.reactions')} entries={getNamed(record.reactions, language)} />

      <footer className="bb-best-footer">
        <span className="mono">{record.slug}</span>
        <span className="bb-best-footer-dot">·</span>
        <span>{record.licenseSource}</span>
      </footer>
    </article>
  )
}

function TokenStrip({
  slug,
  tokens,
  activeIndex,
  onActivate,
  urls,
  onResolve,
  defaultFile,
  onSetDefault,
  onCollapse,
}: {
  slug: string
  tokens: Array<{ file: string; variant: string }>
  activeIndex: number
  onActivate: (i: number) => void
  urls: Record<string, string>
  onResolve: (file: string, url: string) => void
  defaultFile: string | null
  onSetDefault: (file: string | null) => void
  onCollapse: () => void
}) {
  const { t } = useTranslation()
  // Resolve thumbnail URLs lazily in small batches so the strip paints
  // progressively instead of blocking on 30+ IPC calls.
  useEffect(() => {
    let alive = true
    const pending = tokens.filter((tok) => !urls[tok.file]).slice(0, 12)
    if (pending.length === 0) return
    ;(async () => {
      for (const tok of pending) {
        if (!alive) return
        const url = await window.electronAPI?.getMonsterTokenUrl?.(slug, tok.file) ?? null
        if (!alive) return
        if (url) onResolve(tok.file, url)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tokens])

  return (
    <div className="bb-best-tokens-wrap">
      <div className="bb-best-tokens-head">
        <span className="bb-best-tokens-count">
          {t('bestiary.variantCount', { count: tokens.length })}
        </span>
        <button
          type="button"
          className="bb-best-tokens-collapse"
          onClick={onCollapse}
          title={t('bestiary.hideVariants')}
        >
          ✕ {t('bestiary.hideVariants')}
        </button>
      </div>
      <div className="bb-best-tokens">
        {tokens.map((tok, i) => {
          const isDefault = defaultFile === tok.file
        return (
          <div
            key={`${tok.file}-${i}`}
            className={
              [
                'bb-best-token-wrap',
                i === activeIndex ? 'active' : '',
                isDefault ? 'is-default' : '',
              ].filter(Boolean).join(' ')
            }
          >
            <button
              type="button"
              title={tok.variant}
              onClick={() => onActivate(i)}
              className="bb-best-token"
            >
              {urls[tok.file] ? (
                <img src={urls[tok.file]} alt="" draggable={false} />
              ) : (
                <span className="bb-best-token-skeleton" aria-hidden="true" />
              )}
            </button>
            {/* Star button overlay. Clicking the already-marked default
                clears the override so the dataset's original portrait
                comes back. */}
            <button
              type="button"
              className={isDefault ? 'bb-best-token-star active' : 'bb-best-token-star'}
              onClick={(e) => {
                e.stopPropagation()
                onSetDefault(isDefault ? null : tok.file)
              }}
              title={isDefault ? t('bestiary.clearDefault') : t('bestiary.setDefault')}
              aria-label={isDefault ? t('bestiary.clearDefault') : t('bestiary.setDefault')}
            >
              {isDefault ? '★' : '☆'}
            </button>
          </div>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bb-best-chip">
      <span className="bb-best-chip-label">{label}</span>
      <span className="bb-best-chip-value mono">{value}</span>
    </span>
  )
}

function Ability({ label, score, mod }: { label: string; score: number; mod?: number }) {
  return (
    <div className="bb-best-ability">
      <div className="bb-best-ability-label">{label}</div>
      <div className="bb-best-ability-score mono">{score}</div>
      <div className="bb-best-ability-mod mono">{formatMod(score, mod)}</div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) return null
  return (
    <div className="bb-best-metarow">
      <div className="bb-best-metarow-label">{label}</div>
      <div className="bb-best-metarow-value">{value}</div>
    </div>
  )
}

function NamedSection({ title, entries }: { title: string; entries: NamedText[] }) {
  if (!entries || entries.length === 0) return null
  return (
    <section className="bb-best-section">
      <h3>{title}</h3>
      <ul>
        {entries.map((e, i) => (
          <li key={`${e.name}-${i}`}>
            <span className="bb-best-named-title">{e.name}.</span>
            <span className="bb-best-named-text"> {e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function getNamed(
  src: { en: Array<NamedText | string>; de: Array<NamedText | string> } | undefined,
  lang: AppLanguage,
): NamedText[] {
  if (!src) return []
  const arr = src[lang] ?? src.en ?? src.de ?? []
  return arr.filter((x): x is NamedText => typeof x === 'object' && x !== null && 'name' in x && 'text' in x)
}

function speedLine(record: MonsterRecord, lang: AppLanguage): string {
  if (!record.speed) return ''
  const parts: string[] = []
  const unit = lang === 'de' ? 'm' : 'ft'
  const keys = ['run', 'fly', 'swim', 'climb', 'burrow'] as const
  const labels: Record<typeof keys[number], { en: string; de: string }> = {
    run:    { en: 'walk',   de: 'gehen' },
    fly:    { en: 'fly',    de: 'fliegen' },
    swim:   { en: 'swim',   de: 'schwimmen' },
    climb:  { en: 'climb',  de: 'klettern' },
    burrow: { en: 'burrow', de: 'graben' },
  }
  for (const k of keys) {
    const v = record.speed[k]
    if (!v) continue
    const value = lang === 'de' ? v.de : v.en
    if (value == null) continue
    const label = labels[k][lang]
    parts.push(k === 'run' ? `${value} ${unit}` : `${label} ${value} ${unit}`)
  }
  return parts.join(', ')
}

function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim() || s
}

// Dataset has two saving-throw shapes:
//   - string[]:  ["Kon +6", "Int +8", "Wei +6"]  (pre-formatted)
//   - object:    { wis: 2, cha: 5 }              (banshee et al.)
// Normalise to a single display string so rendering never crashes.
function formatSavingThrows(src: MonsterRecord['savingThrows']): string {
  if (!src) return ''
  if (Array.isArray(src)) return src.join(', ')
  return Object.entries(src)
    .map(([ab, bonus]) => {
      const n = Number(bonus)
      const sign = n >= 0 ? '+' : ''
      return `${ab.toUpperCase()} ${sign}${n}`
    })
    .join(', ')
}

function formatSkills(src: MonsterRecord['skills']): string {
  if (!src) return ''
  if (Array.isArray(src)) return src.join(', ')
  // Defensive — the dataset only ships string[] today but future exports
  // might flip to the ability-bonus object. Handle it the same way.
  return Object.entries(src as unknown as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v}`).join(', ')
}

// ───────── Action toolbar: spawn on map + send handout to player ──────

function MonsterActions({
  record,
  language,
  imageUrl,
  currentFile,
  isAlreadyDefault,
  onSetDefault,
}: {
  record: MonsterRecord & { tokenDefaultUrl: string | null; userDefaultFile: string | null }
  language: AppLanguage
  imageUrl: string | null
  currentFile: string | null
  isAlreadyDefault: boolean
  onSetDefault: (file: string | null) => void
}) {
  const { t } = useTranslation()
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const activeMaps = useCampaignStore((s) => s.activeMaps)
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const playerConnected = useUIStore((s) => s.playerConnected)
  const [busy, setBusy] = useState(false)

  const map = useMemo(() => {
    if (!activeMapId) return activeMaps[0] ?? null
    return activeMaps.find((m) => m.id === activeMapId) ?? activeMaps[0] ?? null
  }, [activeMapId, activeMaps])

  async function handleSpawn() {
    if (!map) return
    setBusy(true)
    try {
      const ok = await spawnMonsterOnMap({
        monster: record,
        // Pin to the variant the DM is looking at (if any), otherwise let
        // the helper fall back to the monster's default via the compact
        // bestiary:// URL — avoids storing ~30 KB of base64 per token.
        tokenFile: currentFile ?? record.userDefaultFile ?? null,
        mapId: map.id,
        cameraX: map.cameraX,
        cameraY: map.cameraY,
        language,
      })
      if (ok) {
        showToast(t('bestiary.spawnedOnMap', { name: record.name }), 'success')
      }
    } catch (err) {
      showToast(String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  function handleSend() {
    const handout = monsterHandout(record, language, imageUrl ?? record.tokenDefaultUrl)
    window.electronAPI?.sendHandout(handout)
    showToast(t('bestiary.sentToPlayer'), 'success')
  }

  // The spawn action only makes sense inside an active campaign + map
  // context. The Wiki can be opened from the Welcome screen without any
  // campaign selected — showing a disabled "Auf Karte platzieren" there
  // was noise. Hide the button entirely in that mode; it reappears once
  // a campaign + map are active.
  const canSpawn = Boolean(activeCampaignId && map)

  return (
    <div className="bb-best-actions-bar">
      {canSpawn && (
        <button
          type="button"
          className="bb-best-action-btn bb-best-action-primary"
          onClick={handleSpawn}
          disabled={busy}
          title={t('bestiary.addToMap')}
        >
          ✦ {t('bestiary.addToMap')}
        </button>
      )}
      <button
        type="button"
        className="bb-best-action-btn"
        onClick={handleSend}
        disabled={!playerConnected}
        title={playerConnected ? t('bestiary.sendToPlayer') : t('bestiary.sendDisabled')}
      >
        📡 {t('bestiary.sendToPlayer')}
      </button>
      <button
        type="button"
        className="bb-best-action-btn"
        onClick={() => onSetDefault(isAlreadyDefault ? null : currentFile)}
        disabled={!currentFile}
        title={
          isAlreadyDefault
            ? t('bestiary.clearDefault')
            : t('bestiary.setDefault')
        }
      >
        {isAlreadyDefault ? '★' : '☆'} {isAlreadyDefault ? t('bestiary.clearDefault') : t('bestiary.setDefault')}
      </button>
    </div>
  )
}

