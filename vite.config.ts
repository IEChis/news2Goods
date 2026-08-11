import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"
import fs from "node:fs"
import { loadEnv } from "vite"

// 真实 LLM 密钥只从本机 .env 读取，绝不写进源码/默认值（.env 已被 .gitignore 忽略）。
// 这样前端打包产物和 git 历史里都不会出现密钥；dev 时由 /api/llm 服务端兜底使用。
const env = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", process.cwd(), "")
const AIGW_API_KEY = env.AIGW_API_KEY || process.env.AIGW_API_KEY || ""
// 评测体系内置默认：内联镜像自前端 src/eval/prompts.ts 的 BUILTIN_EVAL（vite 的 node 项目用 nodenext 解析，
// 不便跨文件 import .ts；此处与前端默认值保持一致，作为 /api/admin-config 下发的 eval 默认来源）。
const BUILTIN_EVAL = {
  enabledReview: true,
  weightsMachine: 0.5,
  lengthMin: 100,
  lengthMax: 200,
  emojiMin: 0,
  emojiMax: 4,
  hashtagCountMax: 6,
  bannedWords: [
    "最佳", "最好", "最低", "第一", "国家级", "顶级", "绝对", "永久", "百分百", "100%",
    "全网最低", "唯一", "首选", "冠军", "领导品牌", "完美", "万能", "极致", "史无前例", "空前",
    "绝无仅有", "王牌", "销量第一", "独家", "最低价", "底价", "零风险", "最", "永久免费",
    "免单", "点击有惊喜", "立即下载", "秒杀",
  ].join("\n"),
  reviewPrompt:
    "你是一位严格的微博营销文案评审专家。下面给你一条待评审的文案，以及它的素材（热点 + 商品）。\n\n" +
    "请只输出一个 JSON 对象（不要任何额外文字、不要代码块包裹），结构如下：\n" +
    "{\n" +
    '  "relevance": 1,        // 热点关联度：1=生硬拼接，5=真借上了这个热点\n' +
    '  "materialFidelity": 1, // 素材还原度：1=卖点/价格瞎编，5=用得准、无编造\n' +
    '  "appeal": 1,           // 传播吸引力：1=没钩子没网感，5=让人想点开\n' +
    '  "naturalness": 1,      // 语气自然度：1=一股机器味，5=像真人在发微博\n' +
    '  "comment": "一句话总评"\n' +
    "}\n\n" +
    "评分要求：稳定、严格，不要人情分。维度之间允许有差距。",
  reworkPrompt:
    "你是一位严谨的文案校对员。下面给你一条「没通过的文案」和「具体没过的原因清单」。\n\n" +
    "请严格按清单修改，只输出修正后的完整文案（不要解释、不要前缀、不要代码块）：\n" +
    "- 违禁词：必须删掉或换成合规表述，绝不能再出现清单里点名的违禁词。\n" +
    "- 编造价格：素材里没给的价格/折扣/销量一律删除或替换为素材真实金额；只能原样使用素材给出数字。\n" +
    "- 字数：写完自己数一遍，超了就删（宁可少写一个卖点也不能超上限）；不够则在不违规前提下补一句。\n" +
    "- 话题标签：补齐素材指定的标签，且总标签数不要过多。\n" +
    "- 互动引导：结尾补一个互动提问或限时福利钩子。\n" +
    "- 残留符号：去掉反引号、Markdown 标题/分隔线、【】括号等残留排版符号。\n\n" +
    "其余合规的部分原样保留，不要擅改语气和卖点。",
  reworkMaxRounds: 3,
  concurrency: 3,
  repeats: 1,
  unitPrice: 0.01,
  model: "",
  reviewTemp: 0.2,
  reworkTemp: 0.2,
  simulate: false,
}

// Coze 凭证与工作流 ID：全部从本机 .env 注入（.env 已被 gitignore）。
// 仓库源码只保留占位符 "<COZE_WORKFLOW_ID>" / 空 token，不携带任何真实凭证或标识。
// 真实值由 dev 服务器在 /api/coze、/api/coze-trial 服务端使用，不会进入前端打包产物。
// 注意：loadEnv(..., "") 会把 .env 里的变量放入返回的 env 对象，但不会写回 process.env。
// 因此这里统一从 env 读取（兜底 process.env，兼容在 shell 里 export 的场景）。
const COZE_TOKEN = env.COZE_PAT || process.env.COZE_PAT || ""
const COZE_WF_GETNEWS    = env.COZE_WF_GETNEWS || process.env.COZE_WF_GETNEWS || "<COZE_WORKFLOW_ID>"
const COZE_WF_MATCHGOODS = env.COZE_WF_MATCHGOODS || process.env.COZE_WF_MATCHGOODS || "<COZE_WORKFLOW_ID>"
const COZE_WF_CREATECOPY = env.COZE_WF_CREATECOPY || process.env.COZE_WF_CREATECOPY || "<COZE_WORKFLOW_ID>"

// createCopy 工作流 ID：与工作台 Step4 调用同一条；后台「试运行」用此条做端到端验证
const CREATE_COPY_WORKFLOW_ID = COZE_WF_CREATECOPY

/* 后台「试运行」专用：直接调 Coze /v1/workflow/run 的 createCopy 工作流。
   设计原因：Coze Chat API（/api/v1/chat/completions）不认工作流的 PAT，
   而工作流调用（/v1/workflow/run）才认这把 PAT。复用 vite 里现有的 PAT，
   让运营在后台改完模板就能立即验证真实产出，无需填任何密钥。
   入参：{ workflow_id, parameters: { news:{title,brief,url}, products:[{product,price,classification,month,detail}], user_prompt } }
   出参：原样透传 Coze 工作流 Run API 的 JSON 响应（含 output_wb 字符串，前端按 \n\n 切分多版本） */
