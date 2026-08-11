import type { CheckResult, EvalMaterial, ValidationResult } from "./types";

// 机器校验所需的规则片段（从 EvalConfig 取出）
export interface ValidatorCfg {
  lengthMin: number;
  lengthMax: number;
  emojiMin: number;
  emojiMax: number;
  hashtagCountMax: number;
  bannedWords: string[];
}

// 可送入返工循环修复的问题（改了有用的）；"是否提到商品"改了也白改 → 不进循环
export const FIXABLE_KEYS = new Set([
  "length",
  "hashtag",
  "emoji",
  "banned",
  "fabricated",
  "interaction",
  "residual",
]);

// ---------------- 工具 ----------------
function stripHash(t: string): string {
  return t.replace(/^#+/, "").trim();
}
export function extractHashtags(text: string): string[] {
  const m = text.match(/#([^\s#，。！？、,.\n\r]+)/g) || [];
  return m.map((s) => s.slice(1));
}
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2764}\u{2728}\u{2705}\u{1F1E6}-\u{1F1FF}]/gu;

function countEmoji(text: string): number {
  return (text.match(EMOJI_RE) || []).length;
}

// 抽取文案里所有「金额」：带 ¥/￥ 的数字，或数字后跟 元/块/块钱
const AMOUNT_RE = /(¥|￥)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:元|块|块钱)/g;
export function extractAmounts(text: string): Array<{ raw: string; value: number }> {
  const out: Array<{ raw: string; value: number }> = [];
  let m: RegExpExecArray | null;
  AMOUNT_RE.lastIndex = 0;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const v = Number(m[2] ?? m[3]);
    if (Number.isFinite(v)) out.push({ raw: m[0].trim(), value: v });
  }
  return out;
}

function buildAmountSet(products: EvalMaterial["products"]): Set<number> {
  const s = new Set<number>();
  for (const p of products || []) {
    if (typeof p.price === "number" && p.price > 0) s.add(p.price);
    // 不把原价纳入「允许金额」——原价也可能被模型编造，但价格校验以售价为主；
    // 若素材本身给了原价，也允许（避免误伤）。
    const op = (p as { originalPrice?: number }).originalPrice;
    if (typeof op === "number" && op > 0) s.add(op);
  }
  return s;
}

