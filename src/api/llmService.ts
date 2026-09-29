/**
 * 统一「大模型」服务层 —— 所有真实模型调用的唯一出口。
 *
 * 职责：
 *   1. 统一「大模型直连 + /api/llm 兜底」的调用逻辑，是项目内所有真实模型调用的唯一出口。
 *   2. 业务代码只调用本文件的 callChat / runMatchByLLM / runCreateCopyByLLM 等，
 *      无需、也不应直接持有 apiKey（apiKey 由 llmConfig 数据访问层统一管控）。
 *   3. 测试连接也走统一出口（testConnection）。
 *
 * 统一出口策略：浏览器优先直连 OpenAI 兼容端点；仅当直连因 CORS / 网络不可达失败时，
 * 才回退到同源 /api/llm 代理（密钥仍由前端传入，不读本机 .env）。
 */
import axios from "axios";
import { getLLMConfig } from "./llmConfig";
import { assembleCopyMessages, loadCopyConfig, type PromptConfig } from "./promptConfig";
import type { NewsItem, Product } from "../types";

export interface ChatMessage {
  role: string;
  content: string;
}

/** 内部：执行一次「直连 + /api/llm 兜底」的模型调用，返回文本内容 */
async function callWithConfig(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  temperature: number
): Promise<string> {
  if (!baseURL || !apiKey || !model) {
    throw new Error("请先在「模型设置」填写 Base URL、API Key、Model");
  }
  const base = String(baseURL)
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");
  const url = base + "/chat/completions";
  const payload = { model, messages, temperature: temperature ?? 0.7 };

  // ① 浏览器直连（网页端，无需本地 .env / dev 代理）
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error("大模型返回错误（HTTP " + resp.status + "）：" + text.slice(0, 200));
    }
    return parseLLMResponse(text);
  } catch (directErr) {
    const isNetwork =
      directErr instanceof TypeError ||
      /Failed to fetch|NetworkError|Network request failed/i.test(String(directErr));
    if (isNetwork) {
      // ② CORS / 网络不可达 → 回退同源 /api/llm 代理（dev 可用，不读 .env）
      const proxied = await tryProxyLLM(baseURL, apiKey, model, messages, temperature);
      if (proxied !== null) return proxied;
      throw new Error(
        "大模型直连失败（CORS / 网络不可达），且同源 /api/llm 代理也不可用。\n" +
          "排查：① baseURL 是否正确；② 该网关是否允许浏览器跨域（Access-Control-Allow-Origin）；" +
          "③ 若以 dev 服务器运行则代理可用，否则需自行提供代理 / 反向转发。"
      );
    }
    throw directErr;
  }
}

/** 经同源 /api/llm 代理转发（兜底 CORS）。成功返回文本，代理不可达 / 非 2xx 返回 null。 */
async function tryProxyLLM(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  temperature: number
): Promise<string | null> {
  try {
    const resp = await axios.post(
      "/api/llm",
      { baseURL, apiKey, model, messages, temperature },
      { timeout: 120000 }
    );
    return parseLLMResponse(typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data));
  } catch {
    return null; // 代理不可达 / 非 2xx
  }
}

/** 解析 OpenAI 兼容响应：choices[0].message.content；宽容兜底字符串 / .text。 */
function parseLLMResponse(text: string): string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("大模型返回非 JSON，无法解析：" + text.slice(0, 120));
  }
  const d = data as { choices?: unknown[]; text?: unknown };
  if (
    Array.isArray(d.choices) &&
    d.choices[0] &&
    (d.choices[0] as { message?: { content?: unknown } }).message
  ) {
    return String((d.choices[0] as { message: { content?: unknown } }).message.content || "");
  }
  if (typeof d === "string") return d;
  if (typeof d.text === "string") return d.text;
  throw new Error("大模型返回格式异常：未找到 choices[0].message.content");
}

/**
 * 统一的对外模型调用出口：业务代码只调这个。模型连接信息从统一配置（llmConfig）读取，
 * 业务层不再直接持有 apiKey。如需临时覆盖 temperature / model，通过 opts 传入。
 */