function cozeTrialRelay() {
  return {
    name: "coze-trial-relay",
    configureServer(server: any) {
      server.middlewares.use("/api/coze-trial", async (req: any, res: any) => {
        if (req.method !== "POST") {
          res.statusCode = 405
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: { type: "method_not_allowed", message: "仅支持 POST" } }))
          return
        }
        let body = ""
        req.on("data", (c: any) => (body += c))
        req.on("end", async () => {
          try {
            const { workflow_id, parameters } = JSON.parse(body || "{}")
            if (!parameters || typeof parameters !== "object") {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ error: { type: "config_missing", message: "parameters 不能为空" } }))
              return
            }
            const wfId = workflow_id || CREATE_COPY_WORKFLOW_ID
            const upstream = await fetch("https://api.coze.cn/v1/workflow/run", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + COZE_TOKEN },
              body: JSON.stringify({ workflow_id: wfId, parameters }),
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json")
            res.end(text)
          } catch (e: any) {
            res.statusCode = 502
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: { type: "relay_error", message: e?.message || String(e) } }))
          }
        })
      })
    },
  }
}

// 通用 LLM 代理：后台「试运行」用。浏览器把 baseURL/apiKey/model/messages 发给同源 /api/llm，
// 由 Dev 服务器转发到目标 OpenAI 兼容端点并附带 Key，规避浏览器跨域(CORS)与 Key 暴露到目标域。
function llmRelay() {
  return {
    name: "llm-relay",
    configureServer(server: any) {
      server.middlewares.use("/api/llm", async (req: any, res: any) => {
        if (req.method !== "POST") {
          res.statusCode = 405
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ error: { type: "method_not_allowed", message: "仅支持 POST" } }))
          return
        }
        let body = ""
        req.on("data", (c: any) => (body += c))
        req.on("end", async () => {
          try {
            const { baseURL, apiKey: reqApiKey, model, messages, temperature } = JSON.parse(body || "{}")
            // 优先用前端传来的 key（运营在后台填的），兜底用本机 .env 的 AIGW_API_KEY；两者皆空才报错。
            const apiKey = reqApiKey || AIGW_API_KEY
            if (!baseURL || !apiKey || !model || !Array.isArray(messages)) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ error: { type: "config_missing", message: "请先在「模型接入」填写 baseURL、apiKey、model，且 messages 不能为空" } }))
              return
            }
            // 兼容 baseURL 已带 /chat/completions 的情况（避免双重拼接）
            const base = String(baseURL).replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
            const url = base + "/chat/completions";
            const upstream = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
              body: JSON.stringify({ model, messages, temperature: temperature ?? 0.7 }),
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json")
            res.end(text)
          } catch (e: any) {
            res.statusCode = 502
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ error: { type: "relay_error", message: e?.message || String(e) } }))
          }
        })
      })
    },
  }
}

// 运营后台配置读写：GET 读 server-config.json（缺字段自动补默认，避免误删段落后工作台崩）；
// POST 写入前先备份上一版到 server-config.backup.json，并校验关键内容非空（防误操作清空库）。
const ADMIN_CONFIG_PATH = path.resolve(import.meta.dirname, "admin", "server-config.json")
const ADMIN_CONFIG_BACKUP = path.resolve(import.meta.dirname, "admin", "server-config.backup.json")

// 后台配置的内置默认值（与服务端/前端的 BUILTIN_DEFAULTS 对齐，仅用于「读时补默认」）
/* 新闻抓取来源（可配置，不再写死在 Coze 工作流里）。
   内置平台热榜（builtin=true，不可删除，仅可启用/停用）+ 运营自定义订阅源（builtin=false，可增删）。
   kind:
     - rss     ：标准 RSS/Atom（XML），自动解析 <item>/<entry>
     - json    ：JSON 数组，按 jsonItemsPath/jsonTitlePath/... 取字段（自定义订阅源常用）
     - weibo/toutiao/bilibili/zhihu/baidu ：内置平台热榜的专属解析器 */
