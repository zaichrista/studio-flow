import { useCallback, useEffect, useState } from 'react'
import { startTimer } from '../lib/actions'
import { LATE_CHECK_IN, restCheck } from '../lib/rest'
import type { RestCheck } from '../lib/rest'
import { useStore } from '../lib/store'
import { openCapture } from './QuickCapture'
import { Sheet } from './Sheet'
import { toast } from './Toast'

interface Ask {
  check: RestCheck
  start: (trial?: number) => void
}

let ask: (a: Ask) => void = () => {}

/**
 * Start a timer, but outside your hours ask once first. A little friction,
 * never a wall: you can always start anyway.
 */
export function useStart() {
  const { data, update } = useStore()
  return useCallback(
    (taskId: string, blockId?: string | null, trial?: number, then?: () => void) => {
      const go = (t?: number) => {
        update((d) => startTimer(d, taskId, blockId, new Date(), t ?? trial))
        then?.()
      }
      const check = restCheck(data)
      if (!check) return go()
      ask({ check, start: go })
    },
    [data, update],
  )
}

export function RestGuard() {
  const [current, setCurrent] = useState<Ask | null>(null)
  useEffect(() => {
    ask = setCurrent
    return () => {
      ask = () => {}
    }
  }, [])
  if (!current) return null
  const { check, start } = current
  const close = () => setCurrent(null)
  return (
    <Sheet title={check.title} onClose={close}>
      <div className="stack rest-ask">
        <div className="moon-mark" aria-hidden="true" />
        <p className="soft" style={{ margin: 0 }}>{check.body}</p>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          <button className="btn" onClick={() => { close(); toast(check.late ? 'Good call. Sleep well.' : 'Good call. It will keep.') }}>
            {check.late ? 'Go and rest' : 'Rest instead'}
          </button>
          <button className="btn quiet" onClick={() => { close(); openCapture() }}>Put it down for later</button>
          <button
            className="btn ghost small"
            onClick={() => {
              close()
              if (check.late) {
                start(LATE_CHECK_IN)
                toast(`Okay. I'll check in after ${LATE_CHECK_IN} minutes.`)
              } else start()
            }}
          >
            Start anyway
          </button>
        </div>
      </div>
    </Sheet>
  )
}
