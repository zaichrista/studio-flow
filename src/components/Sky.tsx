import { useEffect, useState } from 'react'
import { skyAt } from '../lib/sky'

/** `?sky=21:30` previews any hour (handy for looking at the sunset at lunchtime). */
function preview(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('sky')
    const m = v?.match(/^(\d{1,2}):(\d{2})$/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  } catch {
    return null
  }
}

/** Minutes since midnight, refreshed every minute. */
export function useDayMinutes(): number {
  const read = () => preview() ?? new Date().getHours() * 60 + new Date().getMinutes()
  const [m, setM] = useState(read)
  useEffect(() => {
    const id = window.setInterval(() => setM(read()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return m
}

/**
 * The wallpaper: a sky that melts from dawn through midday and golden hour
 * to a starry night, with the sun, then the moon, crossing it.
 */
export function Sky({ minutes, mix, sun }: { minutes: number; mix: number; sun: boolean }) {
  const sky = skyAt(minutes)
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--sky-top', sky.top)
    r.setProperty('--sky-bottom', sky.bottom)
    r.setProperty('--sky-mix', `${mix}%`)
    r.setProperty('--sun-a', sky.a)
    r.setProperty('--sun-b', sky.b)
    document.documentElement.dataset.sky = 'on'
    if (sun) document.documentElement.dataset.sun = 'on'
    else document.documentElement.removeAttribute('data-sun')
    return () => {
      document.documentElement.removeAttribute('data-sky')
      document.documentElement.removeAttribute('data-sun')
    }
  }, [sky.top, sky.bottom, sky.a, sky.b, mix, sun])
  return (
    <div className={`sky ${sky.orb} phase-${sky.phase}`} aria-hidden="true" style={{ ['--ox' as string]: sky.x, ['--oy' as string]: sky.y, ['--stars' as string]: sky.stars }}>
      <div className="stars" />
      <div className="orb" />
      <div className="hills" />
    </div>
  )
}