const BUILTIN_NEWS_SOURCES = [
  { id: "src-weibo", name: "微博热搜", url: "https://weibo.com/ajax/side/hotSearch", kind: "weibo", enabled: true, builtin: true },
  { id: "src-toutiao", name: "今日头条热榜", url: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc", kind: "toutiao", enabled: true, builtin: true },
  { id: "src-bilibili", name: "B站热门", url: "https://api.bilibili.com/x/web-interface/popular?ps=20", kind: "bilibili", enabled: true, builtin: true },
  { id: "src-zhihu", name: "知乎热榜", url: "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20", kind: "zhihu", enabled: true, builtin: true },
  { id: "src-baidu", name: "百度热点", url: "https://top.baidu.com/board?tab=realtime", kind: "baidu", enabled: true, builtin: true },
]

const ADMIN_DEFAULTS = {
  siteName: "热点营销运营后台",
  siteDesc: "电商热点营销工作台的运营配置中心",
  brandColor: "#7c3aed",
  defaultPrompt: "语气有网感，突出商品卖点，加入互动与福利钩子。",
  maxNews: 10,
  workflows: {
    getNews: { id: COZE_WF_GETNEWS, label: "抓取新闻热点" },
    matchGoods: { id: COZE_WF_MATCHGOODS, label: "匹配商品" },
    createCopy: { id: COZE_WF_CREATECOPY, label: "生成营销文案" },
  },
  prompt: {
    system:
      '你是一位资深的微博营销文案专家，擅长把热点新闻与商品结合，产出高转化率的微博文案。\n\n' +
      '# 任务\n基于下方【素材】中的新闻热点、商品信息与【创作要求】，创作 1 条营销文案。\n\n' +
      '# 写作规范\n' +
      '1. 仅输出 1 个完整版本，严格遵循【创作要求】中的“主打语调”和“创作风格 / 风格要求”，不要拆分成多个版本，也不要使用任何分隔符或编号。\n' +
      '2. 严禁任何前缀、编号或分隔标记（如“版本1：”、“A:”、“---”、“【】”等等）。\n' +
      '3. 严禁开场白、解释、注释，以及用 markdown 代码块包裹。\n' +
      '4. 单个版本 100-200 字，语气符合微博调性（有网感、有梗、emoji 自然）。\n' +
      '5. 至少包含 1 个 # 话题标签。\n' +
      '6. 末尾必须带互动提问或限时福利钩子。\n' +
      '7. 【商品边界·硬约束】严禁在文案中提及【商品清单】以外的产品。只能使用清单中明确列出的商品名、价格、卖点；不允许添加、替换、联想或推荐同类其他商品。文案中提及的商品数量必须与【商品清单】保持一致。',
    template:
      '【新闻热点】\n标题：{{hotspot_title}}\n摘要：{{hotspot_summary}}\n话题标签：{{topic_tags}}\n\n' +
      '【商品清单】\n{{product_list}}\n\n【创作要求】\n主打语调：{{tone}}\n创作风格：{{style_name}} —— {{style_requirement}}',
    itemFormat:
      '- 商品：{{product_name}}｜价格：¥{{product_price}}｜分类：{{product_category}}｜卖点：{{product_selling}}',
  },
  creativeStyles: [
    { name: "热点借势", requirement: "先接住热点情绪再自然过渡到商品，重体验感。" },
    { name: "促销导向", requirement: "突出价格钩子和紧迫感，重转化。" },
  ],
  tonePresets: ["热点借势", "促销导向", "互动话题"],
  // 大模型接入设置：供 matchGoods=llm 模式与「试运行」使用。
  // 注意：apiKey 不再写进内置默认值（避免泄漏到前端包 / git 历史）。
  // 真实密钥来源：① 本机 .env 的 AIGW_API_KEY（dev 时 /api/llm 服务端兜底）；
  //            ② 运营在后台「模型接入」填写并存于本机 localStorage（前端传来优先）。
  llm: {
    simulate: false,
    baseURL: "https://aigw.yuexiuproperty.cn/v1",
    model: "deepseek-v4-flash",
    apiKey: "",
  },
  // 商品匹配（matchGoods）配置：可切换「Coze 工作流」或「大模型」两种模式。
  // 大模型模式下，本 prompt 由 {{title}}/{{brief}} 填充后发给 LLM，
  // 产出商品关键词 → 前端在商品库里检索并推荐命中商品。
  matchGoods: {
    mode: "coze",
    prompt: `# 角色：商品匹配师
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
- 如果确实对应不出任何商品，则只输出：没有对应内容`,
  },
  // 商品库（运营可维护的单一数据源）。icon=emoji、gradient=CSS 背景渐变；与后台/工作台商品卡视觉一致。
  products: [
    { id: "p1", name: "游戏鼠标垫 黑神话悟空联名款 900×400mm", price: 89, originalPrice: 129, category: "游戏外设", selling: ["联名授权", "精密锁边", "防滑底面", "RGB灯效"], icon: "🎮", gradient: "linear-gradient(135deg,#818cf8,#4f46e5)" },
    { id: "p2", name: "华为 Mate 70 Pro 钛金属保护壳 磁吸款", price: 149, originalPrice: 199, category: "手机配件", selling: ["钛金属质感", "MagSafe磁吸", "防摔军工级", "轻薄0.8mm"], icon: "📱", gradient: "linear-gradient(135deg,#60a5fa,#3b82f6)" },
    { id: "p3", name: "桌面迷你空调扇 制冷加湿三合一 静音款", price: 168, originalPrice: 259, category: "清凉家电", selling: ["3秒速冷", "大容量水箱", "静音30dB", "USB供电"], icon: "❄️", gradient: "linear-gradient(135deg,#5eead4,#14b8a6)" },
    { id: "p4", name: "繁花同款 90年代复古丝巾 上海老字号", price: 68, originalPrice: 98, category: "服饰配饰", selling: ["繁花同款", "真丝材质", "上海风情", "送礼佳品"], icon: "🧣", gradient: "linear-gradient(135deg,#f9a8d4,#ec4899)" },
    { id: "p5", name: "城市骑行头盔 智能款 蓝牙通话+LED警示灯", price: 329, originalPrice: 459, category: "骑行装备", selling: ["蓝牙5.3", "智能灯光", "MIPS保护", "轻量280g"], icon: "🚴", gradient: "linear-gradient(135deg,#86efac,#22c55e)" },
    { id: "p6", name: "AI 智能陪伴机器人 桌面版 语音对话+情绪识别", price: 599, originalPrice: 899, category: "智能硬件", selling: ["GPT大模型", "情绪识别", "儿童模式", "IoT控制"], icon: "🤖", gradient: "linear-gradient(135deg,#a5b4fc,#6366f1)" },
    { id: "p7", name: "便携旅行收纳套装 6件套 防水压缩袋", price: 49, originalPrice: 79, category: "旅行用品", selling: ["防水材质", "压缩收纳", "6件套装", "轻便出行"], icon: "🧳", gradient: "linear-gradient(135deg,#e5e7eb,#9ca3af)" },
    { id: "p8", name: "冻干柠檬片 即冲即饮 独立包装 100片", price: 29.9, originalPrice: 49.9, category: "食品饮料", selling: ["FD冻干技术", "无添加糖", "独立包装", "冷热双泡"], icon: "🍋", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p9", name: "氮化镓充电器 100W 三口快充 折叠插脚", price: 129, originalPrice: 199, category: "数码配件", selling: ["GaN氮化镓", "100W大功率", "三口同时充", "折叠便携"], icon: "🔌", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p10", name: "复古骑行背包 防水卷口设计 25L大容量", price: 199, originalPrice: 299, category: "骑行装备", selling: ["防水面料", "卷口设计", "25L容量", "反光条"], icon: "🎒", gradient: "linear-gradient(135deg,#fdba74,#f97316)" },
    { id: "p11", name: "头戴耳机", price: 499, originalPrice: 699, category: "数码配件", selling: ["无线蓝牙"], icon: "🎧", gradient: "linear-gradient(135deg,#818cf8,#4f46e5)" },
    { id: "p12", name: "定制八音盒", price: 807.92, originalPrice: 969.5, category: "礼品", selling: ["品质保证", "适合商务馈赠"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p13", name: "网红咖啡豆", price: 180.8, originalPrice: 216.96, category: "食品", selling: ["保质期8个月", "健康美味"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p14", name: "轻奢钥匙扣", price: 892.83, originalPrice: 1071.4, category: "礼品", selling: ["送礼首选", "适合纪念日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p15", name: "网红燕麦片", price: 145.99, originalPrice: 175.19, category: "食品", selling: ["保质期11个月", "健康美味"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p16", name: "高端摆件87", price: 714.15, originalPrice: 856.98, category: "礼品", selling: ["设计独特", "适合节日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p17", name: "家庭装薯片", price: 274.74, originalPrice: 329.69, category: "食品", selling: ["保质期8个月", "回购率高"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p18", name: "简约手办14", price: 837.02, originalPrice: 1004.42, category: "礼品", selling: ["送礼首选", "适合纪念日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p19", name: "进口曲奇饼", price: 44.14, originalPrice: 52.97, category: "食品", selling: ["保质期8个月", "口感极佳"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p20", name: "简约手办84", price: 232.97, originalPrice: 279.56, category: "礼品", selling: ["设计独特", "适合商务馈赠"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p21", name: "美味巧克力", price: 213.77, originalPrice: 256.52, category: "食品", selling: ["保质期11个月. 口感极佳"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p22", name: "轻奢手办48", price: 468.51, originalPrice: 562.21, category: "礼品", selling: ["送礼首选", "适合商务馈赠"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p23", name: "有机坚果礼", price: 165.49, originalPrice: 198.59, category: "食品", selling: ["保质期8个月", "健康美味"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p24", name: "限量马克杯", price: 97.88, originalPrice: 117.46, category: "礼品", selling: ["包装精美", "适合纪念日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p25", name: "有机水果软", price: 168.18, originalPrice: 201.82, category: "食品", selling: ["保质期4个月", "精选原料"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p26", name: "节日盲盒公", price: 785.31, originalPrice: 942.37, category: "礼品", selling: ["包装精美", "适合生日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p27", name: "特产水果软", price: 119.13, originalPrice: 142.96, category: "食品", selling: ["保质期9个月", "回购率高"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p28", name: "限量装饰画", price: 994.47, originalPrice: 1193.36, category: "礼品", selling: ["设计独特", "适合节日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p29", name: "进口咖啡豆", price: 154.66, originalPrice: 185.59, category: "食品", selling: ["保质期9个月", "精选原料"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p30", name: "可爱盲盒公", price: 838.96, originalPrice: 1006.75, category: "礼品", selling: ["设计独特", "适合生日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p31", name: "传统普洱茶", price: 194.96, originalPrice: 233.95, category: "食品", selling: ["保质期3个月", "精选原料"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p32", name: "可爱盲盒公", price: 338.48, originalPrice: 406.18, category: "礼品", selling: ["设计独特", "适合纪念日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p33", name: "手工巧克力", price: 160.08, originalPrice: 192.1, category: "食品", selling: ["保质期5个月", "口感极佳"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" },
    { id: "p34", name: "简约摆件39", price: 123.05, originalPrice: 147.66, category: "礼品", selling: ["送礼首选", "适合纪念日"], icon: "🎁", gradient: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    { id: "p35", name: "进口坚果礼", price: 261.26, originalPrice: 313.51, category: "食品", selling: ["保质期5个月", "口感极佳"], icon: "🍎", gradient: "linear-gradient(135deg,#fde047,#facc15)" }
  ],
  // 新闻抓取来源（可配置）：内置平台热榜 + 运营自定义订阅源。工作台 Step1 改用此列表真实抓取。
  newsSources: BUILTIN_NEWS_SOURCES,
  // 文案效果评测体系默认配置（内联镜像自上方 BUILTIN_EVAL，与前端 src/eval/prompts.ts 同源）。
  // 工作台「文案评测台」与管理后台「评测」页都读这一份。
  eval: deepClone(BUILTIN_EVAL),
}

function deepClone(o: any) {
  return JSON.parse(JSON.stringify(o))
}

// 读时补默认：缺字段 / 非法值 → 用内置默认补齐。保证「误删某段」后仍能返回完整配置。
function backfillAdminConfig(c: any) {
  c = c && typeof c === "object" && !Array.isArray(c) ? c : {}
  const out: any = {}
  out.siteName = typeof c.siteName === "string" && c.siteName.trim() ? c.siteName : ADMIN_DEFAULTS.siteName
  out.siteDesc = typeof c.siteDesc === "string" ? c.siteDesc : ADMIN_DEFAULTS.siteDesc
  out.brandColor = typeof c.brandColor === "string" && c.brandColor.trim() ? c.brandColor : ADMIN_DEFAULTS.brandColor
  out.defaultPrompt = typeof c.defaultPrompt === "string" ? c.defaultPrompt : ADMIN_DEFAULTS.defaultPrompt
  out.maxNews = typeof c.maxNews === "number" ? c.maxNews : ADMIN_DEFAULTS.maxNews
  out.workflows =
    c.workflows && typeof c.workflows === "object" && !Array.isArray(c.workflows)
      ? c.workflows
      : deepClone(ADMIN_DEFAULTS.workflows)
  ;["getNews", "matchGoods", "createCopy"].forEach((k) => {
    const wf = out.workflows as Record<string, any>
    const def = ADMIN_DEFAULTS.workflows as Record<string, any>
    if (!wf[k] || typeof wf[k] !== "object") wf[k] = deepClone(def[k])
  })
  out.prompt = {}
  ;(["system", "template", "itemFormat"] as const).forEach((k) => {
    out.prompt[k] =
      c.prompt && typeof c.prompt[k] === "string" && c.prompt[k].trim()
        ? c.prompt[k]
        : ADMIN_DEFAULTS.prompt[k]
  })
  out.creativeStyles =
    Array.isArray(c.creativeStyles) && c.creativeStyles.length
      ? c.creativeStyles
      : deepClone(ADMIN_DEFAULTS.creativeStyles)
  out.tonePresets = Array.isArray(c.tonePresets) ? c.tonePresets : deepClone(ADMIN_DEFAULTS.tonePresets)
  out.llm = c.llm && typeof c.llm === "object" && !Array.isArray(c.llm) ? c.llm : deepClone(ADMIN_DEFAULTS.llm)
  out.matchGoods =
    c.matchGoods && typeof c.matchGoods === "object" && !Array.isArray(c.matchGoods)
      ? {
          mode: c.matchGoods.mode === "llm" ? "llm" : "coze",
          prompt:
            typeof c.matchGoods.prompt === "string" && c.matchGoods.prompt.trim()
              ? c.matchGoods.prompt
              : (ADMIN_DEFAULTS.matchGoods ? ADMIN_DEFAULTS.matchGoods.prompt : ""),
        }
      : deepClone(ADMIN_DEFAULTS.matchGoods)
  out.products =
    Array.isArray(c.products) && c.products.length ? c.products : deepClone(ADMIN_DEFAULTS.products)
  out.newsSources = backfillNewsSources(c.newsSources)
  // 评测配置：整体透传（缺省时回退内置默认）。它不进 validateAdminConfig 的必需校验，属可选增强配置。
  out.eval = c.eval && typeof c.eval === "object" && !Array.isArray(c.eval) ? c.eval : deepClone(BUILTIN_EVAL)
  return out
}

// 写入校验：关键内容为空 / 缺字段 → 拒绝写入，避免一次误操作把库清掉。
function validateAdminConfig(c: any): { ok: true } | { ok: false; error: string } {
  if (!c || typeof c !== "object" || Array.isArray(c)) return { ok: false, error: "配置文件不是合法的对象" }
  if (typeof c.siteName !== "string" || !c.siteName.trim()) return { ok: false, error: "站点名称(siteName)不能为空" }
  if (typeof c.brandColor !== "string" || !c.brandColor.trim()) return { ok: false, error: "品牌色(brandColor)不能为空" }
  if (!c.workflows || typeof c.workflows !== "object" || Array.isArray(c.workflows))
    return { ok: false, error: "工作流配置(workflows)缺失或格式错误" }
  if (!c.prompt || typeof c.prompt !== "object") return { ok: false, error: "提示词配置(prompt)缺失" }
  for (const k of ["system", "template", "itemFormat"] as const) {
    if (typeof c.prompt[k] !== "string" || !c.prompt[k].trim()) return { ok: false, error: `提示词块 prompt.${k} 不能为空` }
  }
  if (!Array.isArray(c.creativeStyles) || c.creativeStyles.length === 0)
    return { ok: false, error: "创作风格(creativeStyles)不能为空，至少需保留 1 个" }
  for (let i = 0; i < c.creativeStyles.length; i++) {
    const s = c.creativeStyles[i]
    if (!s || typeof s !== "object") return { ok: false, error: `creativeStyles[${i}] 格式错误（应为对象）` }
    if (typeof s.name !== "string" || !s.name.trim()) return { ok: false, error: `creativeStyles[${i}].name 不能为空` }
    if (typeof s.requirement !== "string" || !s.requirement.trim())
      return { ok: false, error: `creativeStyles[${i}].requirement 不能为空` }
  }
  if (!Array.isArray(c.tonePresets)) return { ok: false, error: "语调预设(tonePresets)必须是数组" }
  if (!c.llm || typeof c.llm !== "object" || Array.isArray(c.llm)) return { ok: false, error: "试运行设置(llm)缺失或格式错误" }
  if (c.matchGoods) {
    if (typeof c.matchGoods !== "object" || Array.isArray(c.matchGoods))
      return { ok: false, error: "商品匹配(matchGoods)格式错误" }
    if (c.matchGoods.mode !== "coze" && c.matchGoods.mode !== "llm")
      return { ok: false, error: "matchGoods.mode 必须为 coze 或 llm" }
    if (typeof c.matchGoods.prompt !== "string" || !c.matchGoods.prompt.trim())
      return { ok: false, error: "matchGoods.prompt 不能为空" }
  }
  return { ok: true }
}

function adminConfigRelay() {
  return {
    name: "admin-config-relay",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url || !req.url.startsWith("/api/admin-config")) {
          next()
          return
        }
        // ---- GET：读出并补默认 ----
        if (req.method === "GET") {
          try {
            let raw: string | null = null
            try {
              raw = fs.readFileSync(ADMIN_CONFIG_PATH, "utf8")
            } catch (e) {
              raw = null
            }
            let data: any = raw ? JSON.parse(raw) : {}
            const filled = backfillAdminConfig(data)
            res.statusCode = 200
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ ok: true, config: filled }))
          } catch (e: any) {
            res.statusCode = 200
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify({ ok: true, config: backfillAdminConfig({}) }))
          }
          return
        }
        // ---- POST：校验 → 备份 → 写 ----
        if (req.method === "POST") {
          let body = ""
          req.on("data", (chunk: any) => (body += chunk))
          req.on("end", () => {
            let parsed: any
            try {
              parsed = JSON.parse(body || "{}")
            } catch (e: any) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: "请求体不是合法 JSON：" + e.message }))
              return
            }
            const v = validateAdminConfig(parsed)
            if (!v.ok) {
              res.statusCode = 422
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: v.error }))
              return
            }
            try {
              if (fs.existsSync(ADMIN_CONFIG_PATH)) {
                fs.copyFileSync(ADMIN_CONFIG_PATH, ADMIN_CONFIG_BACKUP)
              }
              fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(parsed, null, 2), "utf8")
              res.statusCode = 200
              res.setHeader("Content-Type", "application/json")
              res.end(
                JSON.stringify({ ok: true, target: "server", backup: "server-config.backup.json" }),
              )
            } catch (e: any) {
              res.statusCode = 500
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: "写入服务端失败：" + e.message }))
            }
          })
          return
        }
        res.statusCode = 405
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ error: { type: "method_not_allowed", message: "仅支持 GET / POST" } }))
      })
    },
  }
}

