// Probe (temporary, deleted after the check): the real MainLayout + route table
// with a fake production API, to look at the project page and the device page.
import '../src/styles/fonts.css'
import '../src/index.css'
import '../src/styles/refine.css'
import '../src/styles/quickAdd.css'
import '../src/styles/quickEntry.css'
import '../src/styles/buttons.css'
import '../src/styles/controls.css'
import '../src/styles/appleModal.css'
import '../src/styles/updateWindow.css'
import '../src/styles/notifications.css'
import '../src/styles/headerMac.css'
import '../src/styles/topNavigation.css'
import '../src/styles/headerToolbar.css'
import '../src/styles/focusRail.css'
import '../src/styles/motion.css'
import '../src/store/themeStore'
import '../src/styles/dark.css'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { initI18n } from '../src/i18n'
import { apiClient } from '../src/lib/axios'
import { productionApi } from '../src/lib/api/production'
import { useAuthStore } from '../src/store/authStore'
import { ALL_UPDATE_IDS } from '../src/components/updates/updateNotes'
import { MainLayout } from '../src/components/layout/MainLayout'
import { renderAppPageRoutes } from '../src/routes/appPageRoutes'
import fixture from './fixture.json'

const params = new URLSearchParams(window.location.search)
const dark = params.get('theme') === 'dark'
const admin = params.get('admin') !== '0'
const lang = params.get('lang') || 'tr'
const path = params.get('path') || '/production/orders/p1'
const nav = params.get('nav') || 'sidebar'

document.documentElement.classList.toggle('dark', dark)
localStorage.setItem('theme', dark ? 'dark' : 'light')
localStorage.setItem('offitec:lang', lang)
localStorage.setItem('offitec:navigation-mode', nav)
localStorage.setItem('offitec-updates-seen:u1', JSON.stringify(ALL_UPDATE_IDS))

// Nothing leaves the page: every request fails as "offline" (no 401 → no logout).
apiClient.defaults.adapter = () => Promise.reject(Object.assign(new Error('offline'), { code: 'ERR_NETWORK', isAxiosError: true, config: {} }))

const data = JSON.parse(JSON.stringify(fixture))
data.devices[0].intake = [{ purchaseOrderId: 'po1', referenceNumber: 'BE-2026-007', sourceTenantName: 'Offitec Group AG', status: 'TO_BE_STOCKED', quantity: 1 }]
data.devices[0].description = 'Aussengerät, 30 kW, R32 — Schaltschrank mit Steuerung und Einspeisung'
if (data.details) data.details.intake = [{ purchaseOrderId: 'po1', referenceNumber: 'BE-2026-007', sourceTenantName: 'Offitec Group AG' }]
;(productionApi as unknown as { devices: (id: string) => Promise<unknown> }).devices = async (id: string) => {
    await new Promise((resolve) => setTimeout(resolve, 120))
    return { ...data, project: { ...data.project, id } }
}

useAuthStore.setState({
    user: { id: 'u1', firstName: 'Samet', lastName: 'Çelik', email: 'samet@offitec.ch', tenantId: 't1' },
    tenants: [{ id: 't1', tenantName: 'Offitec Isıtma & Soğutma A.Ş.', parentTenantId: null, isProjectModuleEnabled: true }],
    selectedTenantId: 't1',
    permissions: ['production.view', 'inventory.view', 'crm.customers.view', 'tenders.view', 'projects.view', 'tasks.view', 'billing.view', 'panels.view'],
    pageAccess: {},
    isSystemAdmin: admin,
    isAuthenticated: true,
    isLoading: false,
})

window.history.replaceState(null, '', path)

initI18n().then(() => {
    createRoot(document.getElementById('root')!).render(
        <BrowserRouter>
            <Routes>
                <Route element={<MainLayout />}>{renderAppPageRoutes()}</Route>
            </Routes>
        </BrowserRouter>,
    )
})
