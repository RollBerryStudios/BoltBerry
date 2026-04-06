import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PlayerApp from './PlayerApp'

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <PlayerApp />
  </StrictMode>
)