/* ============================================================
 * 新闻抓取来源：可配置、真实抓取（替代写死在 Coze 工作流里）
 *   - /api/news      聚合所有「已启用」来源 → 新闻列表（工作台 Step1 调用）
 *   - /api/news-test 逐源真实抓取一次 → 诊断（成功/失败/条数/耗时/原因）
 * 解析支持：rss / json(自定义路径) / weibo / toutiao / bilibili / zhihu / baidu
 * ============================================================ */

const NEWS_KINDS = ["rss", "json", "weibo", "toutiao", "bilibili", "zhihu", "baidu"]

function normalizeNewsSource(s: any): any {
  if (!s || typeof s !== "object") return null
  const id = typeof s.id === "string" && s.id.trim() ? s.id : "src-" + Math.random().toString(36).slice(2, 8)
  const kind = NEWS_KINDS.indexOf(s.kind) >= 0 ? s.kind : "rss"
  return {
    id,
    name: String(s.name || "未命名来源"),
    url: String(s.url || ""),
    kind,
    enabled: s.enabled !== false,
    builtin: !!s.builtin,
    jsonItemsPath: typeof s.jsonItemsPath === "string" ? s.jsonItemsPath : "",
    jsonTitlePath: typeof s.jsonTitlePath === "string" ? s.jsonTitlePath : "title",
    jsonBriefPath: typeof s.jsonBriefPath === "string" ? s.jsonBriefPath : "summary",
    jsonUrlPath: typeof s.jsonUrlPath === "string" ? s.jsonUrlPath : "url",
  }
}

