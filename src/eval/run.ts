import type { EvalConfig, EvalMaterial, ReviewResult, ReworkResult } from "./types";
import { toValidatorCfg } from "./prompts";
import { validateCopy } from "./validator";
import { combineScores } from "./scoring";
import { reviewCopyReal, simulateReview } from "./reviewer";
import { runReworkLoop, simulateRewriter } from "./rework";
import { generateCopy } from "./generate";
import { loadMatchConfig, loadCopyConfig } from "../api/promptConfig";
import { callLLM } from "../api/coze";
import type { CheckResult } from "./types";
import type { CaseResult, EvalRun, EvalRunSummary, TestCase } from "./store";

type LLMCall = (messages: { role: string; content: string }[], temperature: number) => Promise<string>;

export interface RunOptions {
  cases: TestCase[];
  styles: { name: string; requirement: string }[];
  tone: string;
  evalCfg: EvalConfig;
  onProgress?: (p: { done: number; total: number; current?: string }) => void;
  onCase?: (r: CaseResult) => void;
  shouldStop?: () => boolean;
  llmCall?: LLMCall; // 真实模型调用（浏览器注入）；不传 → 按 simulate 处理
  label?: string;
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function avg4(s: { relevance: number; materialFidelity: number; appeal: number; naturalness: number }): number {
  return (s.relevance + s.materialFidelity + s.appeal + s.naturalness) / 4;
}

/**
 * 跑一轮评测：生成 → 机器校验 →（可选）模型评审 →（没过时）自动返工 → 重新评。
 * 任务按「用例 × 风格 × 重复」展开，受并发数与「中途叫停」控制。
 */
export async function runEval(opts: RunOptions): Promise<EvalRun> {
  const { cases, styles, tone, evalCfg } = opts;
  const validatorCfg = toValidatorCfg(evalCfg);
  const enabledCases = cases.filter((c) => c.enabled);

  const tasks: Array<{ case: TestCase; style: { name: string; requirement: string }; repeat: number }> = [];
  for (const c of enabledCases)
    for (const s of styles)
      for (let r = 0; r < Math.max(1, evalCfg.repeats); r++)
        tasks.push({ case: c, style: s, repeat: r + 1 });
  const total = tasks.length;

  // 真实模型调用（取 matchConfig 的 baseURL/apiKey，模型名以 evalCfg.model 覆盖）
  let llmCall: LLMCall | null = opts.llmCall || null;
  if (!llmCall && !evalCfg.simulate) {
    try {
      const mc = await loadMatchConfig();
      const model = evalCfg.model || mc.llm.model;
      llmCall = (messages, temperature) =>
        callLLM({ baseURL: mc.llm.baseURL, apiKey: mc.llm.apiKey, model }, messages, temperature);
    } catch {
      llmCall = null;
    }
  }

  const useSim = evalCfg.simulate || !llmCall;

  const cc = await loadCopyConfig();
  const results: CaseResult[] = [];
  let done = 0;
  let costCalls = 0;
  const startAll = Date.now();
  const queue = tasks.slice();

  function realRewriter(
    text: string,
    issues: CheckResult[],
    material: EvalMaterial
  ): Promise<string> {
    const issueLines = issues
      .map((i) => `- ${i.label}${i.failReason ? "：" + i.failReason : ""}`)
      .join("\n");
    const userPrompt =
      (evalCfg.reworkPrompt || "") +
      "\n\n【没通过的文案】\n" +
      text +
      "\n\n【具体没过的原因】\n" +
      issueLines +
      "\n\n【素材真实金额】\n" +
      (material.products.map((p) => p.name + " ¥" + p.price).join("\n") || "（无）");
    return llmCall!([{ role: "user", content: userPrompt }], evalCfg.reworkTemp);
  }

  async function runOne(task: (typeof tasks)[number]): Promise<CaseResult> {
    const material: EvalMaterial = {
      news: task.case.news,
      products: task.case.products,
      requiredTags: task.case.requiredTags,
    };
    const styleTone = task.case.tone || tone;
    let copy = await generateCopy({
      material,
      styleName: task.style.name,
      styleRequirement: task.style.requirement,
      tone: styleTone,
      simulate: useSim,
      llmCall: llmCall ?? undefined,
    });
    if (!useSim) costCalls += 1;

    let validation = validateCopy(copy, material, validatorCfg);
    let review: ReviewResult | null = null;
    if (evalCfg.enabledReview) {
      review = useSim ? simulateReview(validation) : await reviewCopyReal(copy, material, evalCfg, llmCall!);
      if (!useSim) costCalls += 1;
    }
    let score = combineScores(validation, review, evalCfg.weightsMachine);
    const originalCopy = copy;
    let rework: ReworkResult | null = null;

    // 自动返工：校验没过才跑
    if (!validation.passed && !(opts.shouldStop && opts.shouldStop())) {
      const rewrite = useSim
        ? async (t: string, i: CheckResult[], m: EvalMaterial, c: EvalConfig) =>
            simulateRewriter(t, i, m, c)
        : realRewriter;
      rework = await runReworkLoop({
        text: copy,
        material,
        config: evalCfg,
        validate: (t) => validateCopy(t, material, validatorCfg),
        rewrite,
        maxRounds: evalCfg.reworkMaxRounds,
      });
      copy = rework.finalText;
      validation = rework.finalValidation;
      if (evalCfg.enabledReview) {
        review = useSim ? simulateReview(validation) : await reviewCopyReal(copy, material, evalCfg, llmCall!);
        if (!useSim) costCalls += 1 + rework.rounds.length;
      }
      score = combineScores(validation, review, evalCfg.weightsMachine);
    }

    return {
      caseId: task.case.id,
      caseName: task.case.name,
      styleName: task.style.name,
      repeat: task.repeat,
      copy,
      originalCopy,
      validation,
      review,
      score,
      rework,
      humanVote: null,
      humanNote: "",
    };
  }

  async function worker() {
    while (queue.length) {
      if (opts.shouldStop && opts.shouldStop()) break;
      const task = queue.shift()!;
      try {
        const r = await runOne(task);
        results.push(r);
        opts.onCase?.(r);
      } catch (e) {
        // 单条失败不应中断整轮，但失败条目也必须进明细（否则前端 live 永远为空、看不出问题）
        const failed: CaseResult = {
          caseId: task.case.id,
          caseName: task.case.name,
          styleName: task.style.name,
          repeat: task.repeat,
          copy: "",
          originalCopy: "",
          validation: validateCopy("", { news: task.case.news, products: task.case.products }, validatorCfg),
          review: null,
          score: { machine: 0, model: null, total: 0 },
          rework: null,
          humanVote: null,
          humanNote: "生成失败：" + (e as Error).message.slice(0, 60),
        };
        results.push(failed);
        opts.onCase?.(failed);
      }
      done += 1;
      opts.onProgress?.({ done, total, current: task.case.name + " / " + task.style.name });
      if (opts.shouldStop && opts.shouldStop()) break;
    }
  }

  const n = Math.max(1, Math.min(evalCfg.concurrency || 3, total));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  const totalMs = Date.now() - startAll;

  // 汇总
  const passed = results.filter((r) => r.validation.passed).length;
  const avgMachine = Math.round(mean(results.map((r) => r.validation.score)));
  const modelScores = results
    .filter((r) => r.review && r.review.ok)
    .map((r) => avg4(r.review!.scores) * 20);
  const avgModel = modelScores.length ? Math.round(mean(modelScores)) : null;
  const bannedHits = results.reduce((s, r) => s + r.validation.bannedHits.length, 0);
  const fabricatedCount = results.reduce((s, r) => s + r.validation.fabricatedAmounts.length, 0);
  const totalCost = Math.round(costCalls * evalCfg.unitPrice * 100) / 100;

  const summary: EvalRunSummary = {
    total: results.length,
    machinePassRate: results.length ? Math.round((passed / results.length) * 100) : 0,
    avgMachine,
    avgModel,
    bannedHits,
    fabricatedCount,
    totalCost,
    totalMs,
    estCostLabel: `约 ¥${totalCost.toFixed(2)}（参考价，以服务商官网为准）`,
  };

  const runs = (() => {
    try {
      return JSON.parse(localStorage.getItem("hg_eval_runs_v1") || "[]");
    } catch {
      return [];
    }
  })();
  const idx = runs.length + 1;
  const short = "E" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const label = opts.label || `运行#${idx}·${short}`;

  const run: EvalRun = {
    id: "run-" + Date.now().toString(36) + "-" + short,
    label,
    createdAt: Date.now(),
    configSnapshot: {
      eval: { ...evalCfg },
      copyPrompt: {
        system: cc.prompt.system,
        template: cc.prompt.template,
        itemFormat: cc.prompt.itemFormat,
      },
      creativeStyles: cc.creativeStyles,
      tonePresets: cc.tonePresets,
    },
    weightsMachine: evalCfg.weightsMachine,
    unitPrice: evalCfg.unitPrice,
    model: evalCfg.model || (llmCall ? evalCfg.model : ""),
    enabledReview: evalCfg.enabledReview,
    concurrency: evalCfg.concurrency,
    repeats: evalCfg.repeats,
    cases: results,
    summary,
  };
  return run;
}

/** A/B 对比：返回两次运行的各项指标涨跌 + 逐用例分数对比 */
export interface ABDiff {
  metrics: Array<{ key: string; label: string; a: number | null; b: number | null; delta: number | null; better: boolean | null }>;
  cases: Array<{
    caseName: string;
    styleName: string;
    aTotal: number;
    bTotal: number;
    delta: number;
    worse: boolean;
    aCopy: string;
    bCopy: string;
  }>;
}
export function diffRuns(a: EvalRun, b: EvalRun): ABDiff {
  const num = (v: number | null) => (typeof v === "number" ? v : null);
  const metrics: ABDiff["metrics"] = [
    {
      key: "pass",
      label: "机器校验通过率",
      a: a.summary.machinePassRate,
      b: b.summary.machinePassRate,
      delta: b.summary.machinePassRate - a.summary.machinePassRate,
      better: b.summary.machinePassRate >= a.summary.machinePassRate,
    },
    {
      key: "machine",
      label: "机器校验均分",
      a: a.summary.avgMachine,
      b: b.summary.avgMachine,
      delta: b.summary.avgMachine - a.summary.avgMachine,
      better: b.summary.avgMachine >= a.summary.avgMachine,
    },
    {
      key: "model",
      label: "模型评审均分",
      a: num(a.summary.avgModel),
      b: num(b.summary.avgModel),
      delta:
        a.summary.avgModel != null && b.summary.avgModel != null
          ? b.summary.avgModel - a.summary.avgModel
          : null,
      better: a.summary.avgModel != null && b.summary.avgModel != null ? b.summary.avgModel >= a.summary.avgModel : null,
    },
    {
      key: "banned",
      label: "违禁词命中数",
      a: a.summary.bannedHits,
      b: b.summary.bannedHits,
      delta: b.summary.bannedHits - a.summary.bannedHits,
      better: b.summary.bannedHits <= a.summary.bannedHits,
    },
    {
      key: "fab",
      label: "编造价格数",
      a: a.summary.fabricatedCount,
      b: b.summary.fabricatedCount,
      delta: b.summary.fabricatedCount - a.summary.fabricatedCount,
      better: b.summary.fabricatedCount <= a.summary.fabricatedCount,
    },
  ];

  // 逐用例对比（按 caseId+styleName 配对）
  const keyOf = (r: CaseResult) => r.caseId + "::" + r.styleName;
  const bMap = new Map(b.cases.map((r) => [keyOf(r), r]));
  const cases: ABDiff["cases"] = [];
  for (const r of a.cases) {
    const k = keyOf(r);
    const rb = bMap.get(k);
    if (!rb) continue;
    const delta = rb.score.total - r.score.total;
    cases.push({
      caseName: r.caseName,
      styleName: r.styleName,
      aTotal: r.score.total,
      bTotal: rb.score.total,
      delta,
      worse: delta < 0,
      aCopy: r.copy,
      bCopy: rb.copy,
    });
  }
  return { metrics, cases };
}
