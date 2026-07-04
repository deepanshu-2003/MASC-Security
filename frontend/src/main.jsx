import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MascToastProvider } from './sdk/MascToast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MascToastProvider>
      <App />
    </MascToastProvider>
  </StrictMode>,
)
