/**
 * 文案模板配置 —— 与运营后台 admin/ 共用同一套规则。
 *
 * 三个可编辑块（后台「文案模板 · 模型指令」页）：
 *   - system      角色设定与写作规范（写给模型的人设 + 规则）
 *   - template    素材拼装模板（含 {{hotspot_title}} 等运行期占位符）
 *   - itemFormat  单件商品在素材里的呈现格式（含 {{product_name}} 等）
 *
 * 两个运营可配置的「驱动维度」：
 *   - creativeStyles  创作风格：每个风格独立跑一次 createCopy，产出 1 个候选版本。
 *                     每个风格有 name（名称）+ requirement（创作要求）。至少保留 1 个。
 *   - tonePresets     语调预设：一组标签，工作台「主打语调」下拉的可选项；
 *                     选中后作为素材的一部分传给模型。
 *
 * 运行时读取优先级：本机浏览器(localStorage) → 服务端 → 内置默认。
 *   · 运营在后台改完点「保存」会写入 localStorage，下次生成立即生效。
 *   · 后台的顶栏徽章仍按 服务端→本机→默认 显示“当前生效来源”，二者不冲突。
 */

const LS_KEY = "hg_admin_config_v1";
const SERVER_URL = "/admin/server-config.json";

export interface PromptConfig {
  system: string;
  template: string;
  itemFormat: string;
}

/** 创作风格：驱动一个候选版本 */
export interface CreativeStyle {
  name: string;
  requirement: string;
}

/** 一次性下发的完整文案配置（工作台生成时读取） */
export interface CopyConfig {
  prompt: PromptConfig;
  creativeStyles: CreativeStyle[];
  tonePresets: string[];
}

/** 内置默认（与 admin 的 BUILTIN_DEFAULTS 保持一致） */
export const BUILTIN_PROMPT: PromptConfig = {
  system:
    "你是一位资深的微博营销文案专家，擅长把热点新闻与商品结合，产出高转化率的微博文案。\n\n" +
    "# 任务\n" +
    "基于下方【素材】中的新闻热点、商品信息与【创作要求】，创作 1 条营销文案。\n\n" +
    "# 写作规范\n" +
    "1. 仅输出 1 个完整版本，严格遵循【创作要求】中的“主打语调”和“创作风格 / 风格要求”，不要拆分成多个版本，也不要使用任何分隔符或编号。\n" +
    "2. 严禁任何前缀、编号或分隔标记（如“版本1：”、“A:”、“---”、“【】”等等）。\n" +
    "3. 严禁开场白、解释、注释，以及用 markdown 代码块包裹。\n" +
    "4. 单个版本 100-200 字，语气符合微博调性（有网感、有梗、emoji 自然）。\n" +
    "5. 至少包含 1 个 # 话题标签。\n" +
    "6. 末尾必须带互动提问或限时福利钩子。\n" +
    "7. 【商品边界·硬约束】严禁在文案中提及【商品清单】以外的产品。只能使用清单中明确列出的商品名、价格、卖点；不允许添加、替换、联想或推荐同类其他商品。文案中提及的商品数量必须与【商品清单】保持一致。",
  template:
    "【新闻热点】\n" +
    "标题：{{hotspot_title}}\n" +
    "摘要：{{hotspot_summary}}\n" +
    "话题标签：{{topic_tags}}\n\n" +
    "【商品清单】\n" +
    "{{product_list}}\n\n" +
    "【创作要求】\n" +
    "主打语调：{{tone}}\n" +
    "创作风格：{{style_name}} —— {{style_requirement}}",
  itemFormat:
    "- 商品：{{product_name}}｜价格：¥{{product_price}}｜分类：{{product_category}}｜卖点：{{product_selling}}",
};

/** 内置默认创作风格（至少 1 个）：每个风格独立驱动 1 个候选版本 */
export const BUILTIN_CREATIVE_STYLES: CreativeStyle[] = [
  { name: "热点借势", requirement: "先接住热点情绪再自然过渡到商品，重体验感。" },
  { name: "促销导向", requirement: "突出价格钩子和紧迫感，重转化。" },
];

/** 内置默认语调预设：工作台「主打语调」下拉的可选项 */
export const BUILTIN_TONE_PRESETS: string[] = ["热点借势", "促销导向", "互动话题"];