// ---------------- 主校验 ----------------
export function validateCopy(
  copy: string,
  material: EvalMaterial,
  cfg: ValidatorCfg
): ValidationResult {
  const text = (copy || "").trim();
  const checks: CheckResult[] = [];

  // 1) 字数区间
  const visLen = text.replace(/\s/g, "").length;
  const lenPass = visLen >= cfg.lengthMin && visLen <= cfg.lengthMax;
  checks.push({
    key: "length",
    label: "字数区间",
    passed: lenPass,
    weight: 12,
    isHard: false,
    score: lenPass ? 12 : 0,
    failReason: lenPass ? undefined : `当前 ${visLen} 字，要求 ${cfg.lengthMin}–${cfg.lengthMax} 字`,
    detail: `字数 ${visLen}`,
  });

  // 2) 话题标签：素材指定标签需出现 + 总标签数不超上限
  const tags = extractHashtags(text);
  const required = (material.requiredTags || []).map(stripHash).filter(Boolean);
  const missing = required.filter((t) => !tags.includes(t));
  const countOver = tags.length > cfg.hashtagCountMax;
  const tagPass = missing.length === 0 && !countOver;
  checks.push({
    key: "hashtag",
    label: "话题标签",
    passed: tagPass,
    weight: 10,
    isHard: false,
    score: tagPass ? 10 : 0,
    failReason: !tagPass
      ? [
          missing.length ? `缺素材指定标签：${missing.map((t) => "#" + t).join(" ")}` : "",
          countOver ? `标签总数 ${tags.length} 超过上限 ${cfg.hashtagCountMax}` : "",
        ]
          .filter(Boolean)
          .join("；")
      : undefined,
    detail: `标签：${tags.map((t) => "#" + t).join(" ") || "（无）"}`,
  });

  // 3) emoji 数量适中
  const emojiCount = countEmoji(text);
  const emojiPass = emojiCount >= cfg.emojiMin && emojiCount <= cfg.emojiMax;
  checks.push({
    key: "emoji",
    label: "表情符号适中",
    passed: emojiPass,
    weight: 6,
    isHard: false,
    score: emojiPass ? 6 : 0,
    failReason: emojiPass ? undefined : `emoji ${emojiCount} 个，要求 ${cfg.emojiMin}–${cfg.emojiMax} 个`,
    detail: `emoji ${emojiCount} 个`,
  });

  // 4) 违禁词（硬伤）
  const bannedHits: string[] = [];
  for (const w of cfg.bannedWords || []) {
    if (w && text.includes(w) && !bannedHits.includes(w)) bannedHits.push(w);
  }
  const bannedPass = bannedHits.length === 0;
  checks.push({
    key: "banned",
    label: "广告法违禁词",
    passed: bannedPass,
    weight: 30,
    isHard: true,
    score: bannedPass ? 30 : 0,
    failReason: bannedPass ? undefined : `命中违禁词：${bannedHits.join("、")}`,
    detail: bannedHits.length ? `命中：${bannedHits.join("、")}` : "未命中",
  });

  // 5) 编造价格（硬伤）：文案所有金额必须能在素材里找到
  const amounts = extractAmounts(text);
  const realSet = buildAmountSet(material.products);
  const realAmounts = Array.from(realSet).map((n) => String(n));
  const fabricated = amounts.filter((a) => !realSet.has(a.value));
  const fabricatedAmounts = fabricated.map((a) => a.raw);
  const fabPass = fabricated.length === 0;
  checks.push({
    key: "fabricated",
    label: "价格真实（未编造）",
    passed: fabPass,
    weight: 30,
    isHard: true,
    score: fabPass ? 30 : 0,
    failReason: fabPass
      ? undefined
      : `文案金额与素材对不上：${fabricatedAmounts.join("、")}（素材真实金额：${realAmounts.join("、") || "无"}）`,
    detail: `文案金额：${amounts.map((a) => a.raw).join("、") || "（无）"}；素材真实金额：${
      realAmounts.join("、") || "无"
    }`,
  });

  // 6) 互动引导
  const hasQuestion = /[？?]/.test(text);
  const hasCTA = /评论|转发|点赞|留言|抽奖|福利|戳|速来|抢|聊聊|说说|觉得|想不想|要不要|快来|关注|你呢|等你|参与|怎么看|吗[？?]/.test(
    text
  );
  const interactionPass = hasQuestion || hasCTA;
  checks.push({
    key: "interaction",
    label: "结尾互动引导",
    passed: interactionPass,
    weight: 8,
    isHard: false,
    score: interactionPass ? 8 : 0,
    failReason: interactionPass ? undefined : "缺少互动提问或福利钩子（如：你怎么看？、评论区聊聊～）",
  });

  // 7) 残留排版符号
  const residualFlags: string[] = [];
  if (/`/.test(text)) residualFlags.push("反引号");
  if (/\*\*/.test(text)) residualFlags.push("**加粗");
  if (/(^|\n)#{1,6}\s/.test(text)) residualFlags.push("Markdown 标题");
  if (/(^|\n)-{3,}(\n|$)/.test(text)) residualFlags.push("分隔线");
  if (/[<>]/.test(text)) residualFlags.push("尖括号");
  if (/^>\s/m.test(text)) residualFlags.push("引用块");
  if (/【|】/.test(text)) residualFlags.push("【】括号");
  const residualPass = residualFlags.length === 0;
  checks.push({
    key: "residual",
    label: "无残留排版符号",
    passed: residualPass,
    weight: 6,
    isHard: false,
    score: residualPass ? 6 : 0,
    failReason: residualPass ? undefined : `残留排版符号：${residualFlags.join("、")}`,
    detail: residualFlags.length ? residualFlags.join("、") : "无",
  });

  // 8) 是否真的提到商品（改了也白改 → 不进返工循环）
  const mentioned = (material.products || []).some((p) => {
    if (!p || !p.name) return false;
    if (text.includes(p.name)) return true;
    return p.name.length >= 4 && text.includes(p.name.slice(0, 4));
  });
  checks.push({
    key: "product",
    label: "提到商品",
    passed: mentioned,
    weight: 8,
    isHard: false,
    score: mentioned ? 8 : 0,
    failReason: mentioned ? undefined : "文案未提及素材中的任何商品",
  });

  // 加权总分
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const passedWeight = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;

  const hardFailures = checks.filter((c) => !c.passed && c.isHard);
  const flaws = checks.filter((c) => !c.passed && !c.isHard);

  return {
    length: visLen,
    passed: checks.every((c) => c.passed),
    score,
    checks,
    hardFailures,
    flaws,
    bannedHits,
    fabricatedAmounts,
    realAmounts,
  };
}

/** 取当前校验里「可修复」的失败项（用于返工） */
export function getFixableFailures(v: ValidationResult): CheckResult[] {
  return v.checks.filter((c) => !c.passed && FIXABLE_KEYS.has(c.key));
}
