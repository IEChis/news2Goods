import type { EvalScore, ReviewResult, ValidationResult } from "./types";

function avg(s: { relevance: number; materialFidelity: number; appeal: number; naturalness: number }): number {
  return (s.relevance + s.materialFidelity + s.appeal + s.naturalness) / 4;
}

/**
 * 机器校验分（0..100）与模型评审分（0..100）按权重合成。
 * weightsMachine 为机器校验权重（0..1），模型权重 = 1 - weightsMachine。
 * 未启用评审 / 评审解析失败 → 以机器校验分为准。
 */
export function combineScores(
  validation: ValidationResult,
  review: ReviewResult | null,
  weightsMachine: number
): EvalScore {
  const machine = validation.score;
  const wm = Math.max(0, Math.min(1, weightsMachine));
  if (review && review.ok) {
    const model = Math.round(avg(review.scores) * 20); // 四维均分(1..5) → 0..100
    const total = Math.round(machine * wm + model * (1 - wm));
    return { machine, model, total };
  }
  return { machine, model: null, total: machine };
}

/** 分数区间上色：高分绿、中间橙、低分红 */
export function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a"; // 绿
  if (score >= 60) return "#d97706"; // 橙
  return "#dc2626"; // 红
}
export function scoreLevel(score: number): "high" | "mid" | "low" {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
}
