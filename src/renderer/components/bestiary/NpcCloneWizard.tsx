import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MonsterRecord, TokenVariant } from '@shared/ipc-types'
import { CircularCropper } from '../shared/CircularCropper'
import { showToast } from '../shared/Toast'
import { uniqueUserTemplateName } from '../../utils/tokenTemplateName'

/**
 * "Als NSC" wizard — clones a Wiki monster into a user-authored
 * `token_templates` row with category='npc'. The stat block is copied
 * verbatim (name, size, HP, AC, CR, creature_type, speed) and the DM
 * picks an image from one of three sources:
 *
 *   • Current/default variant (one-click "so übernehmen")
 *   • Another variant (strip of thumbnails)
 *   • Custom upload, passed through CircularCropper to produce a
 *     square 256×256 PNG data URL
 *
 * The wizard is intentionally a flat modal rather than a multi-step
 * wizard — the user asked for "either adopt or edit first", so we
 * render both paths on one screen and let them save at any time.
 */
export interface NpcCloneWizardProps {
  monster: MonsterRecord
  language: 'de' | 'en'
  defaultImageUrl: string | null
  defaultTokenFile: string | null
  onClose: () => void
  onSaved: () => void
}

export function NpcCloneWizard({
  monster, language, defaultImageUrl, defaultTokenFile, onClose, onSaved,
}: NpcCloneWizardProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(language === 'de' && monster.nameDe ? monster.nameDe : monster.name)
  const [faction, setFaction] = useState<'neutral' | 'friendly' | 'enemy' | 'party'>('neutral')
  const [variants, setVariants] = useState<TokenVariant[]>([])
  const [selectedTokenFile, setSelectedTokenFile] = useState<string | null>(defaultTokenFile)
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI?.listTokenVariants(monster.slug).then((list) => {
      if (!cancelled) setVariants(list)
    }).catch(() => { /* ignore, variants are optional */ })
    return () => { cancelled = true }
  }, [monster.slug])

  // Esc closes — the wizard sits over the whole app so a keyboard
  // shortcut is the DM's only quick exit if they touched the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const FACTIONS: { value: typeof faction; label: string; color: string }[] = [
    { value: 'party',    label: t('npcWizard.factionParty'),    color: '#22c55e' },
    { value: 'friendly', label: t('npcWizard.factionFriendly'), color: '#3b82f6' },
    { value: 'neutral',  label: t('npcWizard.factionNeutral'),  color: '#f59e0b' },
    { value: 'enemy',    label: t('npcWizard.factionEnemy'),    color: '#ef4444' },
  ]

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setCropSrc(reader.result)
    }
    reader.readAsDataURL(file)
  }

  // Final image the NPC will point at. Upload wins if present — the DM
  // explicitly went out of their way to crop a custom portrait, so the
  // variant they passively clicked earlier shouldn't override it.
  const chosenImage = useMemo<string | null>(() => {
    if (uploadedDataUrl) return uploadedDataUrl
    if (selectedTokenFile) return `bestiary://${monster.slug}/${selectedTokenFile}`
    return defaultImageUrl
  }, [uploadedDataUrl, selectedTokenFile, monster.slug, defaultImageUrl])

  async function handleSave() {
    if (!window.electronAPI || !name.trim()) return
    setBusy(true)
    try {
      // Lift the most useful stats off the monster so the NPC is
      // immediately playable. The slug is set to the source monster's
      // so the Token Library still surfaces the variant strip (DMs can
      // keep swapping artwork after saving).
      const sizeNum = parseSize(monster.meta, language)
      const hpMax   = parseNumericField(monster.hp, language)
      const ac      = parseAcField(monster.ac, language)
      const speed   = monster.speed?.run?.en ?? 30
      const cr      = monster.challenge
      const type    = parseCreatureType(monster.meta, language)

      // token_templates carries UNIQUE(source, name) — the raw INSERT
      // would explode as soon as a DM clones the same monster twice
      // without renaming. Uniquify here so the wizard always succeeds;
      // the DM can rename later in the Token Library.
      const finalName = await uniqueUserTemplateName(name.trim())

      await window.electronAPI.tokenTemplates.create({
        category: 'npc',
        name: finalName,
        image_path: chosenImage,
        size: sizeNum,
        hp_max: hpMax,
        ac,
        speed,
        cr,
        creature_type: type,
        faction,
        slug: monster.slug,
      })
      showToast(t('npcWizard.saved', { name: finalName }), 'success')
      onSaved()
    } catch (err) {
      console.error('[NpcCloneWizard] save failed:', err)
      showToast(t('npcWizard.saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="npc-wiz-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="npc-wiz-card" onClick={(e) => e.stopPropagation()}>
        <header className="npc-wiz-header">
          <div className="npc-wiz-title">{t('npcWizard.title')}</div>
          <button className="npc-wiz-close" onClick={onClose} aria-label={t('cropper.cancel')}>×</button>
        </header>

        <div className="npc-wiz-body">
          {/* Preview + name + faction */}
          <div className="npc-wiz-row">
            <div className="npc-wiz-preview">
              {chosenImage
                ? <img src={chosenImage} alt="" />
                : <div className="npc-wiz-preview-empty">{name.charAt(0).toUpperCase()}</div>
              }
            </div>
            <div className="npc-wiz-fields">
              <label className="npc-wiz-label" htmlFor="npc-wiz-name">{t('npcWizard.name')}</label>
              <input
                id="npc-wiz-name"
                className="npc-wiz-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <div className="npc-wiz-label" id="npc-wiz-faction-label">{t('npcWizard.faction')}</div>
              <div
                className="npc-wiz-factions"
                role="radiogroup"
                aria-labelledby="npc-wiz-faction-label"
              >
                {FACTIONS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={faction === f.value}
                    className={`npc-wiz-faction${faction === f.value ? ' active' : ''}`}
                    style={{ borderColor: faction === f.value ? f.color : undefined, color: f.color }}
                    onClick={() => setFaction(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Variants + upload */}
          <div className="npc-wiz-section-title">{t('npcWizard.image')}</div>
          {variants.length > 0 && (
            <div className="npc-wiz-variants">
              {variants.map((v) => {
                const isSelected = !uploadedDataUrl && selectedTokenFile === v.name
                return (
                  <button
                    key={v.name}
                    type="button"
                    className={`npc-wiz-variant${isSelected ? ' selected' : ''}`}
                    onClick={() => { setSelectedTokenFile(v.name); setUploadedDataUrl(null) }}
                    title={v.name}
                  >
                    <img src={`bestiary://${monster.slug}/${v.name}`} alt="" />
                  </button>
                )
              })}
            </div>
          )}
          <div className="npc-wiz-upload-row">
            <button
              type="button"
              className="npc-wiz-upload-btn"
              onClick={handleUploadClick}
            >
              {uploadedDataUrl
                ? t('npcWizard.replaceUpload')
                : t('npcWizard.uploadImage')}
            </button>
            {uploadedDataUrl && (
              <button
                type="button"
                className="npc-wiz-upload-clear"
                onClick={() => setUploadedDataUrl(null)}
              >
                {t('npcWizard.clearUpload')}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>

        <footer className="npc-wiz-footer">
          <button type="button" className="npc-wiz-btn" onClick={onClose}>
            {t('cropper.cancel')}
          </button>
          <button
            type="button"
            className="npc-wiz-btn npc-wiz-btn-primary"
            onClick={handleSave}
            disabled={busy || !name.trim()}
          >
            {busy ? '…' : t('npcWizard.save')}
          </button>
        </footer>
      </div>

      {cropSrc && (
        <CircularCropper
          src={cropSrc}
          onComplete={(dataUrl) => { setUploadedDataUrl(dataUrl); setCropSrc(null); setSelectedTokenFile(null) }}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  )
}

// ─── Field extractors ─────────────────────────────────────────────────────────
// The Wiki dataset stores most fields as L10n (`{ en, de }`) or L10nArray;
// monsters lift common stats into dedicated numeric fields elsewhere but
// the NPC-template columns want plain numbers / strings. These helpers
// keep the extraction defensive — the dataset has a handful of records
// (banshee, goat, kobold, …) where typed fields collapse to plain
// strings, so we parse lossily rather than throwing.

function parseSize(meta: unknown, language: 'de' | 'en'): number {
  const raw = pickLocalized(meta, language).toLowerCase()
  if (raw.includes('tiny'))       return 1
  if (raw.includes('small'))      return 1
  if (raw.includes('medium'))     return 1
  if (raw.includes('large'))      return 2
  if (raw.includes('huge'))       return 3
  if (raw.includes('gargantuan')) return 4
  // German fallbacks
  if (raw.includes('winzig'))     return 1
  if (raw.includes('klein'))      return 1
  if (raw.includes('mittel'))     return 1
  if (raw.includes('groß'))       return 2
  if (raw.includes('riesig'))     return 3
  if (raw.includes('gigantisch')) return 4
  return 1
}

function parseCreatureType(meta: unknown, language: 'de' | 'en'): string | null {
  const raw = pickLocalized(meta, language)
  // Meta looks like "Medium humanoid, chaotic evil" — we want just
  // the creature type token. Split on whitespace, take the word after
  // a size adjective, and fall back to null if the heuristic misses.
  const parts = raw.split(/[\s,]+/).filter(Boolean)
  if (parts.length >= 2) return parts[1].toLowerCase()
  return null
}

function parseNumericField(field: unknown, language: 'de' | 'en'): number {
  const raw = pickLocalized(field, language)
  // HP looks like "45 (6d8 + 18)" — strip the parenthesised dice.
  const match = raw.match(/\d+/)
  return match ? parseInt(match[0], 10) : 10
}

function parseAcField(field: unknown, language: 'de' | 'en'): number | null {
  const raw = pickLocalized(field, language)
  const match = raw.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

function pickLocalized(field: unknown, language: 'de' | 'en'): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object' && field !== null) {
    const rec = field as Record<string, unknown>
    const v = language === 'de' ? rec.de ?? rec.en : rec.en
    return typeof v === 'string' ? v : ''
  }
  return ''
}
