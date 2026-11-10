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

// The loading animation plays in full (about 3.4s) on every open, or, if chosen
// in Settings, only on the first open of the day. A tap always skips it.
const splash = document.getElementById('splash')
if (splash) {
  const today = new Date().toDateString()
  let seenToday = false
  try {
    const saved = JSON.parse(localStorage.getItem('studio-flow:v2') ?? '{}') as { settings?: { splash?: string } }
    const daily = saved.settings?.splash === 'daily'
    seenToday = daily && localStorage.getItem('studio-flow:splash') === today
    localStorage.setItem('studio-flow:splash', today)
  } catch {
    /* ignore */
  }
  // What it's all for, in your words, if you've written it.
  let why = ''
  try {
    const saved = JSON.parse(localStorage.getItem('studio-flow:v2') ?? '{}') as { settings?: { why?: string } }
    why = (saved.settings?.why ?? '').trim()
  } catch {
    /* ignore */
  }
  const timers: number[] = []
  const hide = () => {
    timers.forEach(clearTimeout)
    splash.classList.add('out')
    setTimeout(() => splash.remove(), 1100)
  }
  splash.addEventListener('click', hide, { once: true })
  if (seenToday) {
    splash.classList.add('quick')
    hide()
  } else if (why) {
    // The mark settles (about 3s), gives way to the line, which types out and stays for a beat or two.
    const target = splash.querySelector<HTMLElement>('.why p')!
    const box = splash.querySelector<HTMLElement>('.why')!
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = calm ? 0 : Math.max(28, Math.min(70, 3200 / why.length))
    const start = Math.max(0, 3100 - performance.now())
    timers.push(window.setTimeout(() => splash.classList.add('why-on'), start))
    timers.push(
      window.setTimeout(() => {
        let i = 0
        const type = () => {
          target.textContent = why.slice(0, ++i)
          if (i < why.length) timers.push(window.setTimeout(type, step))
          else {
            box.classList.add('done')
            timers.push(window.setTimeout(hide, 2200))
          }
        }
        if (step === 0) {
          target.textContent = why
          box.classList.add('done')
          timers.push(window.setTimeout(hide, 2600))
        } else type()
      }, start + 900),
    )
  } else {
    setTimeout(hide, Math.max(300, 3400 - performance.now()))
  }
}

// The service worker caches files for offline use, which would serve stale
// code while developing, so it only runs in the built app. In dev, any copy
// left from an earlier visit is removed along with its cache.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {})
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {})
    caches?.keys().then((keys) => keys.filter((k) => k.startsWith('studio-flow')).forEach((k) => caches.delete(k))).catch(() => {})
  }
}
