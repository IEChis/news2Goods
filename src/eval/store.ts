import type { EvalConfig, EvalScore, ReviewResult, ReworkResult, ValidationResult } from "./types";

// ---------------- 用例 ----------------
export interface TestCase {
  id: string;
  name: string;
  enabled: boolean;
  news: { title: string; summary?: string; keywords?: string[] };
  products: Array<{ name: string; price: number; category?: string; selling?: string[] }>;
  requiredTags?: string[];
  tone?: string;
  styleName?: string;
}

const CASES_KEY = "hg_eval_cases_v1";

export function loadCases(): TestCase[] {
  try {
    const raw = localStorage.getItem(CASES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    /* ignore */
  }
  return [];
}
export function saveCases(cases: TestCase[]): void {
  try {
    localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  } catch {
    /* ignore */
  }
}

// ---------------- 运行历史 ----------------
export interface CaseResult {
  caseId: string;
  caseName: string;
  styleName: string;
  repeat: number;
  copy: string;            // 最终文案（含返工后）
  originalCopy?: string;   // 返工前原文
  validation: ValidationResult;
  review: ReviewResult | null;
  score: EvalScore;
  rework: ReworkResult | null;
  humanVote: "up" | "down" | null;
  humanNote: string;
}

export interface EvalRunSummary {
  total: number;
  machinePassRate: number;   // 0..100
  avgMachine: number;        // 0..100
  avgModel: number | null;   // 0..100 或 null
  bannedHits: number;
  fabricatedCount: number;
  totalCost: number;
  totalMs: number;
  estCostLabel: string;
}

export interface EvalRun {
  id: string;
  label: string;             // 可辨认的短标识（A/B 锚点）
  createdAt: number;
  configSnapshot: {
    eval: EvalConfig;
    copyPrompt: { system: string; template: string; itemFormat: string };
    creativeStyles: { name: string; requirement: string }[];
    tonePresets: string[];
  };
  weightsMachine: number;
  unitPrice: number;
  model: string;
  enabledReview: boolean;
  concurrency: number;
  repeats: number;
  cases: CaseResult[];
  summary: EvalRunSummary;
}

const RUNS_KEY = "hg_eval_runs_v1";

export function loadRuns(): EvalRun[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    /* ignore */
  }
  return [];
}
export function saveRuns(runs: EvalRun[]): void {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, 50)));
  } catch {
    /* ignore */
  }
}
export function saveRun(run: EvalRun): void {
  const runs = loadRuns();
  runs.unshift(run);
  saveRuns(runs);
}
