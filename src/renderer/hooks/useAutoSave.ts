import { useEffect, useRef } from 'react'
import { useCampaignStore } from '../stores/campaignStore'
import { useAppStore } from '../stores/appStore'

const AUTOSAVE_INTERVAL = 60_000

export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      triggerSave()
    }, AUTOSAVE_INTERVAL)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') triggerSave()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Save-now keyboard shortcut already calls window.electronAPI.saveNow()
    // which is a no-op since better-sqlite3 writes are synchronous.
    // We just need to update the UI indicator here.
    const onSaveNow = () => triggerSave()
    window.addEventListener('rollberry:save-now', onSaveNow)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('rollberry:save-now', onSaveNow)
    }
  }, [])
}

async function triggerSave() {
  const { activeCampaignId } = useCampaignStore.getState()
  if (!activeCampaignId || !window.electronAPI) return

  useAppStore.getState().setSaving()
  try {
    await window.electronAPI.dbRun(
      `UPDATE campaigns SET last_opened = datetime('now') WHERE id = ?`,
      [activeCampaignId]
    )
    useAppStore.getState().setSaved()
  } catch {
    useAppStore.getState().setSaveError()
  }
}
