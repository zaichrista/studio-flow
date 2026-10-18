export interface Settings {
  /** 0 = Sunday … 6 = Saturday */
  workDays: number[]
  dayStart: string
  dayEnd: string
  lunchStart: string
  lunchMinutes: number
  /** Working days a task is given to be finished unless told otherwise */
  defaultTaskDays: number
  blockMinutes: number
  /** Minutes before a block that the reminder fires */
  notifyLeadMinutes: number
  workerUrl: string
  appToken: string
}

export interface Project {
  id: string
  name: string
  client: string
  /** Fixed fee for the whole project, in pounds */
  pay: number
  color: string
  archived: boolean
}

export interface Subtask {
  id: string
  title: string
  done: boolean
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
  /** On the board's Doing column (ignored once done) */
  doing?: boolean
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
}

export interface Txn {
  id: string
  kind: 'income' | 'expense'
  amount: number
  date: string
  category: string
  note: string
}

export interface Dump {
  id: string
  text: string
  at: number
}

export interface AppData {
  version: 1
  settings: Settings
  projects: Project[]
  tasks: Task[]
  blocks: Block[]
  entries: TimeEntry[]
  active: ActiveTimer | null
  txns: Txn[]
  dumps: Dump[]
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
    }[]
  }[]
  /** Tasks that belong to no project */
  loose?: {
    title: string
    subtasks?: string[]
    estimateMinutes?: number
    dueDate?: string
    daysToComplete?: number
  }[]
  expenses?: { amount: number; note: string; category?: string }[]
  notes?: string
}