function mergePrompt(p: Partial<PromptConfig> | undefined): PromptConfig {
  return {
    system: p?.system ?? BUILTIN_PROMPT.system,
    template: p?.template ?? BUILTIN_PROMPT.template,
    itemFormat: p?.itemFormat ?? BUILTIN_PROMPT.itemFormat,
  };
}

/**
 * 渲染模板：认识的占位符 → 替换；不认识（含笔误）的 {{xxx}} → 原样保留，不变成空白。
 */
export function renderTemplate(tpl: string, data: Record<string, unknown>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const v = data[key];
      return v == null ? "" : String(v);
    }
    return `{{${key}}}`; // 未知占位符原样保留
  });
}

/**
 * 渲染素材 + 模板，产出「模型要看到的 user 内容」（不含 system）。
 * template 的 {{product_list}} 是“容器占位符”，内部逐件按 itemFormat 渲染后再拼接（嵌套）。
 */
function buildMaterial(opts: {
  news: { title: string; summary?: string; keywords?: string[] };
  products: Array<{
    name: string;
    price?: number | string;
    category?: string;
    selling?: string[];
    month?: number | string;
    detail?: string;
  }>;
  tone?: string;
  styleName?: string;
  styleRequirement?: string;
  extraRequirement?: string;
  prompt: PromptConfig;
}): string {
  const { news, products = [], tone = "", styleName = "", styleRequirement = "", extraRequirement = "", prompt } = opts;

  const topicTags = (news.keywords || []).map((k) => `#${k}`).join(" ");

  // 嵌套：每件商品按 itemFormat 渲染，再拼成一个 product_list 字符串
  const productList = products
    .map((pr) =>
      renderTemplate(prompt.itemFormat, {
        product_name: pr.name,
        product_price: pr.price ?? "",
        product_category: pr.category ?? "",
        product_selling: (pr.selling || []).join("、"),
        product_month: pr.month ?? "",
        product_detail: pr.detail ?? "",
      })
    )
    .join("\n");

  const rendered = renderTemplate(prompt.template, {
    hotspot_title: news.title,
    hotspot_summary: news.summary ?? "",
    topic_tags: topicTags,
    product_list: productList,
    tone,
    style_name: styleName,
    style_requirement: styleRequirement,
  });

  let material = rendered;
  // 可选补充要求：非空时追加一行，避免模板出现空白行
  if (extraRequirement && extraRequirement.trim()) {
    material += "\n\n补充要求：" + extraRequirement.trim();
  }

  return material;
}

/**
 * 拼装最终下发给模型的 user_prompt（system + "\n\n" + 渲染后的 template）。
 * 兼容旧调用方（Coze / 单段字符串场景）。
 */
export function assembleUserPrompt(opts: {
  news: { title: string; summary?: string; keywords?: string[] };
  products: Array<{
    name: string;
    price?: number | string;
    category?: string;
    selling?: string[];
    month?: number | string;
    detail?: string;
  }>;
  tone?: string;
  styleName?: string;
  styleRequirement?: string;
  extraRequirement?: string;
  prompt: PromptConfig;
}): string {
  const material = buildMaterial(opts);
  return (opts.prompt.system ? opts.prompt.system + "\n\n" : "") + material;
}

/**
 * 拆成标准 chat 消息：system 单独成段、user 为渲染后的素材模板。
 * 供「接入的大模型」（/api/llm，OpenAI 兼容）使用，替代 Coze createCopy 工作流。
 */
export function assembleCopyMessages(opts: {
  news: { title: string; summary?: string; keywords?: string[] };
  products: Array<{
    name: string;
    price?: number | string;
    category?: string;
    selling?: string[];
    month?: number | string;
    detail?: string;
  }>;
  tone?: string;
  styleName?: string;
  styleRequirement?: string;
  extraRequirement?: string;
  prompt: PromptConfig;
}): { system: string; user: string } {
  const material = buildMaterial(opts);
  return { system: opts.prompt.system || "", user: material };
}

