import axios from "axios";
import type { NewsItem, Product } from "../types";
import { generateMockCopies, mockNews, mockProducts } from "../data/mock";

// ---- 三个独立 Coze 工作流 ----
// 仅从本机 .env 的 VITE_COZE_WF_* 注入（.env 已被 gitignore，不进仓库）；
// 仓库源码默认是占位符 "<COZE_WORKFLOW_ID>"，未配置时调用会明确报错。
const WORKFLOW_GETNEWS    = import.meta.env.VITE_COZE_WF_GETNEWS || "<COZE_WORKFLOW_ID>";
const WORKFLOW_MATCHGOODS = import.meta.env.VITE_COZE_WF_MATCHGOODS || "<COZE_WORKFLOW_ID>";
const WORKFLOW_CREATECOPY = import.meta.env.VITE_COZE_WF_CREATECOPY || "<COZE_WORKFLOW_ID>";

// ---- 通用解析工具 ----
function parseInner(data: unknown): Record<string, unknown> {
  if (!data) return {};
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return {};
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Coze 实时抓取";
  }
}

// ---- getNews 输出（news_list: [{title, brife, url}]）→ NewsItem[] ----
function parseNewsList(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((o, i) => {
      const title = String(o.title ?? "").trim();
      const brife = String(o.brife ?? o.brief ?? "").trim();
      const url = String(o.url ?? "").trim();
      return {
        id: `coze-${i}`,
        title,
        summary: brife,
        source: url ? safeHost(url) : "Coze 实时抓取",
        time: "刚刚抓取",
        heat: 92 - i * 2,
        category: "实时热点",
        keywords: [],
      } as NewsItem;
    });
}

// ---- matchGoods 输出（output_goods_list: [{documentId, output}]）→ Product[] ----
// Coze 知识库返回的 output 实际是带引号的 JSON 字符串：
//   {"商品名称":"进口...","分类":"食品","价格":"154.66 元","规格":"200g/罐","促销":"满199-30","产地":"埃塞俄比亚"}
// 优先 JSON.parse 抽取结构化字段，解析失败再 fallback 到旧逻辑
function tryParseOutputJson(s: string): Record<string, string> | null {
  const trimmed = s?.trim();
  if (!trimmed) return null;
  // 仅在明显是 JSON 时尝试解析（避免误伤纯文本）
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v === null || v === undefined) continue;
        const val = typeof v === "string" ? v : Array.isArray(v) ? v.join("、") : String(v);
        if (val.trim()) out[k.trim()] = val.trim();
      }
      return Object.keys(out).length ? out : null;
    }
  } catch {
    return null;
  }
  return null;
}

function parsePriceNumber(s: string | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 旧逻辑：output 不是 JSON 时，按行提取商品名称
function extractProductNameFromText(output: string, idx: number): string {
  const lines = output
    .replace(/\\n/g, "\n")
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("【") || line.startsWith("[")) continue;
    if (line.length < 3) continue;
    return line.length > 36 ? line.slice(0, 36) + "…" : line;
  }
  return mockProducts[idx % mockProducts.length].name;
}

// ---- 类目 → 卖点库（Coze output 没给卖点时的兜底）----
// 比"mockProducts[i] 的 selling"更精准——按类目语义挑词，不再"咖啡豆商品显示游戏鼠标垫卖点"
const CATEGORY_SELLING_LIBRARY: Record<string, string[]> = {
  // 食品饮料
  "食品":      ["严选原料", "口碑好货", "产地直采", "限时优惠"],
  "饮料":      ["新鲜直达", "健康无添加", "整箱更划算", "冷链锁鲜"],
  "咖啡":      ["产地直采", "中度烘焙", "现磨现泡", "香气浓郁"],
  "茶饮":      ["头采春茶", "清香回甘", "独立包装", "冷热双泡"],
  "新茶饮":    ["鲜奶现萃", "真茶底料", "季节限定", "门店同款"],
  "酒水":      ["纯粮酿造", "陈年窖藏", "正品保障", "送礼佳品"],
  // 数码家电
  "手机":      ["正品保障", "极速发货", "以旧换新", "12 期免息"],
  "手机配件":  ["原装品质", "严丝合缝", "防摔耐用", "快充适配"],
  "数码配件":  ["极速充电", "小巧便携", "多设备兼容", "安全保护"],
  "家电":      ["节能省电", "静音运行", "全国联保", "送货上门"],
  "清凉家电":  ["3 秒速冷", "静音运行", "USB 供电", "节能省电"],
  // 服饰美妆
  "服饰":      ["亲肤面料", "百搭款式", "工厂直发", "七天无理由"],
  "服饰配饰":  ["真丝材质", "送礼佳品", "复古工艺", "明星同款"],
  "美妆":      ["专柜正品", "效果显著", "敏感肌可用", "达人推荐"],
  // 户外/出行
  "户外装备":  ["防水耐磨", "轻量便携", "专业级", "户外实测"],
  "骑行装备":  ["轻量设计", "安全防护", "透气速干", "专业级"],
  "旅行用品":  ["防水收纳", "轻便出行", "套装划算", "旅行必备"],
  // 其他
  "游戏外设":  ["人体工学", "RGB 灯效", "电竞级", "低延迟"],
  "智能硬件":  ["AI 赋能", "语音控制", "IoT 联动", "持续更新"],
  "宠物用品":  ["宠物安全", "耐用耐咬", "易清洁", "适口性好"],
};
const GENERIC_SELLING = ["限时优惠", "正品保障", "口碑好货", "包邮到家"];

