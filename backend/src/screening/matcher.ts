import { Confidence } from '../common/constants';

const SUFFIX =
  /\b(CO|LTD|LLC|INC|GMBH|CORP|LIMITED|COMPANY|PLC|SA|AG|BV|PTE|GROUP|HOLDINGS|TRADING|EXPORT|IMPORT|集团|公司|有限|责任|股份|贸易|出口|进口)\b/gi;

export function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,'"()`/\-]/g, ' ')
    .replace(SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

export function tokenJaccard(a: string, b: string): number {
  const sa = new Set(a.split(' ').filter(Boolean));
  const sb = new Set(b.split(' ').filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter += 1;
  });
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
}

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

export function classifyConfidence(query: string, listed: string): ConfidenceTier | null {
  const a = normalizeName(query);
  const b = normalizeName(listed);
  if (!a || !b) return null;
  if (a === b) return Confidence.HIGH;
  const sim = similarity(a, b);
  const jac = tokenJaccard(a, b);
  if (sim >= 0.92 || (a.includes(b) && b.length >= 8) || (b.includes(a) && a.length >= 8)) {
    return Confidence.MEDIUM;
  }
  if (sim >= 0.78 || jac >= 0.6) return Confidence.LOW;
  return null;
}

export interface MockListEntry {
  listCode: string;
  name: string;
  aliases: string[];
  country?: string | null;
  note?: string | null;
}

export interface MatchHit {
  listCode: string;
  listedName: string;
  matchedName: string;
  confidence: ConfidenceTier;
  score: number;
}

export function matchAgainstLists(name: string, lists: MockListEntry[]): MatchHit[] {
  const hits: MatchHit[] = [];
  for (const entry of lists) {
    const candidates = [entry.name, ...entry.aliases];
    let best: { confidence: ConfidenceTier; listed: string } | null = null;
    for (const cand of candidates) {
      const tier = classifyConfidence(name, cand);
      if (!tier) continue;
      if (
        !best ||
        rank(tier) > rank(best.confidence) ||
        (rank(tier) === rank(best.confidence) && cand.length > best.listed.length)
      ) {
        best = { confidence: tier, listed: entry.name };
      }
    }
    if (best) {
      hits.push({
        listCode: entry.listCode,
        listedName: best.listed,
        matchedName: name,
        confidence: best.confidence,
        score: scoreOf(best.confidence, entry.listCode),
      });
    }
  }
  return hits.sort((x, y) => y.score - x.score);
}

function rank(c: ConfidenceTier): number {
  if (c === 'HIGH') return 3;
  if (c === 'MEDIUM') return 2;
  return 1;
}

export function scoreOf(confidence: ConfidenceTier, listCode: string): number {
  const base = confidence === 'HIGH' ? 92 : confidence === 'MEDIUM' ? 64 : 28;
  const bump = listCode === 'OFAC' || listCode === 'UN' ? 6 : listCode === 'CN_UNRELIABLE' ? 4 : 0;
  return Math.min(100, base + bump);
}

export function riskFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 80) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}
