import type { AppData } from '../types'
import { emptyData } from './actions'
import { DEFAULT_SETTINGS } from './scheduler'

/** Settings for someone with no day job: one work day, 9–5, Monday to Friday. */
export const NO_JOB = { ...DEFAULT_SETTINGS, hasJob: false }

/** An empty app for someone with no day job. */
export const noJobData = (): AppData => ({ ...emptyData(), settings: NO_JOB })
