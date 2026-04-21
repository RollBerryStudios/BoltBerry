import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import App from './App'

// Apply saved theme before render to avoid flash
const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
document.documentElement.setAttribute('data-theme', saved ?? 'dark')

// Electron's titleBarOverlay scales the native min / max / close buttons
// with the OS DPI — ~138 CSS px at 100%, ~173 at 125%, ~207 at 150%.
// Every drag-region top bar (DmTitleBar, Welcome, CampaignView, Wiki,
// Compendium) reserves that gutter via `--titlebar-controls-w`. A
// hard-coded 176 px covered up to 125% only; 150% screens saw the
// action buttons slide under the native controls. Compute the value
// at runtime here and refresh it whenever the window moves between
// monitors at different DPI (Electron fires `resize` on DPI change).
//
// Formula: 138 CSS px at 1× scales linearly with devicePixelRatio.
// Add a 22 px buffer so the focused action button never touches the
// control edge. macOS's traffic lights are a fixed width handled
// separately via `--titlebar-traffic-w`, so we skip the update on
// that platform.
function applyTitlebarGutter() {
  const dpr = window.devicePixelRatio || 1
  const width = Math.round(138 * dpr) + 22
  document.documentElement.style.setProperty('--titlebar-controls-w', `${width}px`)
}
if (!/Mac/i.test(navigator.platform)) {
  applyTitlebarGutter()
  window.addEventListener('resize', applyTitlebarGutter)
}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
