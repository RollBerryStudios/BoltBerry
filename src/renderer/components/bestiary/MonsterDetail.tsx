import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MonsterRecord, NamedText } from '@shared/ipc-types'
import type { AppLanguage } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useUIStore } from '../../stores/uiStore'
import { showToast } from '../shared/Toast'
import { formatMod, localized, localizedArray, pickName, tokenTint } from './util'
import { monsterHandout, spawnMonsterOnMap } from './actions'

type LoadedMonster = (MonsterRecord & { tokenDefaultUrl: string | null }) | null

export function MonsterDetail({ slug, language }: { slug: string; language: AppLanguage }) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<LoadedMonster>(null)
  const [tokenIndex, setTokenIndex] = useState(0)
  const [tokenUrls, setTokenUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    setRecord(null)
    setTokenIndex(0)
    setTokenUrls({})
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
  }, [slug])

  const tokens = useMemo(() => {
    if (!record) return [] as Array<{ file: string; variant: string }>
    const primary = record.token ? [record.token] : []
    return [...primary, ...(record.tokens ?? [])]
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
  const currentUrl = currentToken ? tokenUrls[currentToken.file] : undefined

  return (
    <article className="bb-best-detail" style={{ borderLeftColor: tint }}>
      {/* Hero — portrait, name, subline */}
      <header className="bb-best-hero">
        <div className="bb-best-hero-portrait" style={{ borderColor: tint }}>
          {currentUrl ? (
            <img src={currentUrl} alt={displayName} draggable={false} />
          ) : (
            <span className="bb-best-hero-glyph" aria-hidden="true">👹</span>
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

      {/* Action toolbar — connects the reference card to the table. */}
      <MonsterActions record={record} language={language} imageUrl={currentUrl ?? null} />

      {/* Token strip */}
      {tokens.length > 1 && (
        <TokenStrip
          slug={record.slug}
          tokens={tokens}
          activeIndex={tokenIndex}
          onActivate={setTokenIndex}
          urls={tokenUrls}
          onResolve={(file, url) => setTokenUrls((prev) => ({ ...prev, [file]: url }))}
        />
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
        <MetaRow label={t('bestiary.savingThrows')} value={(record.savingThrows ?? []).join(', ')} />
        <MetaRow label={t('bestiary.skills')} value={(record.skills ?? []).join(', ')} />
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

function TokenStrip({ slug, tokens, activeIndex, onActivate, urls, onResolve }: {
  slug: string
  tokens: Array<{ file: string; variant: string }>
  activeIndex: number
  onActivate: (i: number) => void
  urls: Record<string, string>
  onResolve: (file: string, url: string) => void
}) {
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
    <div className="bb-best-tokens">
      {tokens.map((tok, i) => (
        <button
          key={`${tok.file}-${i}`}
          type="button"
          title={tok.variant}
          onClick={() => onActivate(i)}
          className={i === activeIndex ? 'bb-best-token active' : 'bb-best-token'}
        >
          {urls[tok.file] ? (
            <img src={urls[tok.file]} alt="" draggable={false} />
          ) : (
            <span className="bb-best-token-skeleton" aria-hidden="true" />
          )}
        </button>
      ))}
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

// ───────── Action toolbar: spawn on map + send handout to player ──────

function MonsterActions({
  record,
  language,
  imageUrl,
}: {
  record: MonsterRecord & { tokenDefaultUrl: string | null }
  language: AppLanguage
  imageUrl: string | null
}) {
  const { t } = useTranslation()
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const activeMaps = useCampaignStore((s) => s.activeMaps)
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
      const primary = imageUrl ?? record.tokenDefaultUrl
      const ok = await spawnMonsterOnMap({
        monster: record,
        imageDataUrl: primary,
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

  return (
    <div className="bb-best-actions-bar">
      <button
        type="button"
        className="bb-best-action-btn bb-best-action-primary"
        onClick={handleSpawn}
        disabled={busy || !map}
        title={map ? t('bestiary.addToMap') : t('bestiary.noActiveMap')}
      >
        ✦ {t('bestiary.addToMap')}
      </button>
      <button
        type="button"
        className="bb-best-action-btn"
        onClick={handleSend}
        disabled={!playerConnected}
        title={playerConnected ? t('bestiary.sendToPlayer') : t('bestiary.sendDisabled')}
      >
        📡 {t('bestiary.sendToPlayer')}
      </button>
    </div>
  )
}

