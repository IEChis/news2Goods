import type { EvalMaterial } from "./types";
import { loadCopyConfig, assembleUserPrompt } from "../api/promptConfig";
import { runCreateCopy } from "../api/coze";
import type { Product } from "../types";

export interface GenerateOpts {
  material: EvalMaterial;
  styleName: string;
  styleRequirement: string;
  tone: string;
  simulate: boolean;
}

/** 真实生成：走 Coze createCopy 工作流（与工作台 Step4 同链路） */
async function realGenerate(o: GenerateOpts): Promise<string> {
  const cfg = await loadCopyConfig();
  const userPrompt = assembleUserPrompt({
    news: o.material.news,
    products: o.material.products,
    tone: o.tone,
    styleName: o.styleName,
    styleRequirement: o.styleRequirement,
    prompt: cfg.prompt,
  });
  const news = {
    id: "eval",
    title: o.material.news.title,
    summary: o.material.news.summary || "",
    keywords: o.material.news.keywords || [],
  } as any;
  const res = await runCreateCopy(news, o.material.products as unknown as Product[], userPrompt);
  return res && res[0] && res[0].trim() ? res[0].trim() : "";
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
