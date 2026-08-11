import type { EvalConfig, EvalMaterial, ReviewResult, ValidationResult } from "./types";

type LLMCall = (messages: { role: string; content: string }[], temperature: number) => Promise<string>;

function clamp5(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** 容错解析：模型经常多写废话或用代码块包住，要能捞回 JSON */
export function parseReview(raw: string): ReviewResult {
  const empty: ReviewResult = {
    ok: false,
    scores: { relevance: 0, materialFidelity: 0, appeal: 0, naturalness: 0 },
    comment: "",
    raw: raw || "",
    failed: true,
    parseError: "空输出",
  };
  if (!raw || !raw.trim()) return empty;

  let jsonStr = raw.trim();
  // 1) 去代码块围栏
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  // 2) 没以 { 开头 → 找第一个 { 到最后一个 }
  if (!jsonStr.startsWith("{")) {
    const s = jsonStr.indexOf("{");
    const e = jsonStr.lastIndexOf("}");
    if (s >= 0 && e > s) jsonStr = jsonStr.slice(s, e + 1);
    else return { ...empty, parseError: "未找到 JSON 对象" };
  }
  let obj: any;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    return { ...empty, parseError: "JSON 解析失败：" + (e as Error).message.slice(0, 60) };
  }
  if (!obj || typeof obj !== "object") return { ...empty, parseError: "不是对象" };

  const get = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
    }
    return undefined;
  };
  const relevance = get("relevance", "热点关联度", "r");
  const materialFidelity = get("materialFidelity", "素材还原度", "material");
  const appeal = get("appeal", "传播吸引力", "appeal");
  const naturalness = get("naturalness", "语气自然度", "natural");
  if (
    relevance === undefined ||
    materialFidelity === undefined ||
    appeal === undefined ||
    naturalness === undefined
  ) {
    return { ...empty, parseError: "四维评分缺失或非法" };
  }
  const comment =
    typeof obj.comment === "string"
      ? obj.comment
      : typeof obj.点评 === "string"
      ? obj.点评
      : "";
  return {
    ok: true,
    scores: {
      relevance: clamp5(relevance),
      materialFidelity: clamp5(materialFidelity),
      appeal: clamp5(appeal),
      naturalness: clamp5(naturalness),
    },
    comment,
    raw,
  };
}

function buildReviewUser(copy: string, material: EvalMaterial, config: EvalConfig): string {
  const news = material.news || {};
  const products = (material.products || [])
    .map(
      (p, i) =>
        `${i + 1}. ${p.name}｜¥${p.price}${p.category ? "｜" + p.category : ""}${
          p.selling && p.selling.length ? "｜卖点：" + p.selling.join("、") : ""
        }`
    )
    .join("\n");
  return (
    (config.reviewPrompt || "") +
    "\n\n【待评审文案】\n" +
    copy +
    "\n\n【素材 · 热点】\n标题：" +
    (news.title || "") +
    (news.summary ? "\n摘要：" + news.summary : "") +
    (news.keywords && news.keywords.length ? "\n关键词：" + news.keywords.join("、") : "") +
    "\n\n【素材 · 商品】\n" +
    (products || "（无）") +
    (material.requiredTags && material.requiredTags.length
      ? "\n\n【素材指定话题标签】\n" + material.requiredTags.map((t) => "#" + t.replace(/^#/, "")).join(" ")
      : "")
  );
}

/** 真实模型评审：调用注入的 llmCall（浏览器侧指向 /api/llm） */
export async function reviewCopyReal(
  copy: string,
  material: EvalMaterial,
  config: EvalConfig,
  llmCall: LLMCall
): Promise<ReviewResult> {
  const messages = [{ role: "user", content: buildReviewUser(copy, material, config) }];
  let raw = "";
  try {
    raw = await llmCall(messages, config.reviewTemp);
  } catch (e) {
    return {
      ok: false,
      scores: { relevance: 0, materialFidelity: 0, appeal: 0, naturalness: 0 },
      comment: "",
      raw: String(e),
      failed: true,
      parseError: "模型调用失败：" + (e as Error).message.slice(0, 60),
    };
  }
  return parseReview(raw);
}

/** 模拟评审：依据机器校验结果给出确定性、可解释的评分（离线 / 无密钥时使用） */
export function simulateReview(validation: ValidationResult): ReviewResult {
  const fail = (k: string) => validation.checks.find((c) => c.key === k && !c.passed);
  const banned = !!fail("banned");
  const fabricated = !!fail("fabricated");
  const product = !!fail("product");
  const interaction = !!fail("interaction");
  const length = !!fail("length");
  const hashtag = !!fail("hashtag");
  const residual = !!fail("residual");

  const relevance = clamp5(5 - (product ? 2 : 0) - (hashtag ? 1 : 0));
  const materialFidelity = clamp5(5 - (banned ? 2 : 0) - (fabricated ? 2 : 0) - (product ? 1 : 0));
  const appeal = clamp5(5 - (interaction ? 1 : 0) - (length ? 1 : 0) - (hashtag ? 1 : 0));
  const naturalness = clamp5(5 - (residual ? 2 : 0) - (banned ? 1 : 0));

  const issues: string[] = [];
  for (const c of validation.checks) if (!c.passed) issues.push(c.label);
  return {
    ok: true,
    scores: { relevance, materialFidelity, appeal, naturalness },
    comment: issues.length ? "模拟评审：待改 " + issues.join("、") : "模拟评审：机器校验全部通过",
    raw: "simulate",
  };
}
