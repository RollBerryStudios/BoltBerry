import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Apply saved theme before render to avoid flash
const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
document.documentElement.setAttribute('data-theme', saved ?? 'dark')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
