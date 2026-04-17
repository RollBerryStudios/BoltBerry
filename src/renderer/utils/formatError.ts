/**
 * Normalise an unknown thrown value into a short, user-facing string. Stops
 * us from rendering `[object Object]`, stack traces, or raw SQLite codes
 * inside toast messages and error banners. The full exception is still
 * available in the console for triage.
 */
export function formatError(err: unknown): string {
  if (err == null) return 'Unbekannter Fehler'
  if (err instanceof Error) return err.message || err.name || 'Fehler'
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
