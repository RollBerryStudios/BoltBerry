import i18next from 'i18next'
import { showToast } from '../components/shared/Toast'

/**
 * Report an async-action failure to both the console (for devs) and the
 * user (via a toast). Replaces the common `.catch(console.error)` idiom
 * that was hiding failures from users — audit WS-8 finding #31.
 *
 * Usage:
 *   window.electronAPI.tokens.update(id, patch)
 *     .catch((err) => reportError('errors.tokenUpdate', err, 'token-panel'))
 *
 * `keyOrMessage` can be either an i18n key (looked up through i18next)
 * or a literal string. The third arg is an optional diagnostic tag that
 * only shows in the console log, not in the user-facing toast.
 */
export function reportError(
  keyOrMessage: string,
  err: unknown,
  tag?: string,
): void {
  const prefix = tag ? `[${tag}] ` : ''
  console.error(`${prefix}${keyOrMessage}`, err)

  // If the key exists in the active locale, use its translation; else
  // fall back to the literal string the caller passed in.
  const translated = i18next.t(keyOrMessage, { defaultValue: keyOrMessage })
  showToast(String(translated), 'error')
}

/**
 * Convenience: wrap a promise so the caller doesn't have to `.catch`
 * manually. Resolves to `undefined` on error (so downstream awaits
 * don't throw) — if the caller needs the error itself, use
 * `reportError` directly in `.catch`.
 */
export async function withErrorToast<T>(
  keyOrMessage: string,
  promise: Promise<T>,
  tag?: string,
): Promise<T | undefined> {
  try {
    return await promise
  } catch (err) {
    reportError(keyOrMessage, err, tag)
    return undefined
  }
}
