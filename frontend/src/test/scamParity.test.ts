// Parity: the frontend copy of B's rules (lib/scamRules.ts) must give the same verdict and
// evidence as backend/app/services/ai/heuristics.py on B's own labelled messages (evaluate.py).
// Regenerate b_eval_messages.json from Python if B changes the rules or the dataset.
import { describe, expect, it } from 'vitest'
import { heuristicClassify } from '../lib/scamRules'
import data from './b_eval_messages.json'

describe('scamRules.ts matches B heuristics.py', () => {
  for (const m of data as { text: string; py: string; evidence: string[] }[]) {
    it(m.text.slice(0, 50), () => {
      const r = heuristicClassify(m.text)
      expect(r.result).toBe(m.py)
      expect(r.evidence).toEqual(m.evidence)
    })
  }
})
