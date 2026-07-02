import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initI18n } from './i18n'
import './store/themeStore' // applies persisted light/dark theme before first paint
import App from './App.tsx'

// Wait for the active language to load before the first render so there is no
// missing-translation flash. Render regardless if i18n init fails.
initI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
