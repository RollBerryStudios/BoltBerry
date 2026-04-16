import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useTokenStore } from '../stores/tokenStore'

// Floating toolbar that appears at the bottom-center of the canvas whenever
// 2+ tokens are selected. Offers the three bulk operations that the single-token
// inspector can't reasonably do one at a time: toggle visibility, delete all,
// clear selection.
//
// Persists no state of its own — derives everything from uiStore + tokenStore.
export function MultiSelectBar() {
  const { t } = useTranslation()
  const selectedTokenIds = useUIStore((s) => s.selectedTokenIds)
  const tokens = useTokenStore((s) => s.tokens)
  const clearTokenSelection = useUIStore((s) => s.clearTokenSelection)

  if (selectedTokenIds.length < 2) return null

  const selected = tokens.filter((tok) => selectedTokenIds.includes(tok.id))
  if (selected.length === 0) return null

  // If at least one selected token is hidden from players, "Toggle visibility"
  // should make all of them visible. Otherwise it hides them all. This mirrors
  // the "mixed state" convention used by most multi-select controls.
  const anyHidden = selected.some((tok) => !tok.visibleToPlayers)
  const nextVisible = anyHidden

  const handleToggleVisibility = () => {
    const { updateToken } = useTokenStore.getState()
    for (const id of selectedTokenIds) {
      updateToken(id, { visibleToPlayers: nextVisible })
      window.electronAPI?.dbRun(
        'UPDATE tokens SET visible_to_players = ? WHERE id = ?',
        [nextVisible ? 1 : 0, id]
      )
    }
  }

  const handleDelete = async () => {
    const confirmed = await window.electronAPI?.confirmDialog?.(
      t('multiSelect.deleteTitle'),
      t('multiSelect.deleteMessage', { count: selectedTokenIds.length })
    )
    if (!confirmed) return
    const { removeToken } = useTokenStore.getState()
    for (const id of selectedTokenIds) {
      removeToken(id)
      window.electronAPI?.dbRun('DELETE FROM tokens WHERE id = ?', [id])
    }
    clearTokenSelection()
  }

  return (
    <div className="multi-select-bar" role="toolbar" aria-label={t('multiSelect.label')}>
      <span className="multi-select-count">
        {t('multiSelect.countSelected', { count: selectedTokenIds.length })}
      </span>
      <div className="multi-select-divider" />
      <button
        type="button"
        className="multi-select-btn"
        onClick={handleToggleVisibility}
        title={nextVisible ? t('multiSelect.showAll') : t('multiSelect.hideAll')}
      >
        {nextVisible ? '👁 ' : '🚫 '}
        {nextVisible ? t('multiSelect.showAll') : t('multiSelect.hideAll')}
      </button>
      <button
        type="button"
        className="multi-select-btn multi-select-btn-danger"
        onClick={handleDelete}
        title={t('multiSelect.deleteAll')}
      >
        🗑 {t('multiSelect.deleteAll')}
      </button>
      <button
        type="button"
        className="multi-select-btn multi-select-btn-ghost"
        onClick={clearTokenSelection}
        title={t('multiSelect.clear')}
      >
        ✕ {t('multiSelect.clear')}
      </button>
    </div>
  )
}
