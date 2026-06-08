import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { setupMockApi } from './utils/mockApi.js'

// Intercept all fetch and WebSocket connections for client-side offline execution
setupMockApi();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
