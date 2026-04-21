import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImageUrl } from '../hooks/useImageUrl'

/* Shared building blocks for the campaign-picker screens (Welcome + any
   future dense view). The data hook makes a single batched query per
   resource — three indexed lookups instead of N round-trips.
   Avatars and thumbnails fall back to deterministic colors so empty
   campaigns still render something recognisable. */

export interface CampaignStats {
  mapCount: number
  handoutCount: number
  thumbnailPath: string | null
  party: Array<{ name: string; className: string; level: number }>
  sessionCount: number
  lastSessionAt: string | null
}

export type StatsMap = Record<number, CampaignStats>

export interface RecentMap {
  id: number
  name: string
  imagePath: string
  campaignId: number
  campaignName: string
}

export interface GlobalStats {
  campaignCount: number
  mapCount: number
  characterCount: number
}

// ─── Hooks ───────────────────────────────────────────────────────────

export function useCampaignStats(campaignIds: number[]): StatsMap {
  const [stats, setStats] = useState<StatsMap>({})
  // Stable key from the id list — avoids re-running the effect on every
  // identity-but-not-content change of the campaigns array.
  const key = campaignIds.join(',')

  useEffect(() => {
    if (!window.electronAPI || campaignIds.length === 0) {
      setStats({})
      return
    }
    let cancelled = false
    void loadCampaignStats(campaignIds).then((result) => {
      if (!cancelled) setStats(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return stats
}

export function useRecentMaps(campaignIds: number[], limit = 6): RecentMap[] {
  const [maps, setMaps] = useState<RecentMap[]>([])
  const key = campaignIds.join(',')

  useEffect(() => {
    if (!window.electronAPI || campaignIds.length === 0) {
      setMaps([])
      return
    }
    let cancelled = false
    void loadRecentMaps(campaignIds, limit).then((rows) => {
      if (!cancelled) setMaps(rows)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit])

  return maps
}

export function useGlobalStats(deps: ReadonlyArray<unknown> = []): GlobalStats {
  const [stats, setStats] = useState<GlobalStats>({
    campaignCount: 0,
    mapCount: 0,
    characterCount: 0,
  })

  useEffect(() => {
    if (!window.electronAPI) return
    let cancelled = false
    void loadGlobalStats().then((s) => {
      if (!cancelled) setStats(s)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return stats
}

// Returns a localized relative-time string for an ISO timestamp. Memoised
// per timestamp — no live ticking; relative times only need to be correct
// when the screen renders.
export function useRelativeTime(iso: string): string {
  const { t } = useTranslation()
  return useMemo(() => {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diffMs = Date.now() - then
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 60) return t('dashboard.justNow')
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('dashboard.hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days === 1) return t('dashboard.daysAgoOne')
    return t('dashboard.daysAgo', { count: days })
  }, [iso, t])
}

// Deterministic hue from a string — same input always renders the same
// color across the app.
export function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

// ─── Components ─────────────────────────────────────────────────────

export function MapThumbnail({
  path,
  campaignName,
  className,
}: {
  path: string | null
  campaignName: string
  className?: string
}) {
  const url = useImageUrl(path)
  if (!path || !url) {
    const initial = campaignName.trim().charAt(0).toUpperCase() || '?'
    const hue = hashHue(campaignName)
    return (
      <div
        className={className ? `bb-thumb-fallback ${className}` : 'bb-thumb-fallback'}
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 40% 24%), hsl(${hue} 30% 14%))`,
        }}
      >
        {initial}
      </div>
    )
  }
  return (
    <img
      className={className ? `bb-thumb-img ${className}` : 'bb-thumb-img'}
      src={url}
      alt=""
      draggable={false}
    />
  )
}

export function PartyAvatars({
  party,
  max = 4,
  size = 26,
  border = 'var(--bg-surface)',
}: {
  party: CampaignStats['party']
  max?: number
  size?: number
  border?: string
}) {
  const shown = party.slice(0, max)
  const extra = party.length - shown.length
  return (
    <div className="bb-party">
      {shown.map((p, i) => {
        const initial = (p.name.trim().charAt(0) || '?').toUpperCase()
        const hue = hashHue(p.name + p.className)
        return (
          <div
            key={`${p.name}-${i}`}
            className="bb-party-avatar"
            title={`${p.name} · ${p.className}${p.level ? ' · Lv ' + p.level : ''}`}
            style={{
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -8,
              background: `hsl(${hue} 55% 55%)`,
              borderColor: border,
              zIndex: max - i,
              fontSize: size * 0.42,
            }}
          >
            {initial}
          </div>
        )
      })}
      {extra > 0 && (
        <div
          className="bb-party-avatar bb-party-extra"
          style={{
            width: size,
            height: size,
            marginLeft: -8,
            borderColor: border,
            fontSize: size * 0.4,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}

// Shared CSS for the components above, scoped via class prefix `bb-`.
// Injected once per app as a free-standing <style> block — the components
// here are usable in any container (dashboard, welcome, future variants).
export function CampaignDataStyles() {
  return (
    <style>{`
      .bb-thumb-img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
      }
      .bb-thumb-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        font-size: 64px;
        color: rgba(255, 255, 255, 0.55);
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-weight: 500;
      }
      .bb-party { display: flex; }
      .bb-party-avatar {
        border-radius: 50%;
        color: var(--text-inverse);
        font-family: var(--font-mono);
        font-weight: 700;
        border: 2px solid var(--bg-surface);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .bb-party-extra {
        background: var(--bg-elevated);
        color: var(--text-secondary);
        font-weight: 600;
      }
    `}</style>
  )
}

// ─── Loaders ────────────────────────────────────────────────────────

async function loadCampaignStats(campaignIds: number[]): Promise<StatsMap> {
  if (!window.electronAPI || campaignIds.length === 0) return {}
  const placeholders = campaignIds.map(() => '?').join(',')

  const [maps, handouts, chars, sessions] = await Promise.all([
    window.electronAPI.maps.listForStats(campaignIds),
    window.electronAPI.handouts.countByCampaigns(campaignIds),
    window.electronAPI.dbQuery<{ campaign_id: number; name: string; class_name: string; level: number }>(
      `SELECT campaign_id, name, class_name, level
       FROM character_sheets WHERE campaign_id IN (${placeholders})
       ORDER BY level DESC, id ASC`,
      campaignIds,
    ),
    window.electronAPI.dbQuery<{ campaign_id: number; n: number; last_at: string | null }>(
      `SELECT campaign_id, COUNT(*) as n, MAX(started_at) as last_at
       FROM sessions WHERE campaign_id IN (${placeholders}) GROUP BY campaign_id`,
      campaignIds,
    ),
  ])

  const out: StatsMap = {}
  for (const id of campaignIds) {
    out[id] = { mapCount: 0, handoutCount: 0, thumbnailPath: null, party: [], sessionCount: 0, lastSessionAt: null }
  }
  for (const row of maps) {
    const entry = out[row.campaignId]
    if (!entry) continue
    entry.mapCount += 1
    if (entry.thumbnailPath === null) entry.thumbnailPath = row.imagePath
  }
  for (const row of handouts) {
    const entry = out[row.campaignId]
    if (entry) entry.handoutCount = row.count
  }
  for (const row of chars) {
    const entry = out[row.campaign_id]
    if (entry) {
      entry.party.push({ name: row.name, className: row.class_name, level: row.level })
    }
  }
  for (const row of sessions) {
    const entry = out[row.campaign_id]
    if (entry) {
      entry.sessionCount = row.n
      entry.lastSessionAt = row.last_at
    }
  }
  return out
}

async function loadRecentMaps(campaignIds: number[], limit: number): Promise<RecentMap[]> {
  if (!window.electronAPI || campaignIds.length === 0) return []
  return window.electronAPI.maps.listRecent(campaignIds, limit)
}

async function loadGlobalStats(): Promise<GlobalStats> {
  if (!window.electronAPI) {
    return { campaignCount: 0, mapCount: 0, characterCount: 0 }
  }
  const [campaignCount, mapCount, chars] = await Promise.all([
    window.electronAPI.campaigns.count(),
    window.electronAPI.maps.count(),
    window.electronAPI.dbQuery<{ n: number }>('SELECT COUNT(*) as n FROM character_sheets'),
  ])
  return {
    campaignCount,
    mapCount,
    characterCount: chars[0]?.n ?? 0,
  }
}