// 根据 category 拿卖点；找不到精确类目时做模糊匹配，再退到通用兜底
function fallbackSellingByCategory(category: string, count: number): string[] {
  const lib = CATEGORY_SELLING_LIBRARY[category];
  if (lib) return lib.slice(0, count);
  // 模糊匹配：包含关键词的类目
  for (const [key, arr] of Object.entries(CATEGORY_SELLING_LIBRARY)) {
    if (category.includes(key) || key.includes(category)) return arr.slice(0, count);
  }
  return GENERIC_SELLING.slice(0, count);
}

function parseMatchGoodsOutput(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((o, i) => {
      const rawOutput = String(o.output ?? "").trim();
      const documentId = String(o.documentId ?? `coze-g-${i}`);
      const seed = mockProducts[i % mockProducts.length];
      const json = tryParseOutputJson(rawOutput);

      if (json) {
        // 真实数据：name / price / category / selling 全部从 output 拿
        // ⚠️ id 必须加 idx 后缀：Coze 知识库同一文档多个切片共享同一 documentId，会导致前端的 includes 检查把多个商品误判为"已绑定"
        const baseId = documentId || `coze-g`;
        const uniqueId = `${baseId}#${i}`;
        // 销量统计 / 详情文本（用于 createCopy 工作流）
        const monthFromCoze = parsePriceNumber(json["最近一个月"]);
        const detailFromCoze = json["详情"] || "";

        return {
          id: uniqueId,
          name: json.商品名称 || json.商品 || json.name || seed.name,
          price: parsePriceNumber(json.价格 || json.售价 || json.price) ?? seed.price,
          originalPrice:
            parsePriceNumber(json.原价 || json.划线价) ??
            Math.round((parsePriceNumber(json.价格) ?? seed.price) * 1.3),
          image: seed.image,
          selling: (() => {
            const arr: string[] = [];
            if (json.规格) arr.push(json.规格);
            if (json.促销) arr.push(json.促销);
            if (json.产地) arr.push(`产地：${json.产地}`);
            if (json.卖点) {
              const extras = json.卖点.split(/[、，,；;]+/).map((s) => s.trim()).filter(Boolean);
              for (const x of extras) if (arr.length < 4) arr.push(x);
            }
            if (arr.length < 3) {
              for (const s of fallbackSellingByCategory(json.分类 || json.类目 || json.category || "", 4)) {
                if (arr.length >= 3) break;
                if (!arr.includes(s)) arr.push(s);
              }
            }
            if (arr.length < 3) {
              for (const s of GENERIC_SELLING) {
                if (arr.length >= 3) break;
                if (!arr.includes(s)) arr.push(s);
              }
            }
            return arr;
          })(),
          category: json.分类 || json.类目 || json.category || seed.category,
          matchKeywords: seed.matchKeywords,
          month: monthFromCoze ?? undefined,
          detail: detailFromCoze || undefined,
        } as Product;
      }

      // output 不是 JSON → fallback 旧文本提取 + mock 兜底（同样加 idx 保证 id 唯一）
      return {
        id: `${documentId || "coze-g"}#${i}`,
        name: extractProductNameFromText(rawOutput, i),
        price: seed.price,
        originalPrice: seed.originalPrice,
        image: seed.image,
        selling: seed.selling,
        category: seed.category,
        matchKeywords: seed.matchKeywords,
      } as Product;
    });
}

// ---- 三个独立调用 ----