/** 读取当前生效的「完整文案配置」：本机 → 服务端 → 内置默认 */
export async function loadCopyConfig(): Promise<CopyConfig> {
  let base: { prompt?: Partial<PromptConfig>; creativeStyles?: CreativeStyle[]; tonePresets?: string[] } | null = null;

  // ① 本机浏览器（运营保存的覆盖值，优先）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) base = JSON.parse(raw);
  } catch {
    /* localStorage 不可用 */
  }

  // ② 服务端
  if (!base) {
    try {
      const r = await fetch(SERVER_URL, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        if (data && (data.prompt || data.creativeStyles || data.tonePresets)) base = data;
      }
    } catch {
      /* 服务不可用，落到内置默认 */
    }
  }

  // ③ 内置默认
  if (!base) base = {};

  const styles = Array.isArray(base.creativeStyles) && base.creativeStyles.length
    ? base.creativeStyles
    : BUILTIN_CREATIVE_STYLES;
  const tones = Array.isArray(base.tonePresets) && base.tonePresets.length
    ? base.tonePresets
    : BUILTIN_TONE_PRESETS;

  return {
    prompt: mergePrompt(base.prompt),
    creativeStyles: styles,
    tonePresets: tones,
  };
}

/* ============================================================
 * 商品匹配（matchGoods）配置 —— 与运营后台 admin/ 共用同一套规则。
 * 支持两种模式：
 *   - coze：沿用既有 matchGoods 工作流（Coze 知识库返回商品）。
 *   - llm ：前端用大模型分析新闻 → 生成商品关键词 → 在本地商品库检索推荐。
 * 运行时读取优先级：本机浏览器(localStorage) → 服务端(/api/admin-config) → 内置默认。
 * ============================================================ */

export type MatchMode = "coze" | "llm";

export interface MatchConfig {
  mode: MatchMode;
  prompt: string;
  llm: { simulate: boolean; baseURL: string; model: string; apiKey: string };
}

/** 内置默认匹配提示词（与 admin / vite 的 BUILTIN_DEFAULTS.matchGoods.prompt 保持一致） */
export const BUILTIN_MATCH_PROMPT = `# 角色：商品匹配师
你是一名专业的电商商品匹配师，擅长从热点新闻中识别出用户可能产生的消费需求，并将其转化为可在商品库中检索的关键词。

# 目标
阅读新闻，判断这条新闻会让读者联想到哪些"值得购买的商品"，并输出一组用于检索商品库的关键词。

# 输入
- 新闻标题：{{title}}
- 新闻内容：{{brief}}

# 技能
1. 提取新闻中的显性消费信号（如降温→保暖衣物、情人节→礼物、高考→文具/电子产品）。
2. 推断新闻背后的隐性需求（如极端天气→家居应急、节日→馈赠、健康话题→食品/保健）。
3. 把需求翻译成"商品名 / 品类 / 卖点"形式的简练关键词。

# 工作流
1. 阅读新闻标题《{{title}}》与内容：{{brief}}
2. 列出这条新闻可能带动的 3~8 个商品方向，优先贴近真实在售品类。
3. 将每个方向压缩为 1~4 个字的检索关键词（名词为主，可含品类或核心卖点）。

# 输出格式
仅输出一行关键词，用中文逗号（，）或顿号（、）分隔，例如：保暖衣物，礼物，坚果，咖啡
不要输出编号、解释、Markdown 或任何额外文字。

# 库内主要品类（供你偏向，提高命中率）
食品、礼品、食品饮料、数码配件、游戏外设、手机配件、清凉家电、服饰配饰、骑行装备、智能硬件、旅行用品

# 限制
- 只输出商品关键词，不要涉及其他内容。
- 关键词需要简练，不要多余的形容词与修饰语。
- 优先输出能在商品库中被检索到的品类或商品名。
- 如果确实对应不出任何商品，则只输出：没有对应内容`;

// 注意：apiKey 不再写进内置默认值（避免泄漏到前端包 / git 历史）。
// 真实密钥来源：① 本机 .env 的 AIGW_API_KEY（dev 时 /api/llm 服务端兜底）；
//            ② 运营在后台「模型接入」填写并存于本机 localStorage（前端传来优先）。
export const BUILTIN_LLM = {
  simulate: false,
  baseURL: "https://aigw.yuexiuproperty.cn/v1",
  model: "deepseek-v4-flash",
  apiKey: "",
};

