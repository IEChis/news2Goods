import type { EvalConfig } from "./types";
import { DEFAULT_BANNED_WORDS } from "./bannedWords";

/** 默认评审提示词（模型输出严格 JSON，四维各 1..5 + 一句点评） */
export const DEFAULT_REVIEW_PROMPT = `你是一位严格的微博营销文案评审专家。下面给你一条待评审的文案，以及它的素材（热点 + 商品）。

请只输出一个 JSON 对象（不要任何额外文字、不要代码块包裹），结构如下：
{
  "relevance": 1,        // 热点关联度：1=生硬拼接，5=真借上了这个热点
  "materialFidelity": 1, // 素材还原度：1=卖点/价格瞎编，5=用得准、无编造
  "appeal": 1,           // 传播吸引力：1=没钩子没网感，5=让人想点开
  "naturalness": 1,      // 语气自然度：1=一股机器味，5=像真人在发微博
  "comment": "一句话总评"
}

评分要求：稳定、严格，不要人情分。维度之间允许有差距。`;

/** 默认返工提示词（低温度，照清单改错，只输出改好的文案） */
export const DEFAULT_REWORK_PROMPT = `你是一位严谨的文案校对员。下面给你一条「没通过的文案」和「具体没过的原因清单」。

请严格按清单修改，只输出修正后的完整文案（不要解释、不要前缀、不要代码块）：
- 违禁词：必须删掉或换成合规表述，绝不能再出现清单里点名的违禁词。
- 编造价格：素材里没给的价格/折扣/销量一律删除或替换为素材真实金额；只能原样使用素材给出数字。
- 字数：写完自己数一遍，超了就删（宁可少写一个卖点也不能超上限）；不够则在不违规前提下补一句。
- 话题标签：补齐素材指定的标签，且总标签数不要过多。
- 互动引导：结尾补一个互动提问或限时福利钩子。
- 残留符号：去掉反引号、Markdown 标题/分隔线、【】括号等残留排版符号。

其余合规的部分原样保留，不要擅改语气和卖点。`;

/** 内置默认评测配置 */
export const BUILTIN_EVAL: EvalConfig = {
  enabledReview: true,
  weightsMachine: 0.5,
  lengthMin: 100,
  lengthMax: 200,
  emojiMin: 0,
  emojiMax: 4,
  hashtagCountMax: 6,
  bannedWords: DEFAULT_BANNED_WORDS.join("\n"),
  reviewPrompt: DEFAULT_REVIEW_PROMPT,
  reworkPrompt: DEFAULT_REWORK_PROMPT,
  reworkMaxRounds: 3,
  concurrency: 3,
  repeats: 1,
  unitPrice: 0.01,
  model: "",
  reviewTemp: 0.2,
  reworkTemp: 0.2,
  simulate: false,
};

/** 把 EvalConfig 中与校验相关的字段抽出来给 validator 用 */
export function toValidatorCfg(cfg: EvalConfig): {
  lengthMin: number;
  lengthMax: number;
  emojiMin: number;
  emojiMax: number;
  hashtagCountMax: number;
  bannedWords: string[];
} {
  const banned = (cfg.bannedWords || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    lengthMin: cfg.lengthMin,
    lengthMax: cfg.lengthMax,
    emojiMin: cfg.emojiMin,
    emojiMax: cfg.emojiMax,
    hashtagCountMax: cfg.hashtagCountMax,
    bannedWords: banned,
  };
}