/**
 * Step1 工作流：抓取新闻热点
 * - 失败/空返回一律抛出错误，不再静默回退 mock（由 Context 决定如何提示用户）
 * - 自动兼容 news_list / list / newsList 三种字段命名（以防 Coze 端命名不一致）
 * - 完整响应写入 console.log，便于排查
 */
export async function runGetNews(q = "", count = 10): Promise<NewsItem[]> {
  const resp = await axios.post(
    "/api/coze",
    { workflow_id: WORKFLOW_GETNEWS, parameters: { input: q, count } },
    { timeout: 120000 }
  );
  console.log("[getNews] raw response:", JSON.stringify(resp.data, null, 2));
  const inner = parseInner(resp.data?.data ?? resp.data);
  console.log("[getNews] parsed inner keys:", Object.keys(inner ?? {}));
  // 兼容多种字段命名
  const rawList = (inner as Record<string, unknown>).news_list
    ?? (inner as Record<string, unknown>).list
    ?? (inner as Record<string, unknown>).newsList
    ?? (inner as Record<string, unknown>).outputList;
  console.log("[getNews] rawList type:", typeof rawList, Array.isArray(rawList) ? `array(${rawList.length})` : rawList);
  const news = parseNewsList(rawList);
  console.log("[getNews] parsed news count:", news.length, "first title:", news[0]?.title);
  if (!news.length) {
    throw new Error("news_list 解析为空：检查 Coze 工作流是否已发布、字段名是否为 news_list、是否含 title/brife/url 字段");
  }
  return news;
}

/**
 * Step2 工作流：基于用户选定的单条新闻，返回相关商品列表
 * - 失败/空返回一律抛出错误（不再静默回退 mock）
 * - 完整响应写入 console.log，便于排查字段名/参数格式
 */
export async function runMatchGoods(news: NewsItem, q = ""): Promise<Product[]> {
  const params = {
    input: q,
    news: {
      title: news.title,
      brief: news.summary,  // matchGoods 工作流矫正后字段名是 brief（不是 brife）
      url: news.url ?? "",
    },
  };
  console.log("[matchGoods] request params:", JSON.stringify(params, null, 2));
  const resp = await axios.post(
    "/api/coze",
    {
      workflow_id: WORKFLOW_MATCHGOODS,
      parameters: params,
    },
    { timeout: 120000 }
  );
  console.log("[matchGoods] raw response:", JSON.stringify(resp.data, null, 2));
  const inner = parseInner(resp.data?.data ?? resp.data);
  console.log("[matchGoods] parsed inner keys:", Object.keys(inner ?? {}));
  // 兼容多种字段命名
  const rawList = (inner as Record<string, unknown>).output_goods_list
    ?? (inner as Record<string, unknown>).goods_list
    ?? (inner as Record<string, unknown>).products
    ?? (inner as Record<string, unknown>).outputList;
  console.log("[matchGoods] rawList:", Array.isArray(rawList) ? `array(${rawList.length})` : typeof rawList);
  const products = parseMatchGoodsOutput(rawList);
  console.log("[matchGoods] parsed products count:", products.length, "first name:", products[0]?.name);
  if (!products.length) {
    throw new Error("output_goods_list 解析为空：检查 Coze 工作流是否已发布、字段名是否为 output_goods_list、knowledge base 是否选了实例");
  }
  return products;
}

/**
 * Step4 工作流：基于选定新闻+商品 + 用户自定义创作要求，生成营销文案
 * - 失败/空返回一律抛出错误（不再静默回退 mock）
 * - 完整请求/响应写入 console.log
 * - 解析响应兼容多种输出形态：
 *   ① `output_red_list` / `copies` / `list`：字符串数组（旧设计 / LLM 数组输出）
 *   ② `output_wb` / `output` / `text`：字符串（当前 createCopy 结束节点实际输出）；
 *      内部若含 \n\n 分隔的多段，按段切分，模拟"多版本"以便前端 ABC 切换。
 *   ③ 兜底：把内层所有 str 字段拼起来按 \n\n 切。
 */
