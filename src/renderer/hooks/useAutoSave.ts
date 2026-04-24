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
      if (document.visibilityState === 'hidden') triggerSave(true)
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Save-now keyboard shortcut already calls window.electronAPI.saveNow()
    // which is a no-op since better-sqlite3 writes are synchronous.
    // We just need to update the UI indicator here.
    const onSaveNow = () => triggerSave(true)
    window.addEventListener('boltberry:save-now', onSaveNow)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('boltberry:save-now', onSaveNow)
    }
  }, [])
}

async function triggerSave(force = false) {
  const { activeCampaignId } = useCampaignStore.getState()
  if (!activeCampaignId || !window.electronAPI) return

  // Skip the interval path when nothing has changed since the last save
  // — previously `touchLastOpened` hit the DB every 60 s regardless,
  // producing needless IPC traffic + WAL churn. Manual save (save-now,
  // visibility-change) still forces a write.
  const { dirty } = useAppStore.getState()
  if (!force && !dirty) return

  useAppStore.getState().setSaving()
  try {
    await window.electronAPI.campaigns.touchLastOpened(activeCampaignId)
    useAppStore.getState().setSaved()
  } catch {
    useAppStore.getState().setSaveError()
  }
}
