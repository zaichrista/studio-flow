/** A daily break the scheduler keeps free (lunch, dinner, a walk…). */
export interface Break {
  id: string
  name: string
  start: string
  minutes: number
}

export interface Look {
  /** Side menu, bottom bar, or whichever fits the screen */
  nav: 'auto' | 'bar' | 'rail'
  density: 'compact' | 'cozy' | 'airy'
  palette: 'blush' | 'linen' | 'sage' | 'lilac'
  today: 'focus' | 'split'
  week: 'grid' | 'agenda' | 'day'
  board: 'columns' | 'stacked'
  /** Follow the iPad, or always light / always dark */
  theme: 'auto' | 'light' | 'dark'
  /** Soft matte surfaces, or frosted "liquid glass" over a slow colour wash */
  surface: 'soft' | 'glass'
}

export interface Settings {
  /** What the app calls you; blank means it just says hello */
  name: string
  /** 0 = Sunday … 6 = Saturday */
  workDays: number[]
  dayStart: string
  dayEnd: string
  breaks: Break[]
  /** Working days a task is given to be finished unless told otherwise */
  defaultTaskDays: number
  blockMinutes: number
  /** Breathing room kept free after every work block */
  bufferMinutes: number
  /** Most hours of freelance work (and shifts) planned in a week; 0 = no limit */
  maxWeekHours: number
  /** Heads-up before a block starts; 0 = only the nudge at the start */
  headsUpMinutes: number
  /** While timing, a focus notification that refreshes every this many minutes; 0 = off */
  progressMinutes: number
  /** Nudge this long before a timed block ends, to note where you're up to; 0 = off */
  wrapUpMinutes: number
  /** A nudge at the end of the work day to put work away */
  shutdownNudge: boolean
  /** Play the opening animation on every launch, or only the first of the day */
  splash: 'always' | 'daily'
  /** When your head is clearest: focus work goes there, ideas and admin the other half */
  clearest: 'morning' | 'afternoon' | 'any'
  /** Share of income set aside for tax, in percent */
  taxPercent: number
  workerUrl: string
  appToken: string
  look: Look
}

/** Someone you work for. Projects sit under clients; tasks sit under projects. */
export interface Client {
  id: string
  name: string
  email: string
  notes: string
  color: string
}

export interface Project {
  id: string
  name: string
  /** The client it's for, or null */
  clientId: string | null
  /** Fixed fee for the whole project, in pounds */
  pay: number
  color: string
  archived: boolean
  /** Set once the invoice has gone out */
  invoice?: Invoice
}

export interface Invoice {
  /** YYYY-MM-DD the invoice was sent */
  sentOn: string
  /** Days the client has to pay */
  termsDays: number
  /** YYYY-MM-DD the money landed */
  paidOn?: string
}

/**
 * What sort of thinking a task needs. Focus work suits your clearest hours;
 * ideas come easier when you're a little less sharp; admin is batched.
 */
export type TaskKind = 'focus' | 'ideas' | 'admin'

export interface Subtask {
  id: string
  title: string
  done: boolean
  /** When it was ticked off (epoch ms) */
  doneAt?: number
}

export interface Task {
  id: string
  projectId: string | null
  title: string
  subtasks: Subtask[]
  estimateMinutes: number
  /** First day work may begin (YYYY-MM-DD) */
  startDate: string
  /** Last day the task should be finished (YYYY-MM-DD) */
  dueDate: string
  done: boolean
  /** When it was finished (epoch ms) */
  doneAt?: number
  /** On the board's Doing column (ignored once done) */
  doing?: boolean
  /** The smallest concrete action that gets the task going */
  firstStep?: string
  /** Where you were up to when you last stopped */
  resumeNote?: string
  /** Guessed from the title when missing */
  kind?: TaskKind
  createdAt: number
}

export interface Block {
  id: string
  taskId: string
  /** YYYY-MM-DD, or '' while waiting to be placed */
  date: string
  /** HH:mm */
  start: string
  minutes: number
  loggedSeconds: number
  done: boolean
  /** True when the block was stopped early and its remainder re-queued */
  partial?: boolean
  /** Epoch ms before which it shouldn't be placed ("not now") */
  after?: number
}

export interface TimeEntry {
  id: string
  taskId: string
  blockId: string | null
  start: number
  end: number
}

export interface ActiveTimer {
  taskId: string
  blockId: string | null
  startedAt: number
  /** "Just 10 minutes": a gentle check-in after this many minutes */
  trial?: number
}

export interface Txn {
  id: string
  kind: 'income' | 'expense'
  amount: number
  date: string
  category: string
  note: string
  /** The project this payment was for */
  projectId?: string
  /** The client it was received from or spent for (else the project's client) */
  clientId?: string
}

/** The day's own notes: what you meant to do with it, and one good thing about it. */
export interface DayNote {
  intention?: string
  goodThing?: string
  /** Little acts of care ticked today: water, move, outside, food */
  care?: string[]
  /** When the day was put away (epoch ms) */
  closedAt?: number
}

/** A thought worth keeping that isn't a task (yet). */
export interface Idea {
  id: string
  text: string
  projectId: string | null
  at: number
}

export interface Dump {
  id: string
  text: string
  at: number
}

export type EventKind = 'shift' | 'appointment' | 'personal'

/** Fixed time that is not freelance work, e.g. a shift at a café. */
export interface CalEvent {
  id: string
  title: string
  kind: EventKind
  /** The day it happens, or the first day when it repeats (YYYY-MM-DD) */
  date: string
  start: string
  /** HH:mm, later than start on the same day */
  end: string
  /** Weekdays it repeats on (0 = Sunday); empty means one-off */
  repeatDays: number[]
  /** Last day a repeating event happens; '' means no end */
  until: string
}

export interface AppData {
  version: 1
  settings: Settings
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  blocks: Block[]
  events: CalEvent[]
  entries: TimeEntry[]
  active: ActiveTimer | null
  txns: Txn[]
  dumps: Dump[]
  ideas: Idea[]
  /** Notes per day, keyed YYYY-MM-DD */
  days: Record<string, DayNote>
  /** YYYY-MM-DD of the last day that was put away */
  closedOn?: string
}

/** Shape returned by the AI sorter (worker /sort) */
export interface SortedDump {
  projects: {
    name: string
    client?: string
    pay?: number
    tasks: {
      title: string
      subtasks?: string[]
      estimateMinutes?: number
      dueDate?: string
      daysToComplete?: number
      firstStep?: string
      kind?: TaskKind
    }[]
    ideas?: string[]
  }[]
  /** Tasks that belong to no project */
  loose?: {
    title: string
    subtasks?: string[]
    estimateMinutes?: number
    dueDate?: string
    daysToComplete?: number
    firstStep?: string
    kind?: TaskKind
  }[]
  /** Thoughts that aren't tasks and belong to no project */
  ideas?: string[]
  expenses?: { amount: number; note: string; category?: string }[]
  notes?: string
}