export async function callChat(
  messages: ChatMessage[],
  opts?: { temperature?: number; model?: string }
): Promise<string> {
  const cfg = getLLMConfig();
  const temperature = typeof opts?.temperature === "number" ? opts.temperature : cfg.temperature;
  const model = opts?.model || cfg.model;
  return callWithConfig(cfg.baseURL, cfg.apiKey, model, messages, temperature);
}

/**
 * 测试连接：经统一出口发一个最小请求。只返回可读结果，不暴露完整 API Key。
 * 用于工作台 / 后台「测试连接」按钮。
 */
export async function testConnection(cfg: {
  baseURL: string;
  apiKey: string;
  model: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!cfg.baseURL || !cfg.apiKey || !cfg.model) {
    return { ok: false, message: "请先填写 Base URL、API Key、Model" };
  }
  try {
    const text = await callWithConfig(
      cfg.baseURL,
      cfg.apiKey,
      cfg.model,
      [{ role: "user", content: "Ping. 请只回复 ok。" }],
      0
    );
    return { ok: true, message: "连接成功：" + text.slice(0, 60).replace(/\s+/g, " ") };
  } catch (e) {
    return { ok: false, message: "连接失败：" + (e instanceof Error ? e.message : String(e)).slice(0, 140) };
  }
}

// ---- 商品匹配（基于新闻 → 关键词 → 在本地商品库检索命中商品）----

/** 用新闻标题/内容填充匹配提示词，调用大模型产出关键词原始文本（配置从统一层读取） */
export async function runMatchByLLM(news: NewsItem, prompt: string): Promise<string> {
  const filled = (prompt || "")
    .replace(/\{\{\s*title\s*\}\}/g, news.title || "")
    .replace(/\{\{\s*brief\s*\}\}/g, news.summary || "");
  return callChat([{ role: "user", content: filled }], { temperature: 0.4 });
}

/** 把大模型输出解析为关键词数组（按中英文标点、换行切分；"没有对应内容"视为空） */
export function parseKeywords(text: string): string[] {
  const t = (text || "").trim();
  if (!t || t === "没有对应内容") return [];
  return t
    .split(/[，,、;；\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 用关键词在商品库里检索命中商品（按命中数降序，返回带匹配分） */
export function searchProductsByKeywords(keywords: string[], products: Product[]): Product[] {
  if (!keywords.length || !products.length) return [];
  const scored = products
    .map((p) => {
      const hay = [p.name, p.category, ...(p.selling || []), ...(p.matchKeywords || [])]
        .join(" ")
        .toLowerCase();
      const hit = keywords.filter((k) => {
        const kw = (k || "").toLowerCase();
        return kw && hay.includes(kw);
      });
      return { product: p, hits: hit.length, score: Math.min(60 + hit.length * 12, 98) };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.score - a.score);
  return scored.map((x) => x.product);
}

/**
 * 用「接入的大模型」生成营销文案（替代 Coze createCopy 工作流）。
 *
 * - prompt 可由调用方传入（工作台/评测台各自带其当前生效模板），不传则读 loadCopyConfig。
 * - 走标准 chat 协议：role=system 放人设与写作规范，role=user 放渲染后的素材模板。
 * - 模型按「单版本」指令产出 1 条；若返回内含 \n\n 分隔的多段，按段切分为多个候选版本。
 * - 模型连接信息从统一配置（llmConfig）读取，调用方不再传入 apiKey。
 */
export async function runCreateCopyByLLM(
  news: { title: string; summary?: string; keywords?: string[] },
  products: Product[],
  opts: {
    tone?: string;
    styleName?: string;
    styleRequirement?: string;
    extraRequirement?: string;
    prompt?: PromptConfig;
  },
  temperature = 0.7
): Promise<string[]> {
  const prompt = opts.prompt ?? (await loadCopyConfig()).prompt;
  const { system, user } = assembleCopyMessages({
    news,
    products,
    tone: opts.tone,
    styleName: opts.styleName,
    styleRequirement: opts.styleRequirement,
    extraRequirement: opts.extraRequirement,
    prompt,
  });
  const text = await callChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature }
  );
  if (!text.trim()) {
    throw new Error("大模型返回为空（请检查「模型设置」Base URL / API Key / Model）");
  }
  // 多版本：按 \n\n 切分；否则整段作为 1 个版本
  const parts = text
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()];
}
