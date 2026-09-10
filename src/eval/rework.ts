import type { CheckResult, EvalConfig, EvalMaterial, ReworkResult, ReworkRound } from "./types";
import { EMOJI_RE, countEmoji, extractAmounts, getFixableFailures } from "./validator";

export type ValidateFn = (text: string) => import("./types").ValidationResult;
export type RewriteFn = (
  text: string,
  issues: CheckResult[],
  material: EvalMaterial,
  config: EvalConfig
) => Promise<string>;

function stripHash(t: string): string {
  return t.replace(/^#+/, "").trim();
}
function realPriceSet(products: EvalMaterial["products"]): { set: Set<number>; first: number } {
  const s = new Set<number>();
  let first = 99;
  for (const p of products || []) {
    if (typeof p.price === "number" && p.price > 0) {
      s.add(p.price);
      if (first === 99) first = p.price;
    }
  }
  return { set: s, first };
}
function trimToLength(text: string, max: number): string {
  let s = text;
  while (s.replace(/\s/g, "").length > max && s.length > 1) {
    s = s.slice(0, s.length - 1);
  }
  return s.trim();
}

/**
 * 模拟改写器：确定性地把「可修复问题」逐类修掉。
 * 用于离线 / 无密钥 / 沙箱环境，让返工循环真实跑通（验证机制），
 * 真实环境由浏览器侧注入的 rewrite（调 /api/llm）替代。
 */
export function simulateRewriter(
  text: string,
  issues: CheckResult[],
  material: EvalMaterial,
  config: EvalConfig
): string {
  let out = text;
  const keys = new Set(issues.map((i) => i.key));
  const banned = (config.bannedWords || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 违禁词：删掉命中词
  if (keys.has("banned")) {
    for (const w of banned) if (w) out = out.split(w).join("");
    out = out.replace(/\s{2,}/g, " ").trim();
  }

  // 编造价格：把对不上的金额替换为素材真实金额
  if (keys.has("fabricated")) {
    const { set, first } = realPriceSet(material.products);
    const amounts = extractAmounts(out);
    for (const a of amounts) {
      if (!set.has(a.value)) out = out.split(a.raw).join("¥" + first);
    }
  }

  // 残留排版符号
  if (keys.has("residual")) {
    out = out
      .replace(/`/g, "")
      .replace(/\*\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(/(^|\n)-{3,}(\n|$)/g, "\n")
      .replace(/【|】/g, "")
      .replace(/[<>]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // 字数：先估算后续会追加的后缀长度，预留空间，避免裁完再追加又超限（返工震荡）
  if (keys.has("length")) {
    const visLen = out.replace(/\s/g, "").length;
    const INTER_RE = /评论|转发|点赞|留言|抽奖|福利|戳|速来|抢|聊聊|说说|觉得|想不想|要不要|快来|关注|你呢|等你|参与|怎么看|吗[？?]/;
    if (visLen > config.lengthMax) {
      let suffix = "";
      const req = (material.requiredTags || []).map(stripHash).filter(Boolean);
      for (const t of req) if (!out.includes("#" + t)) suffix += " #" + t;
      if (!/[？?]/.test(out) && !INTER_RE.test(out)) suffix += " 你怎么看？评论区聊聊～";
      const budget = Math.max(
        config.lengthMin,
        config.lengthMax - (suffix.replace(/\s/g, "").length || 0)
      );
      out = trimToLength(out, budget);
    } else if (visLen < config.lengthMin) {
      const pad = " 趁着活动赶紧入手，手慢无～";
      while (out.replace(/\s/g, "").length < config.lengthMin) out += pad;
    }
  }

  // 话题标签
  if (keys.has("hashtag")) {
    const required = (material.requiredTags || []).map(stripHash).filter(Boolean);
    for (const t of required) if (!out.includes("#" + t)) out = out + " #" + t;
  }

  // emoji 数量：超上限则删掉多余的，不足则补齐
  if (keys.has("emoji")) {
    let kept = 0;
    out = out.replace(EMOJI_RE, (m) => (kept++ < config.emojiMax ? m : ""));
    while (countEmoji(out) < config.emojiMin) out += "✨";
    out = out.replace(/\s{2,}/g, " ").trim();
  }

  // 互动引导
  if (keys.has("interaction")) {
    if (!/[？?]/.test(out) && !/评论|转发|点赞|留言|抽奖|福利|戳|速来|抢|聊聊|说说|觉得|想不想|要不要|快来|关注|你呢|等你|参与|怎么看|吗[？?]/.test(out)) {
      out = out + " 你怎么看？评论区聊聊～";
    }
  }

  return out.trim();
}

/**
 * 自动返工循环：
 * - 只把「可修复问题」送去改写（字数/违禁词/编造价格/话题标签/互动引导/表情/残留符号）。
 * - 低温度改写（照清单改错）；改完重新校验。
 * - 只接受改好了的版本：本轮分数没涨就保留上一版，防止越改越差。
 * - 全程可追溯：每轮记录修了哪些、还剩哪些。
 */
export async function runReworkLoop(opts: {
  text: string;
  material: EvalMaterial;
  config: EvalConfig;
  validate: ValidateFn;
  rewrite: RewriteFn;
  maxRounds?: number;
}): Promise<ReworkResult> {
  const { text, material, config, validate, rewrite } = opts;
  const maxR = opts.maxRounds ?? config.reworkMaxRounds ?? 3;

  const rounds: ReworkRound[] = [];
  let current = text;
  let currentV = validate(current);
  let bestText = text;
  let bestScore = currentV.score;
  let bestV = currentV;

  for (let r = 1; r <= maxR; r++) {
    const issues = getFixableFailures(currentV);
    if (issues.length === 0) break;

    let newText: string;
    try {
      newText = await rewrite(current, issues, material, config);
    } catch (e) {
      rounds.push({
        round: r,
        beforeScore: currentV.score,
        afterScore: currentV.score,
        fixed: [],
        remaining: issues.map((i) => i.key),
        text: current,
        keptPrevious: true,
      });
      break;
    }
    const newV = validate(newText);
    const fixed = issues
      .filter((i) => {
        const c = newV.checks.find((x) => x.key === i.key);
        return c && c.passed;
      })
      .map((i) => i.key);
    const remaining = issues
      .filter((i) => {
        const c = newV.checks.find((x) => x.key === i.key);
        return !c || !c.passed;
      })
      .map((i) => i.key);

    const adopted = newV.score > currentV.score;
    if (adopted) {
      bestText = newText;
      bestScore = newV.score;
      bestV = newV;
    }
    rounds.push({
      round: r,
      beforeScore: currentV.score,
      afterScore: newV.score,
      fixed,
      remaining,
      text: newText,
      keptPrevious: !adopted,
    });

    current = bestText; // 始终保留当前最优版本
    currentV = bestV;
    if (remaining.length === 0) break;
  }

  const originalV = validate(text);
  const finalV = validate(bestText);
  const origFail = getFixableFailures(originalV).map((c) => c.key);
  const finalFail = getFixableFailures(finalV).map((c) => c.key);
  const issuesFixedAll = origFail.filter((k) => !finalFail.includes(k));
  const issuesRemaining = finalFail;

  return {
    originalText: text,
    finalText: bestText,
    rounds,
    improved: bestScore > originalV.score,
    keptOriginal: rounds.length > 0 && bestText === text,
    finalValidation: finalV,
    issuesFixedAll,
    issuesRemaining,
  };
}
