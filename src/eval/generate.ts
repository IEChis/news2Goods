import type { EvalMaterial } from "./types";
import { loadCopyConfig, assembleCopyMessages } from "../api/promptConfig";
import type { Product } from "../types";

type LLMCall = (messages: { role: string; content: string }[], temperature: number) => Promise<string>;

export interface GenerateOpts {
  material: EvalMaterial;
  styleName: string;
  styleRequirement: string;
  tone: string;
  simulate: boolean;
  /** 真实模型调用（由 runEval 注入，指向 /api/llm）；不传且非 simulate 时抛错 */
  llmCall?: LLMCall;
}

/** 真实生成：走「接入的大模型」（/api/llm，OpenAI 兼容），取代原 Coze createCopy 工作流 */
async function realGenerate(o: GenerateOpts): Promise<string> {
  const cfg = await loadCopyConfig();
  const { system, user } = assembleCopyMessages({
    news: o.material.news,
    products: o.material.products as unknown as Product[],
    tone: o.tone,
    styleName: o.styleName,
    styleRequirement: o.styleRequirement,
    prompt: cfg.prompt,
  });
  if (!o.llmCall) {
    throw new Error("未注入大模型调用（请检查「模型接入」baseURL / apiKey / model 是否配置）");
  }
  const text = await o.llmCall(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    0.7
  );
  if (!text.trim()) throw new Error("大模型返回为空");
  // 多版本：按 \n\n 切分，取首段作为该用例文案
  const parts = text
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[0] : text.trim();
}

/** 模拟生成：确定性产出一条基本合规的文案（离线 / 无密钥时用） */
function simulateGenerate(material: EvalMaterial, styleName: string): string {
  const p = material.products[0];
  const tag = material.requiredTags && material.requiredTags[0]
    ? "#" + material.requiredTags[0].replace(/^#/, "")
    : "#热点好物";
  const name = p ? p.name : "这款好物";
  const price = p ? "¥" + p.price : "¥99";
  const selling = p && p.selling && p.selling[0] ? p.selling[0] : "品质优选";
  const newsT = (material.news.title || "").slice(0, 16);
  const lead = styleName.includes("促销")
    ? "趁这波热度把价格打下来"
    : "接住这波热度，跟大伙儿唠两句";
  return `${newsT}刷屏了，${lead}。给大家安利「${name}」，${selling}，现在${price}就能拿下，性价比拉满。${tag} 你们最近种草了啥？评论区聊聊～`;
}

export async function generateCopy(o: GenerateOpts): Promise<string> {
  if (o.simulate) return simulateGenerate(o.material, o.styleName);
  return realGenerate(o);
}
