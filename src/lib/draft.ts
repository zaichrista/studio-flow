/** The unsent brain dump, kept between visits. */
const DRAFT_KEY = 'studio-flow:draft'

export function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeDraft(text: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, text)
  } catch {
    /* ignore */
  }
}

/** Add a thought to the end of the dump, to sort another time. */
export function appendToDraft(text: string): void {
  const add = text.trim()
  if (!add) return
  const now = readDraft().trimEnd()
  writeDraft(now ? `${now}\n\n${add}` : add)
}
