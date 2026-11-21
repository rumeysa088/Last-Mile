// Name matching for messy real-world data (Challenge 03: Bad Data).
// We only ever SUGGEST that two records may be the same person.
// We never merge automatically: a wrong merge can hand one family's relief to another.

const VARIANTS: Record<string, string> = {
  mohammad: 'muhammad', mohammed: 'muhammad', muhammed: 'muhammad', mohamed: 'muhammad',
  mohd: 'muhammad', muhamad: 'muhammad', mhd: 'muhammad', md: 'muhammad',
  ahmed: 'ahmad', ahmd: 'ahmad',
  bibi: 'bibi', bb: 'bibi', bi: 'bibi',
  fatimah: 'fatima', fatma: 'fatima',
  aisha: 'ayesha', aysha: 'ayesha', ayisha: 'ayesha', aesha: 'ayesha',
  zainab: 'zainab', zenab: 'zainab', zaynab: 'zainab',
  hussain: 'husain', hussein: 'husain', husein: 'husain',
  rukhsana: 'rukhsana', rukshana: 'rukhsana',
  khatoon: 'khatun', khatun: 'khatun',
  shah: 'shah', sha: 'shah',
}

/** Lowercase, strip punctuation, map common spelling variants to one canonical token. */
export function normalizeName(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => VARIANTS[t] ?? t.replace(/(.)\1+/g, '$1')) // collapse doubled letters: "Hassan" ~ "Hasan"
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** 0..1 similarity of two names after normalization. */
export function nameSimilarity(a: string, b: string): number {
  const ta = normalizeName(a), tb = normalizeName(b)
  if (!ta.length || !tb.length) return 0
  const used = new Set<number>()
  let score = 0
  for (const x of ta) {
    let best = 0, bestJ = -1
    tb.forEach((y, j) => {
      if (used.has(j)) return
      const s = 1 - levenshtein(x, y) / Math.max(x.length, y.length)
      if (s > best) { best = s; bestJ = j }
    })
    if (bestJ >= 0) used.add(bestJ)
    score += best
  }
  return score / Math.max(ta.length, tb.length)
}

export const POSSIBLE_MATCH = 0.82

/** Search helper: does the query match the name, tolerating spelling variants? */
export function nameMatchesQuery(name: string, query: string): boolean {
  const q = normalizeName(query)
  if (!q.length) return true
  const n = normalizeName(name)
  return q.every(qt => n.some(nt => nt.startsWith(qt) || (qt.length > 3 && 1 - levenshtein(qt, nt) / Math.max(qt.length, nt.length) >= 0.75)))
}
