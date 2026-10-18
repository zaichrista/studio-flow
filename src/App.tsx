import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { IconBoard, IconChevronDown, IconChevronLeft, IconDump, IconGear, IconMoney, IconToday, IconWeek, IconWork, Mark } from './components/Icons'
import { Toaster } from './components/Toast'
import { TimerDock } from './components/TimerDock'
import { syncIfEnabled } from './lib/push'
import { useStore } from './lib/store'
import { Board } from './pages/Board'
import { Dump } from './pages/Dump'
import { Money } from './pages/Money'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'
import { Week } from './pages/Week'
import { Work } from './pages/Work'

export type PageId = 'today' | 'dump' | 'week' | 'board' | 'work' | 'money' | 'settings'

const NAV: { id: PageId; label: string; icon: () => ReactElement }[] = [
  { id: 'today', label: 'Today', icon: IconToday },
  { id: 'dump', label: 'Dump', icon: IconDump },
  { id: 'week', label: 'Week', icon: IconWeek },
  { id: 'board', label: 'Board', icon: IconBoard },
  { id: 'work', label: 'Work', icon: IconWork },
  { id: 'money', label: 'Money', icon: IconMoney },
  { id: 'settings', label: 'Settings', icon: IconGear },
]

const PAGE_KEY = 'studio-flow:page'
const MENU_KEY = 'studio-flow:menu'

function initialPage(): PageId {
  try {
    const saved = localStorage.getItem(PAGE_KEY) as PageId | null
    if (saved && NAV.some((n) => n.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return 'today'
}

/** True while the viewport matches a media query. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handle = () => setOn(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [query])
  return on
}

export default function App() {
  const { data } = useStore()
  const wide = useMedia('(min-width: 1000px)')
  const look = data.settings.look
  const mode = look.nav === 'auto' ? (wide ? 'rail' : 'bar') : look.nav
  const myName = data.settings.name.trim()

  // The palette lives on <html> so the whole page, and the browser chrome, follows it.
  useEffect(() => {
    document.documentElement.dataset.palette = look.palette
    const id = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
      if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
    })
    return () => cancelAnimationFrame(id)
  }, [look.palette])
  const [page, setPage] = useState<PageId>(initialPage)
  const [menuOpen, setMenuOpen] = useState(() => {
    try {
      return localStorage.getItem(MENU_KEY) !== 'closed'
    } catch {
      return true
    }
  })

  const showMenu = (open: boolean) => {
    setMenuOpen(open)
    try {
      localStorage.setItem(MENU_KEY, open ? 'open' : 'closed')
    } catch {
      /* ignore */
    }
  }

  const go = (p: PageId) => {
    setPage(p)
    window.scrollTo({ top: 0 })
    try {
      localStorage.setItem(PAGE_KEY, p)
    } catch {
      /* ignore */
    }
  }

  // Keep the server's reminder list in step with the calendar.
  useEffect(() => {
    const t = setTimeout(() => syncIfEnabled(data).catch(() => {}), 1500)
    return () => clearTimeout(t)
  }, [data.blocks, data.tasks, data.active, data.settings])

  const view = {
    today: <Today go={go} />,
    dump: <Dump go={go} />,
    week: <Week />,
    board: <Board />,
    work: <Work />,
    money: <Money />,
    settings: <Settings />,
  }[page]

  return (
    <div className={`app ${menuOpen ? '' : 'menu-closed'}`} data-mode={mode} data-density={look.density}>
      <aside className="rail">
        <div className="mark">studio<span>.</span>flow</div>
        <nav aria-label="Main">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navbtn ${page === id ? 'on' : ''}`} onClick={() => go(id)}>
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        {myName && (
          <div className="me">
            <span className="avatar" aria-hidden="true">{myName.charAt(0).toUpperCase()}</span>
            <span className="who"><b>{myName}</b></span>
          </div>
        )}
        <button className="hide-menu" onClick={() => showMenu(false)} aria-label="Hide menu">
          <IconChevronLeft />
          Hide menu
        </button>
      </aside>
      <main className="main">{view}</main>
      <nav className="dock" aria-label="Main">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`navbtn ${page === id ? 'on' : ''}`} onClick={() => go(id)}>
            <Icon />
            {label}
          </button>
        ))}
        <button className="hide-menu" onClick={() => showMenu(false)} aria-label="Hide menu">
          <IconChevronDown />
        </button>
      </nav>
      <button className="menu-fab" onClick={() => showMenu(true)} aria-label="Show menu" tabIndex={menuOpen ? -1 : 0}>
        <Mark />
      </button>
      <TimerDock hidden={page === 'today'} />
      <Toaster />
    </div>
  )
}
