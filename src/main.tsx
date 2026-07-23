import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import { initI18n } from './i18n'
import './store/themeStore' // applies persisted light/dark theme before first paint
import App from './App.tsx'

// Start translations and the app together. Protected routes paint their
// loading shell while the profile and locale chunks resolve, so waiting here
// only serialized profile/tender requests behind i18n and delayed LCP.
void initI18n().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
