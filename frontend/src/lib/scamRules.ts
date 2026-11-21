// Mirror of B's backend/app/services/ai/heuristics.py, used ONLY by the mock backend
// (so the demo works with no server) and to highlight matched words in the message.
// The real verdict always comes from the backend. Keep weights in sync with heuristics.py.

export interface Signal { label: string; weight: number; patterns: RegExp[] }

export const SIGNALS: Signal[] = [
  { label: 'requests sensitive credential (PIN/OTP/password/CNIC)', weight: 3,
    patterns: [/\bpin\b/i, /\botp\b/i, /password/i, /\bcvv\b/i, /شناختی/, /پن(?![؀-ۿ])/, /(send|share|reply|give).{0,25}\bcnic\b/i] },
  { label: 'asks for a fee or money transfer', weight: 3,
    patterns: [/processing fee/i, /(send|pay|transfer|deposit).{0,30}(rs\.?|pkr|fee|charges|amount)/i, /(jazzcash|easypaisa).{0,25}(send|transfer|pay)/i] },
  { label: 'uses a shortened link', weight: 2, patterns: [/bit\.ly/i, /tinyurl/i, /cutt\.ly/i, /rb\.gy/i, /\bt\.co\//i] },
  { label: 'contains a link', weight: 1, patterns: [/https?:\/\//i, /www\./i] },
  { label: 'creates urgency or threat', weight: 1,
    patterns: [/\burgent/i, /immediately/i, /within \d+ (hours|minutes|hrs)/i, /\bfori\b/i, /foran/i, /jaldi/i, /فوری/, /expire/i, /blocked/i, /suspended/i] },
  { label: 'promises relief money or a prize', weight: 1,
    patterns: [/relief (payment|fund|amount|package)/i, /you (have )?won/i, /lucky draw/i, /inaam/i, /انعام/, /claim (your|now)/i] },
]

export interface Span { start: number; end: number; label: string }

export function heuristicClassify(text: string) {
  const t = text || ''
  let score = 0
  const evidence: string[] = []
  const spans: Span[] = []
  for (const s of SIGNALS) {
    let hit = false
    for (const p of s.patterns) {
      const g = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g')
      for (const m of t.matchAll(g)) {
        hit = true
        spans.push({ start: m.index!, end: m.index! + m[0].length, label: s.label })
      }
    }
    if (hit) { score += s.weight; evidence.push(s.label) }
  }
  const words = t.match(/[\p{L}\p{N}_]+/gu) ?? []
  if (score >= 3) {
    return { result: 'suspicious' as const, confidence: Math.min(0.95, Math.round((0.5 + 0.08 * score) * 100) / 100), evidence, spans,
      explanation: 'This message has warning signs: ' + evidence.join('; ') + '.' }
  }
  if (score >= 1) {
    return { result: 'unknown' as const, confidence: 0.4, evidence, spans,
      explanation: 'Some warning signs but not enough to be sure: ' + evidence.join('; ') + '. A person should check.' }
  }
  if (words.length < 3) return { result: 'unknown' as const, confidence: 0.3, evidence: [], spans: [], explanation: 'The message is too short to judge.' }
  return { result: 'likely_legitimate' as const, confidence: 0.6, evidence: [], spans: [],
    explanation: 'No common scam signals were found. This does not prove it is genuine.' }
}

/** Find spans in any text for the given evidence labels (used to highlight a server result). */
export function spansFor(text: string, evidence: string[]): Span[] {
  const out: Span[] = []
  for (const s of SIGNALS) {
    if (!evidence.includes(s.label)) continue
    for (const p of s.patterns) {
      for (const m of text.matchAll(new RegExp(p.source, p.flags + 'g')))
        out.push({ start: m.index!, end: m.index! + m[0].length, label: s.label })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}
