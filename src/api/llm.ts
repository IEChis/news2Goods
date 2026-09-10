import { callLLM } from "./coze";
import { assembleCopyMessages, loadCopyConfig, type PromptConfig } from "./promptConfig";
import type { Product } from "../types";

/** 接入的大模型连接信息（与 promptConfig.loadMatchConfig().llm 一致） */
export interface CopyLLM {
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * 用「接入的大模型」生成营销文案（替代 Coze createCopy 工作流）。
 *
 * - prompt 可由调用方传入（工作台/评测台各自带其当前生效模板），不传则读 loadCopyConfig。
 * - 走标准 chat 协议：role=system 放人设与写作规范，role=user 放渲染后的素材模板。
 * - 模型按「单版本」指令产出 1 条；若返回内含 \n\n 分隔的多段，按段切分为多个候选版本。
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
  llm: CopyLLM,
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
  console.log(
    "[createCopy/LLM] system/素材拼接完成，调用 /api/llm（model=" +
      llm.model +
      "）…"
  );
  const text = await callLLM(
    llm,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature
  );
  if (!text.trim()) {
    throw new Error("大模型返回为空（请检查「模型接入」baseURL / apiKey / model）");
  }
  // 多版本：按 \n\n 切分；否则整段作为 1 个版本
  const parts = text
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()];
}