export async function runCreateCopy(
  news: NewsItem,
  products: Product[],
  userPrompt = ""
): Promise<string[]> {
  const params = {
    news: {
      title: news.title,
      brief: news.summary,    // createCopy 字段名是 brief
      url: news.url ?? "",
    },
    products: products.map((p) => ({
      product:        p.name,             // 商品名
      price:          p.price,            // 价格（Number）
      classification: p.category ?? "",   // 分类
      month:          p.month ?? 0,       // 最近一个月销量（Number，可 0）
      detail:         p.detail ?? "",     // 详情文本
    })),
    user_prompt: userPrompt,              // 用户在前端输入的"创作要求"
  };
  console.log("[createCopy] request params:", JSON.stringify(params, null, 2));
  const resp = await axios.post(
    "/api/coze",
    { workflow_id: WORKFLOW_CREATECOPY, parameters: params },
    { timeout: 120000 }
  );
  console.log("[createCopy] raw response:", JSON.stringify(resp.data, null, 2));
  const inner = parseInner(resp.data?.data ?? resp.data);
  console.log("[createCopy] parsed inner keys:", Object.keys(inner ?? {}));

  // ① 数组形态优先
  const arrRaw = (inner as Record<string, unknown>).output_red_list
    ?? (inner as Record<string, unknown>).copies
    ?? (inner as Record<string, unknown>).list;
  if (Array.isArray(arrRaw)) {
    const list = arrRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (list.length) return list;
  }

  // ② 字符串形态：output_wb（当前 createCopy 结束节点实际输出）
  const strRaw = (inner as Record<string, unknown>).output_wb
    ?? (inner as Record<string, unknown>).output
    ?? (inner as Record<string, unknown>).text
    ?? (inner as Record<string, unknown>).copy;
  if (typeof strRaw === "string" && strRaw.trim()) {
    // 字符串内含 \n\n 分隔时按段切，作为多个版本；否则整段作为 1 个版本
    const parts = strRaw
      .split(/\n\s*\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [strRaw.trim()];
  }

  // ③ 兜底：内层找任何 string 字段拼起来
  const fallback: string[] = [];
  for (const v of Object.values(inner as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) {
      const parts = v.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
      fallback.push(...(parts.length ? parts : [v.trim()]));
    }
  }
  if (!fallback.length) {
    throw new Error(
      "createCopy 输出字段异常：未找到 output_wb / output_red_list 等可用字段（确认结束节点输出名）"
    );
  }
  return fallback;
}

// ---- 兼容旧 API（Step4Create 的 generateCopies import 暂保留）----
export async function generateCopies({
  news,
  products,
  userPrompt = "",
}: {
  news: NewsItem;
  products: Product[];
  userPrompt?: string;
}): Promise<string[]> {
  return runCreateCopy(news, products, userPrompt);
}

// ---- 大模型匹配（matchGoods = llm 模式）----
// 调用 /api/llm（由 Dev 服务器转发到 OpenAI 兼容端点，规避 CORS 与密钥暴露给目标域）
export async function callLLM(
  llm: { baseURL: string; apiKey: string; model: string },
  messages: { role: string; content: string }[],
  temperature = 0.4
): Promise<string> {
  const resp = await axios.post(
    "/api/llm",
    { baseURL: llm.baseURL, apiKey: llm.apiKey, model: llm.model, messages, temperature },
    { timeout: 120000 }
  );
  const data = resp.data;
  // OpenAI 兼容：choices[0].message.content
  if (data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
    return String(data.choices[0].message.content || "");
  }
  // 宽容兜底：字符串 / 嵌套 text
  if (typeof data === "string") return data;
  if (data && typeof data.text === "string") return data.text;
  throw new Error("大模型返回格式异常：未找到 choices[0].message.content");
}

// 用新闻标题/内容填充匹配提示词，调用 LLM 产出关键词原始文本
export async function runMatchByLLM(
  news: NewsItem,
  prompt: string,
  llm: { baseURL: string; apiKey: string; model: string }
): Promise<string> {
  const filled = (prompt || "")
    .replace(/\{\{\s*title\s*\}\}/g, news.title || "")
    .replace(/\{\{\s*brief\s*\}\}/g, news.summary || "");
  console.log("[matchByLLM] filled prompt:", filled);
  const text = await callLLM(llm, [{ role: "user", content: filled }]);
  console.log("[matchByLLM] raw keywords:", text);
  return text;
}

// 把 LLM 输出解析为关键词数组（按中文/英文标点、换行切分；"没有对应内容"视为空）
export function parseKeywords(text: string): string[] {
  const t = (text || "").trim();
  if (!t || t === "没有对应内容") return [];
  return t
    .split(/[，,、;；\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 用关键词在商品库里检索命中商品（按命中数降序，返回带匹配分）
export function searchProductsByKeywords(
  keywords: string[],
  products: Product[]
): Product[] {
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