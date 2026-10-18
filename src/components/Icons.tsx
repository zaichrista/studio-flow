import type { ReactNode } from 'react'

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const make = (d: ReactNode) => () => <svg {...base} aria-hidden="true">{d}</svg>

export const IconToday = make(<><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>)
export const IconDump = make(<><path d="M5 17c0-5 3-9 7-12 4 3 7 7 7 12a7 7 0 0 1-14 0Z" /><path d="M12 11v6" /></>)
export const IconWeek = make(<><rect x="4" y="5" width="16" height="15" rx="4" /><path d="M4 10h16M9 3.5v3M15 3.5v3" /></>)
export const IconWork = make(<><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l2 2.5h5.5A2.5 2.5 0 0 1 20 11v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5Z" /></>)
export const IconBoard = make(<><rect x="4" y="5" width="4.5" height="14" rx="2" /><rect x="10" y="5" width="4.5" height="9" rx="2" /><rect x="16" y="5" width="4" height="11.5" rx="2" /></>)
export const IconMoney = make(<><circle cx="12" cy="12" r="8" /><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 2 0 2.8 5 1.6 5 4.2 0 1.2-1.1 2-2.5 2-1.1 0-2-.4-2.7-1.3M12 6.5V8m0 8v1.5" /></>)
export const IconGear = make(<><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" /></>)
export const IconPlay = make(<path d="M8 6.5v11l9-5.5Z" fill="currentColor" />)
export const IconClose = make(<path d="M6 6l12 12M18 6 6 18" />)
export const IconPlus = make(<path d="M12 5v14M5 12h14" />)

export function Ring() {
  return (
    <svg className="ring" viewBox="0 0 220 220" fill="none" aria-hidden="true">
      <circle cx="110" cy="110" r="90" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeDasharray="520 60" color="var(--sage)" />
    </svg>
  )
}
