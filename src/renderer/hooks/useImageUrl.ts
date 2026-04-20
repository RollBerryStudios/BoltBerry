import { useState, useEffect } from 'react'

// Sentinel stored in cache when a path was fetched but returned null (missing file).
// Prevents repeated IPC calls for the same broken path.
const MISSING = '__missing__'
const cache = new Map<string, string>()

export function invalidateImageUrlCache(src: string | null) {
  if (src) cache.delete(src)
}

/** Parse "bestiary://<slug>/<file>". Returns null on any malformed URL
 *  (wrong scheme, missing slug or file, traversal attempts). Kept in
 *  sync with the main-process SLUG_RE guard in data-handlers. */
export function parseBestiaryUrl(src: string): { slug: string; file: string } | null {
  if (!src.startsWith('bestiary://')) return null
  const rest = src.slice('bestiary://'.length)
  const firstSlash = rest.indexOf('/')
  if (firstSlash <= 0) return null
  const slug = rest.slice(0, firstSlash)
  const file = rest.slice(firstSlash + 1)
  if (!slug || !file) return null
  if (file.includes('/') || file.includes('\\') || file.includes('..')) return null
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null
  return { slug, file }
}

export function encodeBestiaryUrl(slug: string, file: string): string {
  return `bestiary://${slug}/${file}`
}

export function useImageUrl(src: string | null): string | null {
  const [url, setUrl] = useState<string | null>(
    src ? (cache.get(src) ?? null) : null
  )

  useEffect(() => {
    if (!src) {
      setUrl(null)
      return
    }

    if (cache.has(src)) {
      const cached = cache.get(src)!
      setUrl(cached === MISSING ? null : cached)
      return
    }

    // Peel a leading `file://` so callers that unconditionally prefix it
    // still reach the right scheme handler below. The full src stays the
    // cache key so `invalidateImageUrlCache` using the prefixed form
    // keeps working.
    const effective = src.startsWith('file://') ? src.substring(7) : src

    // data: URLs are already usable directly
    if (effective.startsWith('data:')) {
      setUrl(effective)
      return
    }

    let cancelled = false

    // bestiary://<slug>/<file> — shipped dataset tokens. Keep the key
    // short in the DB (avoids storing 30–50 KB of base64 per token row)
    // and resolve lazily through the data handler, which returns a
    // base64 data URL the same way the asset reader does.
    if (effective.startsWith('bestiary://')) {
      const parsed = parseBestiaryUrl(effective)
      if (!parsed) {
        cache.set(src, MISSING)
        setUrl(null)
        return
      }
      const loader = window.electronAPI?.getMonsterTokenUrl ?? window.playerAPI?.getMonsterTokenUrl
      loader?.(parsed.slug, parsed.file).then((imageData) => {
        if (cancelled) return
        if (imageData) {
          cache.set(src, imageData)
          setUrl(imageData)
        } else {
          cache.set(src, MISSING)
          setUrl(null)
        }
      }).catch(() => {
        if (!cancelled) {
          cache.set(src, MISSING)
          setUrl(null)
        }
      })
      return () => { cancelled = true }
    }

    // Route as a userData-relative path through the main process.
    window.electronAPI?.getImageAsBase64(effective).then((imageData) => {
      if (cancelled) return
      if (imageData) {
        cache.set(src, imageData)
        setUrl(imageData)
      } else {
        cache.set(src, MISSING)
        setUrl(null)
      }
    }).catch(() => {
      if (!cancelled) {
        cache.set(src, MISSING)
        setUrl(null)
      }
    })
    return () => { cancelled = true }
  }, [src])

  return url
}