import { useCallback } from 'react'
import { stopTimer } from '../lib/actions'
import { fmtClock } from '../lib/dates'
import { activeSeconds } from '../lib/stats'
import { useNow, useStore } from '../lib/store'
import { toast } from './Toast'

/** Stop the running timer and say what happened to the block. */
export function useStopTimer() {
  const { data, update } = useStore()
  return useCallback(() => {
    const a = data.active
    if (!a) return
    const block = data.blocks.find((b) => b.id === a.blockId)
    const total = (block?.loggedSeconds ?? 0) + activeSeconds(data)
    update((d) => stopTimer(d))
    if (!block) return toast('Time saved.')
    const logged = Math.floor(total / 60)
    if (logged < block.minutes) toast(`Logged ${logged} of ${block.minutes} min. The rest is back on your calendar.`)
    else toast(data.settings.name ? `Block complete. Well done, ${data.settings.name}.` : 'Block complete. Well done.')
  }, [data, update])
}

export function TimerDock({ hidden }: { hidden: boolean }) {
  const { data } = useStore()
  const now = useNow(!!data.active)
  const stop = useStopTimer()
  if (!data.active || hidden) return null
  const task = data.tasks.find((t) => t.id === data.active!.taskId)
  return (
    <div className="minibar">
      <div className="mini">
        <div className="grow" style={{ overflow: 'hidden' }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task?.title ?? 'Working'}</div>
        </div>
        <span className="t">{fmtClock(activeSeconds(data, now))}</span>
        <button className="stop" onClick={stop}>Stop</button>
      </div>
    </div>
  )
}