function backfillNewsSources(arr: any): any[] {
  if (!Array.isArray(arr)) return deepClone(BUILTIN_NEWS_SOURCES)
  const norm = arr.map(normalizeNewsSource).filter(Boolean)
  return norm.length ? norm : deepClone(BUILTIN_NEWS_SOURCES)
}

/** 服务端读取：直接读 server-config.json 并补默认（与 /api/admin-config 同一套 backfill） */
function loadNewsSourcesServer(): any[] {
  let raw: string | null = null
  try {
    raw = fs.readFileSync(ADMIN_CONFIG_PATH, "utf8")
  } catch {
    raw = null
  }
  let data: any = {}
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = {}
    }
  }
  return backfillNewsSources(data.newsSources)
}

function getPath(obj: any, p: string): any {
  if (!p) return obj
  return p.split(".").reduce((o: any, k: string) => (o && typeof o === "object" ? o[k] : undefined), obj)
}
function strOf(v: any): string {
  return v == null ? "" : String(v)
}

/** 抓取错误 → 中文友好原因 */
function categorizeNewsError(e: any, ms: number): string {
  const name = e && e.name
  const msg = (e && e.message) || String(e)
  if (name === "AbortError") return `请求超时（${ms}ms 内无响应，对方可能太慢或网络不通）`
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|getaddrinfo|ECONNRESET|ETIMEDOUT|ENETUNREACH/i.test(msg))
    return "地址无法访问（域名解析失败、连接被拒绝或网络中断）"
  if (e && typeof e.status === "number") {
    if (e.status === 401 || e.status === 403) return `对方拒绝访问（HTTP ${e.status}，可能需要鉴权或触发了反爬限制）`
    if (e.status >= 400 && e.status < 500) return `对方拒绝（HTTP ${e.status} 客户端错误）`
    if (e.status >= 500) return `对方服务器错误（HTTP ${e.status}）`
  }
  if (/JSON|parse|Unexpected|SyntaxError|CDATA|tag|entity/i.test(msg)) return "数据解析失败：" + msg.slice(0, 60)
  return "抓取失败：" + msg.slice(0, 80)
}