/** 读取当前生效的商品匹配配置：本机 → 服务端 → 内置默认 */
export async function loadMatchConfig(): Promise<MatchConfig> {
  let base: { matchGoods?: any; llm?: any } | null = null;

  // ① 本机浏览器（运营保存的覆盖值，优先，含 apiKey）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) base = JSON.parse(raw);
  } catch {
    /* localStorage 不可用 */
  }

  // ② 服务端（/api/admin-config 已补默认；apiKey 在服务端文件中已被剥离，仅留本机）
  if (!base) {
    try {
      const r = await fetch("/api/admin-config", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        if (d && d.config && (d.config.matchGoods || d.config.llm)) base = d.config;
      }
    } catch {
      /* 服务不可用，落到内置默认 */
    }
  }

  // ③ 内置默认
  if (!base) base = {};

  const mg = base.matchGoods || {};
  const llm = base.llm || {};
  return {
    mode: mg.mode === "llm" ? "llm" : "coze",
    prompt: typeof mg.prompt === "string" && mg.prompt.trim() ? mg.prompt : BUILTIN_MATCH_PROMPT,
    llm: {
      simulate: !!llm.simulate,
      baseURL: typeof llm.baseURL === "string" && llm.baseURL.trim() ? llm.baseURL : BUILTIN_LLM.baseURL,
      model: typeof llm.model === "string" && llm.model.trim() ? llm.model : BUILTIN_LLM.model,
      apiKey: typeof llm.apiKey === "string" ? llm.apiKey : BUILTIN_LLM.apiKey,
    },
  };
}

/* ============================================================
 * 新闻抓取来源配置 —— 与运营后台 admin/ 共用同一套规则。
 * 来源可配置：内置平台热榜（builtin）+ 运营自定义订阅源。
 * 工作台 Step1 通过 /api/news 聚合「已启用」来源真实抓取。
 * 读取优先级：本机浏览器(localStorage) → 服务端(/api/admin-config) → 内置默认。
 * ============================================================ */

export type NewsSourceKind = "rss" | "json" | "weibo" | "toutiao" | "bilibili" | "zhihu" | "baidu";

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  kind: NewsSourceKind;
  enabled: boolean;
  builtin: boolean;
  jsonItemsPath?: string;
  jsonTitlePath?: string;
  jsonBriefPath?: string;
  jsonUrlPath?: string;
}

/** 内置默认新闻来源（与 admin / vite 的 BUILTIN_DEFAULTS.newsSources 保持一致） */
export const BUILTIN_NEWS_SOURCES: NewsSource[] = [
  { id: "src-weibo", name: "微博热搜", url: "https://weibo.com/ajax/side/hotSearch", kind: "weibo", enabled: true, builtin: true },
  { id: "src-toutiao", name: "今日头条热榜", url: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc", kind: "toutiao", enabled: true, builtin: true },
  { id: "src-bilibili", name: "B站热门", url: "https://api.bilibili.com/x/web-interface/popular?ps=20", kind: "bilibili", enabled: true, builtin: true },
  { id: "src-zhihu", name: "知乎热榜", url: "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20", kind: "zhihu", enabled: true, builtin: true },
  { id: "src-baidu", name: "百度热点", url: "https://top.baidu.com/board?tab=realtime", kind: "baidu", enabled: true, builtin: true },
];

/** 读取当前生效的新闻来源列表：本机 → 服务端 → 内置默认 */
export async function loadNewsSources(): Promise<NewsSource[]> {
  let base: { newsSources?: NewsSource[] } | null = null;

  // ① 本机浏览器
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) base = JSON.parse(raw);
  } catch {
    /* localStorage 不可用 */
  }

  // ② 服务端
  if (!base || !Array.isArray(base.newsSources) || !base.newsSources.length) {
    try {
      const r = await fetch("/api/admin-config", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        if (d && d.config && Array.isArray(d.config.newsSources) && d.config.newsSources.length) {
          base = d.config as { newsSources: NewsSource[] };
        }
      }
    } catch {
      /* 服务不可用 */
    }
  }

  // ③ 内置默认
  if (!base || !Array.isArray(base.newsSources) || !base.newsSources.length) {
    return BUILTIN_NEWS_SOURCES.slice();
  }
  return base.newsSources;
}
