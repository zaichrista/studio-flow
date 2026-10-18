import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { IconBoard, IconDump, IconGear, IconMoney, IconToday, IconWeek, IconWork } from './components/Icons'
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

function initialPage(): PageId {
  try {
    const saved = localStorage.getItem(PAGE_KEY) as PageId | null
    if (saved && NAV.some((n) => n.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return 'today'
}

export default function App() {
  const { data } = useStore()
  const [page, setPage] = useState<PageId>(initialPage)

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
    <div className="app">
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
      </aside>
      <main className="main">{view}</main>
      <nav className="dock" aria-label="Main">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`navbtn ${page === id ? 'on' : ''}`} onClick={() => go(id)}>
            <Icon />
            {label}
          </button>
        ))}
      </nav>
      <TimerDock hidden={page === 'today'} />
      <Toaster />
    </div>
  )
}
