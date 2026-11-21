import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { I18nProvider } from './i18n'
import { SyncProvider } from './offline/SyncProvider'
import { HelperProvider } from './pages/helper/HelperContext'
import './index.css'

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <SyncProvider>
            <HelperProvider>
              <App />
            </HelperProvider>
          </SyncProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
