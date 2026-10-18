import { useStore } from '../lib/store'

const Sun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" fill="currentColor" fillOpacity=".18" />
    <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" />
  </svg>
)

const Moon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z" fill="currentColor" fillOpacity=".14" />
  </svg>
)

/** The sun (or moon) in the corner: one tap swaps light and dark, with a slow cross-fade. */
export function ThemeToggle({ theme }: { theme: 'light' | 'dark' }) {
  const { update } = useStore()
  const next = theme === 'dark' ? 'light' : 'dark'
  const flip = () => {
    const root = document.documentElement
    root.classList.add('theme-fade')
    window.setTimeout(() => root.classList.remove('theme-fade'), 900)
    update((d) => ({ ...d, settings: { ...d.settings, look: { ...d.settings.look, theme: next } } }))
  }
  return (
    <button className="theme-toggle" onClick={flip} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <span className={`orb ${theme}`}>
        <Sun />
        <Moon />
      </span>
    </button>
  )
}
