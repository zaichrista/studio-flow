import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './lib/store'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)

// Let the loading animation finish (about 3.4s from launch), then fade it away.
// A tap skips it. A slow launch never waits any longer than it already has.
const splash = document.getElementById('splash')
if (splash) {
  const hide = () => {
    splash.classList.add('out')
    setTimeout(() => splash.remove(), 1100)
  }
  splash.addEventListener('click', hide, { once: true })
  setTimeout(hide, Math.max(300, 3400 - performance.now()))
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
