/** "Pitch deck 2h" → title "Pitch deck", 120 minutes. A time on the end is optional. */
export function splitEstimate(text: string): { title: string; minutes?: number } {
  const m = text.trim().match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)$/i)
  if (!m || !m[1].trim()) return { title: text.trim() }
  const n = Number(m[2])
  const minutes = /^h/i.test(m[3]) ? n * 60 : n
  return minutes > 0 ? { title: m[1].trim(), minutes: Math.max(15, Math.round(minutes / 15) * 15) } : { title: text.trim() }
}