/** RSS / Atom 解析（容忍 CDATA 与内部标签） */
function parseRss(text: string): Array<{ title: string; url: string; summary: string }> {
  const items: Array<{ title: string; url: string; summary: string }> = []
  const blocks = text.match(/<item[\s\S]*?<\/item>/gi) || text.match(/<entry[\s\S]*?<\/entry>/gi) || []
  for (const b of blocks) {
    const title = pickTag(b, "title")
    const link = pickLink(b)
    const desc = pickTag(b, "description") || pickTag(b, "summary") || pickTag(b, "content")
    if (title) items.push({ title: cleanXml(title), url: link, summary: cleanXml(desc) })
  }
  return items
}
function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))
  if (!m) return ""
  let v = m[1]
  v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  v = v.replace(/<[^>]+>/g, "")
  return v.trim()
}
function pickLink(block: string): string {
  const m1 = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)
  if (m1 && m1[1].trim()) return m1[1].trim()
  const m2 = block.match(/<link[^>]*href="([^"]+)"/i)
  if (m2) return m2[2]
  return ""
}
function cleanXml(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function parseJsonSource(src: any, text: string): Array<{ title: string; url: string; summary: string }> {
  const data = JSON.parse(text)
  let arr: any = getPath(data, src.jsonItemsPath)
  if (!Array.isArray(arr)) {
    if (Array.isArray(data)) arr = data
    else throw new Error(`未找到数组（jsonItemsPath=${src.jsonItemsPath || "（空，期望根数组）"}）`)
  }
  return arr
    .map((it: any) => ({
      title: strOf(getPath(it, src.jsonTitlePath)),
      url: strOf(getPath(it, src.jsonUrlPath)),
      summary: strOf(getPath(it, src.jsonBriefPath)),
    }))
    .filter((x: any) => x.title)
}

/** 内置平台专属解析 */
function parsePlatform(kind: string, text: string): Array<{ title: string; url: string; summary: string; heat?: number }> {
  const d = JSON.parse(text)
  if (kind === "weibo") {
    const list = (d && d.data && d.data.realtime) || []
    return list
      .map((it: any) => ({ title: it.word, url: "https://s.weibo.com/weibo?q=" + encodeURIComponent(it.word || ""), summary: it.label || "", heat: numOf(it.raw_hot != null ? it.raw_hot : it.num) }))
      .filter((x: any) => x.title)
  }
  if (kind === "toutiao") {
    const list = (d && d.data) || []
    return list
      .map((it: any) => ({ title: it.Title, url: it.Url || "https://www.toutiao.com/item/" + (it.ClusterId || ""), summary: it.Abstract || "", heat: numOf(it.HotValue) }))
      .filter((x: any) => x.title)
  }
  if (kind === "bilibili") {
    const list = (d && d.data && d.data.list) || []
    return list
      .map((it: any) => ({ title: it.title, url: "https://www.bilibili.com/video/" + (it.bvid || ""), summary: it.desc || "", heat: numOf(it.stat && it.stat.view) }))
      .filter((x: any) => x.title)
  }
  if (kind === "zhihu") {
    const list = (d && d.data) || []
    return list
      .map((it: any) => {
        const t = it.target || it
        return { title: t.title, url: t.url || "", summary: t.excerpt || "" }
      })
      .filter((x: any) => x.title)
  }
  if (kind === "baidu") {
    // 百度热榜返回 HTML，做尽力而为的标题抽取（演示用，可能 0 条）
    const titles = (text.match(/<a[^>]+class="[^"]*hot[^"]*"[^>]*>([^<]{2,40})<\/a>/gi) || [])
      .map((m: string) => (m.replace(/<[^>]+>/g, "").trim()))
      .filter((t: string) => t && !/^\d+$/.test(t))
    return titles.slice(0, 20).map((t: string) => ({ title: t, url: "", summary: "" }))
  }
  return []
}
function numOf(v: any): number | undefined {
  const n = Number(v)
  return isFinite(n) ? n : undefined
}

function parseSource(src: any, text: string): Array<{ title: string; url: string; summary: string; heat?: number }> {
  if (src.kind === "rss") return parseRss(text)
  if (src.kind === "json") return parseJsonSource(src, text)
  return parsePlatform(src.kind, text)
}

function classifyNewsCategory(t: string): string {
  const map: Array<[RegExp, string]> = [
    [/游戏|黑神话|steam|ps5|xbox|主机|电竞|原神/i, "游戏"],
    [/华为|苹果|小米|手机|芯片|人工智能|科技|发布|鸿蒙|特斯拉|电动车|量子|大模型/i, "科技"],
    [/高温|降温|空调|暴雨|台风|天气|寒潮|暴雪|清凉|地震|洪水/i, "生活"],
    [/明星|电影|电视剧|综艺|演唱会|票房|演员|导演|官宣|塌房/i, "娱乐"],
    [/消费|电商|直播|双11|618|购物车|销量|市场|双十一/i, "消费"],
    [/体育|世界杯|奥运|球赛|夺冠|联赛|马拉松|足球|篮球/i, "体育"],
    [/教育|高考|考研|考试|大学|学校|留学|录取/i, "教育"],
    [/股票|基金|理财|投资|房价|经济|gdp|通胀|汇率/i, "财经"],
  ]
  for (const [re, c] of map) if (re.test(t)) return c
  return "热点"
}
function extractNewsKeywords(t: string): string[] {
  const m = t.match(/[一-龥]{2,}|[A-Za-z]{2,}/g) || []
  return Array.from(new Set(m)).slice(0, 8)
}

function toNewsItem(src: any, it: any, i: number): any {
  return {
    id: src.id + "-" + i + "-" + Date.now().toString(36),
    title: String(it.title || "").trim(),
    summary: String(it.summary || "").trim(),
    source: src.name,
    url: String(it.url || ""),
    time: "刚刚",
    heat: typeof it.heat === "number" ? it.heat : Math.max(5, 100 - i * 3),
    category: classifyNewsCategory(String(it.title || "")),
    keywords: extractNewsKeywords(String(it.title || "")),
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.name = "HttpError"
    this.status = status
  }
}

async function fetchNewsSource(src: any, timeoutMs = 8000): Promise<{ ok: boolean; count?: number; items?: any[]; ms: number; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, application/xml, text/xml, text/html, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    })
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`)
    const text = await res.text()
    // 提前判定：返回的是网页/错误页（如 Vite 的 SPA 兜底、服务器 404 页、反爬拦截页）
    // 而非结构化订阅源 → 直接判定失败，避免「200 + 空 HTML」被误判为成功。
    const looksHtml = /^\s*<!DOCTYPE|<html[\s>]|<head[\s>]|<body[\s>]/i.test(text)
    if (looksHtml) {
      return { ok: false, count: 0, ms: Date.now() - start, error: "返回内容不是有效的订阅源（疑似网页或错误页），请检查地址是否正确" }
    }
    const items = parseSource(src, text)
    if (items.length === 0) {
      return { ok: false, count: 0, ms: Date.now() - start, error: "未解析到任何条目，可能地址暂无可抓取内容或字段路径不匹配" }
    }
    return { ok: true, count: items.length, items, ms: Date.now() - start }
  } catch (e: any) {
    return { ok: false, ms: Date.now() - start, error: categorizeNewsError(e, Date.now() - start) }
  } finally {
    clearTimeout(timer)
  }
}

function newsRelay() {
  return {
    name: "news-relay",
    configureServer(server: any) {
      // 挂在根，按 URL 前缀分支（Connect 的 use(path) 按路径段匹配，/api/news-test 不会命中 /api/news 挂载点）
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const rawUrl = req.url || ""
        if (!rawUrl.startsWith("/api/news")) return next()
        const path = rawUrl.split("?")[0]
        // 统一的响应助手
        const send = (code: number, obj: any) => {
          res.statusCode = code
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify(obj))
        }
        try {
          if (path === "/api/news-test") {
            const sources = loadNewsSourcesServer().filter((s) => s.enabled)
            const results: any[] = []
            await Promise.all(
              sources.map(async (s) => {
                const r = await fetchNewsSource(s, 8000)
                results.push({
                  id: s.id,
                  name: s.name,
                  url: s.url,
                  kind: s.kind,
                  ok: r.ok,
                  count: r.ok ? r.count : 0,
                  ms: r.ms,
                  error: r.ok ? null : r.error,
                })
              })
            )
            send(200, { ok: true, total: sources.length, results })
            return
          }
          if (path === "/api/news") {
            const sources = loadNewsSourcesServer().filter((s) => s.enabled)
            const all: any[] = []
            const perSource: any[] = []
            await Promise.all(
              sources.map(async (s) => {
                const r = await fetchNewsSource(s, 8000)
                if (r.ok && r.items) {
                  const items = r.items.slice(0, 12).map((it, i) => toNewsItem(s, it, i))
                  all.push(...items)
                  perSource.push({ id: s.id, name: s.name, count: items.length })
                } else {
                  perSource.push({ id: s.id, name: s.name, count: 0, error: r.error || "抓取失败" })
                }
              })
            )
            all.sort((a, b) => (b.heat || 0) - (a.heat || 0))
            send(200, { ok: true, news: all, sources: perSource, fetchedAt: Date.now() })
            return
          }
          next()
        } catch (e: any) {
          send(500, { ok: false, error: String(e && e.message ? e.message : e) })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), llmRelay(), cozeTrialRelay(), adminConfigRelay(), newsRelay()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 浏览器请求同源的 /api/coze，由 Vite 开发服务器转发到 Coze 并注入鉴权头，
      // 既避免 token 暴露在前端，也规避浏览器跨域(CORS)限制。
      "/api/coze": {
        target: "https://api.coze.cn",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/coze/, "/v1/workflow/run"),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Authorization", `Bearer ${COZE_TOKEN}`)
            proxyReq.setHeader("Content-Type", "application/json")
          })
        },
      },
    },
  },
})
