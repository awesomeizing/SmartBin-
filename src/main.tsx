
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { DatabaseProvider } from './contexts/DatabaseContext'
import { HardwareSerialProvider } from './contexts/HardwareSerialContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { ToastContainer } from './components/ui/toast'
import { HardwareIntegrationProvider } from './components/hardware/HardwareIntegrationProvider'
import App from './App.tsx'
import './index.css'

function Root() {
  useEffect(() => {
    // Force dark mode for the premium enterprise theme
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <DatabaseProvider>
          <HardwareSerialProvider>
            <NotificationProvider>
              <HardwareIntegrationProvider>
                <App />
                <ToastContainer />
              </HardwareIntegrationProvider>
            </NotificationProvider>
          </HardwareSerialProvider>
        </DatabaseProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
