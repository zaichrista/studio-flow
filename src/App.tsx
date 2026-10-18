import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { IconBoard, IconChevronDown, IconChevronLeft, IconDump, IconGear, IconMoney, IconPlus, IconToday, IconWeek, IconWork, Mark } from './components/Icons'
import { FocusMode, openFocus } from './components/FocusMode'
import { RestGuard } from './components/RestGuard'
import { openCapture, QuickCapture } from './components/QuickCapture'
import { ResumePrompt } from './components/ResumePrompt'
import { requestShutdown } from './components/Shutdown'
import { toast, Toaster } from './components/Toast'
import { startTimer } from './lib/actions'
import { ThemeToggle } from './components/ThemeToggle'
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
const SEEN_KEY = 'studio-flow:seen'
/** Away longer than this and the app opens on Today, where the next thing is. */
const AWAY_MS = 60 * 60_000

const awayLong = () => {
  try {
    return Date.now() - Number(localStorage.getItem(SEEN_KEY) ?? 0) > AWAY_MS
  } catch {
    return false
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function initialPage(): PageId {
  try {
    if (awayLong() || new URLSearchParams(location.search).has('n')) return 'today'
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
  const { data, update } = useStore()
  const wide = useMedia('(min-width: 1000px)')
  const look = data.settings.look
  const mode = look.nav === 'auto' ? (wide ? 'rail' : 'bar') : look.nav
  const myName = data.settings.name.trim()

  // Palette and light/dark live on <html> so the whole page, and the browser chrome, follow them.
  const dark = useMedia('(prefers-color-scheme: dark)')
  const theme = look.theme === 'auto' ? (dark ? 'dark' : 'light') : look.theme
  useEffect(() => {
    document.documentElement.dataset.palette = look.palette
    document.documentElement.dataset.theme = theme
    const id = requestAnimationFrame(() => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
      if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
    })
    return () => cancelAnimationFrame(id)
  }, [look.palette, theme])
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

  // Coming back after a while lands on Today.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (awayLong()) go('today')
      }
      markSeen()
    }
    markSeen()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // A tapped notification takes you to the thing it was about.
  const latest = useRef(data)
  latest.current = data
  useEffect(() => {
    const handle = (tag: string) => {
      const d = latest.current
      if (tag.startsWith('block:')) {
        go('today')
        const block = d.blocks.find((b) => b.id === tag.slice(6))
        const task = block && d.tasks.find((t) => t.id === block.taskId)
        if (block && task && !block.done && block.date && !d.active) {
          update((x) => startTimer(x, task.id, block.id))
          toast(`Started ${task.title}. Stop any time.`)
        }
      } else if (tag.startsWith('shutdown:')) {
        go('today')
        requestShutdown()
      } else if (tag === 'focus' || tag === 'trial') {
        go('today')
        if (d.active) openFocus()
      } else if (tag.startsWith('inv:') || tag.startsWith('tax:')) {
        go('money')
      } else if (tag) {
        go('today')
      }
    }
    const params = new URLSearchParams(location.search)
    const tag = params.get('n')
    if (tag) {
      history.replaceState(null, '', location.pathname)
      // Wait a moment so the stored plan has loaded and re-planned.
      setTimeout(() => handle(tag), 300)
    }
    const onMessage = (e: MessageEvent) => {
      const t = (e.data as { notification?: string } | null)?.notification
      if (t) handle(t)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  // Keep the server's reminder list in step with the calendar.
  useEffect(() => {
    const t = setTimeout(() => syncIfEnabled(data).catch(() => {}), 1500)
    return () => clearTimeout(t)
  }, [data.blocks, data.tasks, data.active, data.settings, data.projects, data.closedOn])

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
    <div className={`app ${menuOpen ? '' : 'menu-closed'}`} data-mode={mode} data-density={look.density} data-surface={look.surface}>
      <aside className="rail">
        <div className="mark">studio<span>.</span>flow</div>
        <button className="rail-capture" onClick={openCapture}>
          <IconPlus />
          Put it down
        </button>
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
      <ThemeToggle theme={theme} />
      <QuickCapture hidden={page === 'dump'} />
      <FocusMode />
      <RestGuard />
      <ResumePrompt />
      <Toaster />
    </div>
  )
}
