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

// ---------------- 运行历史（Prompt 快照） ----------------
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
  materialSig?: string;   // 本次评测使用的输入素材指纹（用于 A/B 识别「非同一用例」）
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

/**
 * 本次评测实际使用的「生成 Prompt」快照（决定被测文案如何生成）。
 * 与评审 / 返工 Prompt 分开保存，保证历史记录随当次运行固化、不被后续默认 Prompt 修改污染。
 */
export interface GenerationConfig {
  system: string;
  template: string;
  itemFormat: string;
  model: string;            // 实际用于生成的模型
  temperature: number;       // 实际用于生成的温度
}

/** 本次评测实际使用的「评测配置」快照（评分标准 + 返工 + 权重）。 */
export interface EvaluationConfig {
  evaluatorPrompt: string;   // 评审 Prompt（评分标准）
  reworkPrompt: string;      // 返工 Prompt（失败后的改写）
  weightsMachine: number;    // 机器校验权重 0..1
  enabledReview: boolean;    // 是否启用模型评审
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

  // —— 以下为「Prompt 实验与评测」新增的快照字段（向后兼容旧运行：缺失时由访问器回退到 configSnapshot）——
  promptName: string;              // 本次生成 Prompt 显示名，如「营销文案生成 V3」或「本次修改」
  promptFingerprint: string;       // 生成 Prompt 内容指纹（版本身份，便于 A/B 区分）
  generationConfig: GenerationConfig;
  evaluationConfig: EvaluationConfig;
  tone: string;                    // 本次主打语调
  selectedStyles: string[];         // 本次选中的创作风格
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

// ---------------- 向后兼容访问器（旧运行缺新字段时回退到 configSnapshot） ----------------
/** 生成 Prompt 指纹的分隔符（system/template/itemFormat 拼接用），统一保证「相同 Prompt → 相同指纹」 */
export const PROMPT_FP_SEP = String.fromCharCode(1);

function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 生成 Prompt 内容指纹：6 位 base36，作为版本身份（即便名字相同也能区分内容差异） */
export function fingerprint(str: string): string {
  return (hashString(str) >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

export function genConfigOf(r: EvalRun): GenerationConfig {
  if (r.generationConfig) return r.generationConfig;
  const cp = r.configSnapshot?.copyPrompt;
  return {
    system: cp?.system ?? "",
    template: cp?.template ?? "",
    itemFormat: cp?.itemFormat ?? "",
    model: r.model ?? "",
    temperature: 0.7,
  };
}

export function evalConfigOf(r: EvalRun): EvaluationConfig {
  if (r.evaluationConfig) return r.evaluationConfig;
  const e = r.configSnapshot?.eval;
  return {
    evaluatorPrompt: e?.reviewPrompt ?? "",
    reworkPrompt: e?.reworkPrompt ?? "",
    weightsMachine: r.weightsMachine ?? 0.5,
    enabledReview: r.enabledReview ?? true,
  };
}

export function promptNameOf(r: EvalRun): string {
  return r.promptName || "（早期版本）";
}

export function promptFingerprintOf(r: EvalRun): string {
  if (r.promptFingerprint) return r.promptFingerprint;
  const g = genConfigOf(r);
  return fingerprint(g.system + PROMPT_FP_SEP + g.template + PROMPT_FP_SEP + g.itemFormat);
}
