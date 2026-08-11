/* ============================================================
   运营后台 —— 原生 JS（classic script，无构建、无第三方库）
   两个公共约定（每个后台页面都遵守）：
   1) 配置三级读取：服务端 → 本机浏览器 → 内置默认，拿得到哪级用哪级
   2) 顶栏徽章明确告诉用户当前生效的是哪一级
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  var LS_KEY = 'hg_admin_config_v1';
  var LS_LLM_KEY = 'hg_admin_llm_v1';
  var SERVER_URL = './server-config.json';
  var WORKBENCH_URL = 'http://localhost:5173/';
  // 是否由 HTTP 提供（经 vite dev server）：是 → 可写服务端；否（file://）→ 只能写本机
  var isHttp = (location.protocol || '').indexOf('http') === 0;

  /* 内置默认（第三级）：与工作台当前行为对齐 */
  var BUILTIN_DEFAULTS = {
    siteName: '热点营销运营后台',
    siteDesc: '电商热点营销工作台的运营配置中心',
    brandColor: '#7c3aed',
    defaultPrompt: '语气有网感，突出商品卖点，加入互动与福利钩子。',
    maxNews: 10,
    workflows: {
      getNews:    { id: '<COZE_WORKFLOW_ID>', label: '抓取新闻热点' },
      matchGoods: { id: '<COZE_WORKFLOW_ID>', label: '匹配商品' },
      createCopy: { id: '<COZE_WORKFLOW_ID>', label: '生成营销文案' }
    },
    /* 下发给模型（Coze createCopy 的 user_prompt）的指令与模板——运营在后台可调，无需改代码 */
    prompt: {
      system:
'你是一位资深的微博营销文案专家，擅长把热点新闻与商品结合，产出高转化率的微博文案。\n' +
'\n' +
'# 任务\n' +
'基于下方【素材】中的新闻热点、商品信息与【创作要求】，创作 1 条营销文案。\n' +
'\n' +
'# 写作规范\n' +
'1. 仅输出 1 个完整版本，严格遵循【创作要求】中的“主打语调”和“创作风格 / 风格要求”，不要拆分成多个版本，也不要使用任何分隔符或编号。\n' +
'2. 严禁任何前缀、编号或分隔标记（如“版本1：”、“A:”、“---”、“【】”等等）。\n' +
'3. 严禁开场白、解释、注释，以及用 markdown 代码块包裹。\n' +
'4. 单个版本 100-200 字，语气符合微博调性（有网感、有梗、emoji 自然）。\n' +
'5. 至少包含 1 个 # 话题标签。\n' +
'6. 末尾必须带互动提问或限时福利钩子。\n' +
'7. 【商品边界·硬约束】严禁在文案中提及【商品清单】以外的产品。只能使用清单中明确列出的商品名、价格、卖点；不允许添加、替换、联想或推荐同类其他商品。文案中提及的商品数量必须与【商品清单】保持一致。',
      template:
'【新闻热点】\n' +
'标题：{{hotspot_title}}\n' +
'摘要：{{hotspot_summary}}\n' +
'话题标签：{{topic_tags}}\n' +
'\n' +
'【商品清单】\n' +
'{{product_list}}\n' +
'\n' +
'【创作要求】\n' +
'主打语调：{{tone}}\n' +
'创作风格：{{style_name}} —— {{style_requirement}}',
      itemFormat:
'- 商品：{{product_name}}｜价格：¥{{product_price}}｜分类：{{product_category}}｜卖点：{{product_selling}}'
    },
    /* 创作风格：每个风格独立跑一次 createCopy，产出 1 个候选版本；至少保留 1 个（删到 0 会被拦住） */
    creativeStyles: [
      { name: '热点借势', requirement: '先接住热点情绪再自然过渡到商品，重体验感。' },
      { name: '促销导向', requirement: '突出价格钩子和紧迫感，重转化。' }
    ],
    /* 语调预设：工作台「主打语调」下拉的可选项；选中后作为素材的一部分传给模型 */
    tonePresets: ['热点借势', '促销导向', '互动话题'],
    /* 大模型接入设置：供 matchGoods=llm 模式与「试运行」使用。
       apiKey 不再预填真实密钥（避免泄漏到前端包 / git 历史）；真实密钥可在后台「模型接入」填写
       （存本机 localStorage），或由 dev 服务器从本机 .env 的 AIGW_API_KEY 兜底。 */
    llm: {
      simulate: false,
      baseURL: 'https://aigw.yuexiuproperty.cn/v1',
      model: 'deepseek-v4-flash',
      apiKey: ''
    },
    /* 商品匹配（matchGoods）配置：可切换「Coze 工作流」或「大模型」两种模式。
       大模型模式下本 prompt 由 {{title}}/{{brief}} 填充后发给 LLM，产出商品关键词 → 前端在商品库里检索推荐。 */
    matchGoods: {
      mode: 'coze',
      prompt:
'# 角色：商品匹配师\n' +
'你是一名专业的电商商品匹配师，擅长从热点新闻中识别出用户可能产生的消费需求，并将其转化为可在商品库中检索的关键词。\n' +
'\n' +
'# 目标\n' +
'阅读新闻，判断这条新闻会让读者联想到哪些"值得购买的商品"，并输出一组用于检索商品库的关键词。\n' +
'\n' +
'# 输入\n' +
'- 新闻标题：{{title}}\n' +
'- 新闻内容：{{brief}}\n' +
'\n' +
'# 技能\n' +
'1. 提取新闻中的显性消费信号（如降温→保暖衣物、情人节→礼物、高考→文具/电子产品）。\n' +
'2. 推断新闻背后的隐性需求（如极端天气→家居应急、节日→馈赠、健康话题→食品/保健）。\n' +
'3. 把需求翻译成"商品名 / 品类 / 卖点"形式的简练关键词。\n' +
'\n' +
'# 工作流\n' +
'1. 阅读新闻标题《{{title}}》与内容：{{brief}}\n' +
'2. 列出这条新闻可能带动的 3~8 个商品方向，优先贴近真实在售品类。\n' +
'3. 将每个方向压缩为 1~4 个字的检索关键词（名词为主，可含品类或核心卖点）。\n' +
'\n' +
'# 输出格式\n' +
'仅输出一行关键词，用中文逗号（，）或顿号（、）分隔，例如：保暖衣物，礼物，坚果，咖啡\n' +
'不要输出编号、解释、Markdown 或任何额外文字。\n' +
'\n' +
'# 库内主要品类（供你偏向，提高命中率）\n' +
'食品、礼品、食品饮料、数码配件、游戏外设、手机配件、清凉家电、服饰配饰、骑行装备、智能硬件、旅行用品\n' +
'\n' +
'# 限制\n' +
'- 只输出商品关键词，不要涉及其他内容。\n' +
'- 关键词需要简练，不要多余的形容词与修饰语。\n' +
'- 优先输出能在商品库中被检索到的品类或商品名。\n' +
'- 如果确实对应不出任何商品，则只输出：没有对应内容'
    },
    // 商品库（运营可维护的单一数据源）。icon=emoji 表情、gradient=CSS 背景渐变；
    // 工作台与后台商品卡统一用这两个字段渲染，保证视觉一致。作为三级读取的默认兜底。
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
    newsSources: [
      { id: 'src-weibo', name: '微博热搜', url: 'https://weibo.com/ajax/side/hotSearch', kind: 'weibo', enabled: true, builtin: true },
      { id: 'src-toutiao', name: '今日头条热榜', url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', kind: 'toutiao', enabled: true, builtin: true },
      { id: 'src-bilibili', name: 'B站热门', url: 'https://api.bilibili.com/x/web-interface/popular?ps=20', kind: 'bilibili', enabled: true, builtin: true },
      { id: 'src-zhihu', name: '知乎热榜', url: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20', kind: 'zhihu', enabled: true, builtin: true },
      { id: 'src-baidu', name: '百度热点', url: 'https://top.baidu.com/board?tab=realtime', kind: 'baidu', enabled: true, builtin: true }
    ],
    /* 文案效果评测体系默认配置：与工作台 src/eval/prompts.ts 的 BUILTIN_EVAL 同源（此处为后台「恢复默认」与 file:// 兜底用副本）。 */
    eval: {
      enabledReview: true,
      weightsMachine: 0.5,
      lengthMin: 100,
      lengthMax: 200,
      emojiMin: 0,
      emojiMax: 4,
      hashtagCountMax: 6,
      bannedWords: [
        '最佳','最好','最低','第一','国家级','顶级','绝对','永久','百分百','100%','全网最低','唯一','首选','冠军','领导品牌',
        '完美','万能','极致','史无前例','空前','绝无仅有','王牌','销量第一','独家','最低价','底价','零风险','最','永久免费',
        '免单','点击有惊喜','立即下载','秒杀'
      ].join('\n'),
      reviewPrompt:
'你是一位严格的微博营销文案评审专家。下面给你一条待评审的文案，以及它的素材（热点 + 商品）。\n\n' +
'请只输出一个 JSON 对象（不要任何额外文字、不要代码块包裹），结构如下：\n' +
'{\n' +
'  "relevance": 1,        // 热点关联度：1=生硬拼接，5=真借上了这个热点\n' +
'  "materialFidelity": 1, // 素材还原度：1=卖点/价格瞎编，5=用得准、无编造\n' +
'  "appeal": 1,           // 传播吸引力：1=没钩子没网感，5=让人想点开\n' +
'  "naturalness": 1,      // 语气自然度：1=一股机器味，5=像真人在发微博\n' +
'  "comment": "一句话总评"\n' +
'}\n\n' +
'评分要求：稳定、严格，不要人情分。维度之间允许有差距。',
      reworkPrompt:
'你是一位严谨的文案校对员。下面给你一条「没通过的文案」和「具体没过的原因清单」。\n\n' +
'请严格按清单修改，只输出修正后的完整文案（不要解释、不要前缀、不要代码块）：\n' +
'- 违禁词：必须删掉或换成合规表述，绝不能再出现清单里点名的违禁词。\n' +
'- 编造价格：素材里没给的价格/折扣/销量一律删除或替换为素材真实金额；只能原样使用素材给出数字。\n' +
'- 字数：写完自己数一遍，超了就删（宁可少写一个卖点也不能超上限）；不够则在不违规前提下补一句。\n' +
'- 话题标签：补齐素材指定的标签，且总标签数不要过多。\n' +
'- 互动引导：结尾补一个互动提问或限时福利钩子。\n' +
'- 残留符号：去掉反引号、Markdown 标题/分隔线、【】括号等残留排版符号。\n\n' +
'其余合规的部分原样保留，不要擅改语气和卖点。',
      reworkMaxRounds: 3,
      concurrency: 3,
      repeats: 1,
      unitPrice: 0.01,
      model: '',
      reviewTemp: 0.2,
      reworkTemp: 0.2,
      simulate: false
    }
  };

  /* ---------------- 状态 ---------------- */
  var state = { config: null, source: null, working: null, savedSnapshot: null };

  /* ---------------- 工具 ---------------- */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sourceText(s) {
    return ({ server: '服务端', local: '本机浏览器', default: '内置默认' })[s] || '未知';
  }
  // 统一化单个新闻来源对象（写库 / 归一化共用），非法对象返回 null
  function normalizeNewsSource(s) {
    if (!s || typeof s !== 'object') return null;
    var id = (typeof s.id === 'string' && s.id.trim()) ? s.id : ('src-' + Math.random().toString(36).slice(2, 8));
    var kinds = ['rss', 'json', 'weibo', 'toutiao', 'bilibili', 'zhihu', 'baidu'];
    var kind = kinds.indexOf(s.kind) >= 0 ? s.kind : 'rss';
    return {
      id: id,
      name: String(s.name || '未命名来源'),
      url: String(s.url || ''),
      kind: kind,
      enabled: s.enabled !== false,
      builtin: !!s.builtin,
      jsonItemsPath: typeof s.jsonItemsPath === 'string' ? s.jsonItemsPath : '',
      jsonTitlePath: typeof s.jsonTitlePath === 'string' ? s.jsonTitlePath : 'title',
      jsonBriefPath: typeof s.jsonBriefPath === 'string' ? s.jsonBriefPath : 'summary',
      jsonUrlPath: typeof s.jsonUrlPath === 'string' ? s.jsonUrlPath : 'url'
    };
  }

  var ICON = {
    general: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><circle cx="9" cy="8" r="2.4" fill="#fff"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="16" r="2.4" fill="#fff"/></svg>',
    workflows: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M6 8.4 L12 15.6 M18 8.4 L12 15.6"/></svg>',
    datasource: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6 v6 c0 1.7 3.1 3 7 3 s7 -1.3 7 -3 V6"/><path d="M5 12 v6 c0 1.7 3.1 3 7 3 s7 -1.3 7 -3 v-6"/></svg>',
    dot: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>',
    pencil: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    products: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    match: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>',
    news: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/><path d="M9 19a6 6 0 0 1 6-6"/></svg>',
    eval: '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>'
  };

  /* ---------------- 商品库（只读预览）：图标 / 卡片 / 表格 / 统计 ---------------- */
  // 与工作台 Thumb.tsx 的 productToVariant 完全一致：按品类映射 颜色(variant) + Lucide 图标
  var VARIANT_HEX = {
    rose: '#f43f5e', blue: '#3b82f6', amber: '#f59e0b',
    violet: '#8b5cf6', emerald: '#10b981', indigo: '#6366f1', slate: '#64748b'
  };
  // 各 variant 对应的 Lucide 图标内部 SVG（与 node_modules/lucide-react 同源，保证视觉一致）
  var PRODUCT_ICON_SVG = {
    cpu:
      '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/>' +
      '<path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/>' +
      '<path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/>' +
      '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    'shopping-bag':
      '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/>' +
      '<path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    plane:
      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    'shopping-cart':
      '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>' +
      '<path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    sparkles:
      '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>' +
      '<path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>'
  };
  function productToVariant(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('家电') >= 0 || c.indexOf('数码') >= 0) return { variant: 'blue', icon: 'cpu' };
    if (c.indexOf('服饰') >= 0 || c.indexOf('穿戴') >= 0) return { variant: 'violet', icon: 'shopping-bag' };
    if (c.indexOf('食品') >= 0 || c.indexOf('饮') >= 0) return { variant: 'amber', icon: 'thermometer' };
    if (c.indexOf('户外') >= 0 || c.indexOf('运动') >= 0) return { variant: 'emerald', icon: 'plane' };
    if (c.indexOf('家居') >= 0 || c.indexOf('生活') >= 0) return { variant: 'rose', icon: 'shopping-cart' };
    if (c.indexOf('美妆') >= 0 || c.indexOf('护肤') >= 0) return { variant: 'violet', icon: 'sparkles' };
    return { variant: 'indigo', icon: 'shopping-bag' };
  }
  function productIconSVG(iconKey, px) {
    var inner = PRODUCT_ICON_SVG[iconKey] || PRODUCT_ICON_SVG['shopping-bag'];
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  function fmtPrice(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return String(parseFloat(n.toFixed(2)));
  }
  // 商品卡（卡片视图）：与工作台 Step2Suggest 的商品卡视觉一致
  // 渲染优先级：商品自身存储的 icon(emoji) + gradient(CSS) > 按品类推导
  function productCardHTML(p) {
    var bg = p.gradient || 'linear-gradient(to bottom right,#f9fafb,#f3f4f6)';
    var iconChar = p.icon || '🛍️';
    var thumb = '<div class="prod-thumb" style="background:' + bg + '">' + esc(iconChar) + '</div>';
    var selling = (p.selling || []).slice(0, 3).map(function (s) {
      return '<span class="prod-tag">✦ ' + esc(s) + '</span>';
    }).join('');
    return '<div class="prod-card">' +
      '<div class="prod-card-head" style="background:' + bg + '">' +
        '<label class="prod-sel-wrap" title="选择该商品"><input type="checkbox" class="prod-sel" data-pid="' + esc(p.id) + '"' + (isSel(p.id) ? ' checked' : '') + '></label>' +
        '<div class="prod-badge">' + esc(p.category || '未分类') + '</div>' +
        '<div class="prod-icon-wrap">' + thumb + '</div>' +
        '<div class="prod-card-actions">' +
          '<button type="button" class="prod-edit-btn" data-action="prod-edit" data-id="' + esc(p.id) + '" title="编辑">✎</button>' +
          '<button type="button" class="prod-del-btn" data-action="prod-del" data-id="' + esc(p.id) + '" title="删除">🗑</button>' +
        '</div>' +
      '</div>' +
      '<div class="prod-card-body">' +
        '<div class="prod-meta">' + ((p.selling || []).length) + ' 项亮点</div>' +
        '<div class="prod-name">' + esc(p.name || '') + '</div>' +
        '<div class="prod-price">' +
          '<span class="prod-now">¥' + fmtPrice(p.price) + '</span>' +
          '<span class="prod-was">¥' + fmtPrice(p.originalPrice) + '</span>' +
        '</div>' +
        '<div class="prod-tags">' + (selling || '') + '</div>' +
      '</div>' +
    '</div>';
  }
  function productTableHTML(list) {
    var rows = list.map(function (p) {
      var bg = p.gradient || 'linear-gradient(to bottom right,#f9fafb,#f3f4f6)';
      var iconChar = p.icon || '🛍️';
      var thumb = '<span class="tbl-thumb" style="background:' + bg + '">' + esc(iconChar) + '</span>';
      var discount = (p.originalPrice > p.price)
        ? Math.round((p.originalPrice - p.price) / p.originalPrice * 100) + '%'
        : '—';
      var selling = (p.selling || []).map(function (s) { return esc(s); }).join('、');
      return '<tr' + (isSel(p.id) ? ' class="row-sel"' : '') + '>' +
        '<td class="col-sel"><input type="checkbox" class="prod-sel" data-pid="' + esc(p.id) + '"' + (isSel(p.id) ? ' checked' : '') + '></td>' +
        '<td class="tbl-name">' + thumb + '<span>' + esc(p.name || '') + '</span></td>' +
        '<td>' + esc(p.category || '') + '</td>' +
        '<td class="num">¥' + fmtPrice(p.price) + '</td>' +
        '<td class="num was">¥' + fmtPrice(p.originalPrice) + '</td>' +
        '<td class="num off">' + discount + '</td>' +
        '<td class="tbl-selling">' + selling + '</td>' +
        '<td class="num">' +
          '<button type="button" class="tbl-act" data-action="prod-edit" data-id="' + esc(p.id) + '" title="编辑">✎</button>' +
          '<button type="button" class="tbl-act danger" data-action="prod-del" data-id="' + esc(p.id) + '" title="删除">🗑</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    return '<table class="prod-table"><thead><tr>' +
      '<th class="col-sel"><input type="checkbox" id="prod-selall" title="全选当前筛选结果"></th>' +
      '<th>商品</th><th>品类</th><th class="num">价格</th><th class="num">划线价</th><th class="num">折扣率</th><th>卖点</th><th class="num">操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function statCard(label, num) {
    return '<div class="stat-card"><div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-num">' + esc(num) + '</div></div>';
  }
  function productStatsHTML(list) {
    var total = list.length;
    var cats = {}, prices = [], discSum = 0, discN = 0;
    list.forEach(function (p) {
      if (p.category) cats[p.category] = 1;
      if (typeof p.price === 'number') prices.push(p.price);
      if (p.originalPrice > p.price) { discSum += (p.originalPrice - p.price) / p.originalPrice; discN++; }
    });
    var catCount = Object.keys(cats).length;
    var priceText = '—';
    if (prices.length === 1) priceText = '¥' + fmtPrice(prices[0]);
    else if (prices.length > 1) priceText = '¥' + fmtPrice(Math.min.apply(null, prices)) + ' – ¥' + fmtPrice(Math.max.apply(null, prices));
    var avgDisc = discN ? (discSum / discN * 100).toFixed(1) + '%' : '—';
    return '<div class="stat-grid">' +
      statCard('商品总数', total) +
      statCard('品类数', catCount) +
      statCard('价格区间', priceText) +
      statCard('平均折扣率', avgDisc) +
    '</div>';
  }

  /* ---------------- 热点引用检查：商品被哪些热点推荐（用于删除前风险提示） ---------------- */
  // 热点池：与工作台新闻流（src/data/mock.ts 的 mockNews）同源思路——运营在后台删除商品前，
  // 需要让运营知道「这件商品被哪些热点推荐过」。这里维护一份覆盖主要品类的热点关键词池，
  // 与工作台本地推荐算法 getMatchScores 使用同一套「关键词重叠」判定（nk.includes(kw) || kw.includes(nk)）。
  // 若工作台后续接入真实热点，应保持此热点池与之一致（本文件内维护，file:// 也能用）。
  var BUILTIN_HOTSPOTS = [
    { id: 'h-game',    title: '《黑神话：悟空》国产3A里程碑',        keywords: ['黑神话悟空', '游戏', '国产3A', 'steam'] },
    { id: 'h-phone',   title: '华为 Mate 70 系列发布',               keywords: ['华为', '手机', 'iphone', '数码', '平板'] },
    { id: 'h-cool',    title: '多地气温突破40°C 清凉家电热销',       keywords: ['高温', '空调', '清凉家电', '风扇', '制冰'] },
    { id: 'h-ent',     title: '《繁花》续集官宣',                    keywords: ['繁花', '胡歌', '电视剧', '电影'] },
    { id: 'h-ride',    title: '骑行热潮 城市骑行装备破千亿',         keywords: ['骑行', '户外', '运动', '装备'] },
    { id: 'h-ai',      title: 'AI 陪伴机器人走红',                   keywords: ['AI', '大模型', '机器人', '智能'] },
    { id: 'h-travel',  title: '中秋国庆连休 旅游搜索暴涨',           keywords: ['旅游', '机票', '中秋', '国庆', '出行'] },
    { id: 'h-tea',     title: '全球精品咖啡豆风味盘点',              keywords: ['新茶饮', '奶茶', '咖啡', '咖啡豆', '精品咖啡', '食品'] },
    { id: 'h-beauty',  title: '美妆护肤消费新趋势',                  keywords: ['美妆', '护肤', '化妆品', '面膜'] },
    { id: 'h-fashion', title: '秋冬穿搭潮流',                        keywords: ['穿搭', '服饰', '潮流', '时尚'] },
    { id: 'h-home',    title: '家居收纳与生活好物',                  keywords: ['家居', '生活', '收纳', '家电'] },
    { id: 'h-baby',    title: '母婴育儿好物推荐',                    keywords: ['母婴', '宝宝', '育儿'] }
  ];
  // 与工作台 products.ts 的 deriveMatchKeywords 完全一致：匹配词 = [品类, ...卖点]
  function productMatchKeywords(p) {
    return [p.category || ''].concat((p.selling || []).slice()).map(function (s) { return (s || '').trim(); }).filter(Boolean);
  }
  // 返回该商品被多少条热点引用（关键词重叠），以及这些热点的标题
  function countHotspotRefs(p) {
    var kws = productMatchKeywords(p);
    var refs = [];
    BUILTIN_HOTSPOTS.forEach(function (h) {
      var hit = kws.some(function (kw) {
        return h.keywords.some(function (nk) { return nk.indexOf(kw) >= 0 || kw.indexOf(nk) >= 0; });
      });
      if (hit) refs.push(h.title);
    });
    return { count: refs.length, refs: refs };
  }

  function distinctCategories(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (p) {
      if (p.category && !seen[p.category]) { seen[p.category] = 1; out.push(p.category); }
    });
    out.sort();
    return out;
  }
  function productToolbarHTML() {
    var cats = distinctCategories(state.working.products);
    var catOpts = '<option value="">全部品类</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    return '<div class="prod-toolbar">' +
      '<div class="prod-search">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
        '<input id="prod-search" type="text" placeholder="搜索商品名称或卖点">' +
      '</div>' +
      '<select id="prod-cat">' + catOpts + '</select>' +
      '<select id="prod-sort">' +
        '<option value="default">默认排序</option>' +
        '<option value="price-asc">价格升序</option>' +
        '<option value="price-desc">价格降序</option>' +
        '<option value="category">按品类</option>' +
      '</select>' +
      '<div class="view-toggle">' +
        '<button type="button" id="prod-view-card" data-view="card" class="active">卡片</button>' +
        '<button type="button" id="prod-view-table" data-view="table">表格</button>' +
      '</div>' +
      '<div class="prod-io">' +
        '<button type="button" id="btn-exp-json" class="btn-ghost" title="导出结构化 JSON（适合备份与迁移）">导出JSON</button>' +
        '<button type="button" id="btn-exp-csv" class="btn-ghost" title="导出表格 CSV（适合用表格软件批量编辑）">导出表格</button>' +
        '<button type="button" id="btn-imp" class="btn-ghost" title="导入 JSON 或 CSV 文件">导入</button>' +
        '<input type="file" id="imp-file" accept=".json,.csv,application/json,text/csv" class="hidden">' +
      '</div>' +
      '<button type="button" id="btn-add-product" class="btn-primary prod-add">＋ 新增商品</button>' +
    '</div>';
  }
  // 商品库页的筛选 / 排序 / 视图状态（进入页面时重置，保证与静态工具栏默认值一致）
  var prodView = 'card', prodSearch = '', prodCat = '', prodSort = 'default';
  // 多选状态：当前勾选的商品 id 列表（批量删除 / 批量改品类用）
  var selPids = [];
  // 商品库导入：待确认的中间态（解析 + 校验结果），确认后才写入，避免脏数据
  var pendingImport = null;
  function isSel(id) { return selPids.indexOf(id) >= 0; }
  function toggleSel(id) { var i = selPids.indexOf(id); if (i >= 0) selPids.splice(i, 1); else selPids.push(id); }
  function clearSel() { selPids = []; }
  function setSelAll(ids) { selPids = ids.slice(); }
  function selCount() { return selPids.length; }
  // 同步「卡片/表格」中的复选框勾选态 + 批量操作栏
  function syncSelectionUI() {
    Array.prototype.forEach.call(document.querySelectorAll('.prod-sel'), function (cb) {
      var id = cb.getAttribute('data-pid');
      cb.checked = isSel(id);
    });
    var sa = document.getElementById('prod-selall');
    if (sa) {
      var all = getFilteredProducts().map(function (p) { return p.id; });
      sa.checked = all.length > 0 && all.every(isSel);
      sa.indeterminate = all.some(isSel) && !all.every(isSel);
    }
    renderBatchBar();
  }
  function getFilteredProducts() {
    var list = state.working.products || [];
    var q = prodSearch.toLowerCase();
    list = list.filter(function (p) {
      if (prodCat && p.category !== prodCat) return false;
      if (q) {
        var hay = (p.name || '') + ' ' + (p.selling || []).join(' ');
        if (hay.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    if (prodSort === 'price-asc') list = list.slice().sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
    else if (prodSort === 'price-desc') list = list.slice().sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
    else if (prodSort === 'category') list = list.slice().sort(function (a, b) {
      return (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }
  function renderProductList() {
    var list = getFilteredProducts();
    var stats = document.getElementById('prod-stats');
    if (stats) stats.innerHTML = productStatsHTML(list);
    var container = document.getElementById('prod-list');
    if (!container) return;
    if (list.length === 0) {
      container.className = 'prod-empty-wrap';
      container.innerHTML = '<div class="prod-empty">没有匹配的商品，试试调整搜索或筛选条件。</div>';
      return;
    }
    if (prodView === 'card') {
      container.className = 'prod-grid';
      container.innerHTML = list.map(productCardHTML).join('');
    } else {
      container.className = 'prod-table-wrap';
      container.innerHTML = productTableHTML(list);
    }
    syncSelectionUI();
  }
  function setProdView(v) {
    prodView = v;
    var vc = document.getElementById('prod-view-card'), vt = document.getElementById('prod-view-table');
    if (vc) vc.classList.toggle('active', v === 'card');
    if (vt) vt.classList.toggle('active', v === 'table');
    renderProductList();
  }
  function initProductsPage() {
    prodView = 'card'; prodSearch = ''; prodCat = ''; prodSort = 'default';
    renderProductList();
    var search = document.getElementById('prod-search');
    if (search) search.addEventListener('input', function () { prodSearch = search.value.trim(); renderProductList(); });
    var cat = document.getElementById('prod-cat');
    if (cat) cat.addEventListener('change', function () { prodCat = cat.value; renderProductList(); });
    var sort = document.getElementById('prod-sort');
    if (sort) sort.addEventListener('change', function () { prodSort = sort.value; renderProductList(); });
    var vc = document.getElementById('prod-view-card');
    if (vc) vc.addEventListener('click', function () { setProdView('card'); });
    var vt = document.getElementById('prod-view-table');
    if (vt) vt.addEventListener('click', function () { setProdView('table'); });
    var add = document.getElementById('btn-add-product');
    if (add) add.addEventListener('click', function () { openProductModal(null); });

    // 导入 / 导出：JSON 结构化 + CSV 表格
    var expJson = document.getElementById('btn-exp-json');
    if (expJson) expJson.addEventListener('click', exportProductsJSON);
    var expCsv = document.getElementById('btn-exp-csv');
    if (expCsv) expCsv.addEventListener('click', exportProductsCSV);
    var impBtn = document.getElementById('btn-imp');
    var impFile = document.getElementById('imp-file');
    if (impBtn && impFile) {
      impBtn.addEventListener('click', function () { impFile.value = ''; impFile.click(); });
      impFile.addEventListener('change', function () { if (impFile.files && impFile.files[0]) importProductsFile(impFile.files[0]); });
    }

    // 列表内复选框（多选）/ 表头全选：change 委托（复选框不触发 click）
    var listEl = document.getElementById('prod-list');
    if (listEl) listEl.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'prod-selall') {
        var all = getFilteredProducts().map(function (p) { return p.id; });
        if (t.checked) setSelAll(all); else clearSel();
        syncSelectionUI();
      } else if (t.classList && t.classList.contains('prod-sel')) {
        var id = t.getAttribute('data-pid');
        if (id) { toggleSel(id); syncSelectionUI(); }
      }
    });

    // 弹窗内表单的「输入即校验 + 实时预览」
    ['pf-name', 'pf-price', 'pf-orig', 'pf-cat', 'pf-emoji'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', onProductFieldInput);
    });
    var tagInput = document.getElementById('pf-tag-input');
    if (tagInput) tagInput.addEventListener('keydown', onTagKeydown);
  }

  /* ---------------- 商品库：新增 / 编辑弹窗（含实时预览 + 逐项校验） ---------------- */
  // 渐变预设（点击即选；存为完整 CSS 字符串，工作台与后台共用同一份值）
  var GRADIENT_PRESETS = [
    { label: '靛蓝',   css: 'linear-gradient(135deg,#818cf8,#4f46e5)' },
    { label: '天空蓝', css: 'linear-gradient(135deg,#60a5fa,#3b82f6)' },
    { label: '青绿',   css: 'linear-gradient(135deg,#5eead4,#14b8a6)' },
    { label: '草绿',   css: 'linear-gradient(135deg,#86efac,#22c55e)' },
    { label: '暖黄',   css: 'linear-gradient(135deg,#fde047,#facc15)' },
    { label: '活力橙', css: 'linear-gradient(135deg,#fdba74,#f97316)' },
    { label: '枣红',   css: 'linear-gradient(135deg,#fb7185,#ef4444)' },
    { label: '樱粉',   css: 'linear-gradient(135deg,#f9a8d4,#ec4899)' },
    { label: '品牌紫', css: 'linear-gradient(135deg,#a78bfa,#7c3aed)' },
    { label: '灰蓝',   css: 'linear-gradient(135deg,#a5b4fc,#6366f1)' },
    { label: '雾灰',   css: 'linear-gradient(135deg,#e5e7eb,#9ca3af)' },
    { label: '暗夜',   css: 'linear-gradient(135deg,#475569,#1e293b)' }
  ];
  // 常用电商表情快捷面板（也允许手动输入）
  var EMOJI_CHOICES = ['🎮','📱','❄️','🧣','🚴','🤖','🧳','🍋','🔌','🎒','💻','🎧','📷','👟','👕','👜','⌚','🍎','🥤','🛏️','🧴','🍫','📚','🪑','🔧','💡','🍵','👗','🛒','🍿','🧸'];

  var editingId = null;     // 编辑中的商品 id；null = 新增
  var modalTags = [];       // 当前弹窗内的卖点标签

  // 自动生成不重复的编号：p + 现有最大数字 + 1
  function genProductId() {
    var max = 0;
    (state.working.products || []).forEach(function (p) {
      var m = /^p(\d+)$/.exec(p.id || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'p' + (max + 1);
  }

  function productModalHTML() {
    var emojiGrid = EMOJI_CHOICES.map(function (e) {
      return '<button type="button" class="emoji-opt" data-action="prod-emoji" data-emoji="' + esc(e) + '" title="' + esc(e) + '">' + e + '</button>';
    }).join('');
    var gradGrid = GRADIENT_PRESETS.map(function (g) {
      return '<button type="button" class="grad-opt" data-action="prod-grad" data-css="' + esc(g.css) + '" title="' + esc(g.label) + '" style="background:' + g.css + '"></button>';
    }).join('');
    var catOpts = distinctCategories(state.working.products).map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('');
    return '' +
    '<div id="prod-modal" class="modal-mask hidden">' +
      '<div class="modal-card">' +
        '<div class="modal-head">' +
          '<h3 id="prod-modal-title">新增商品</h3>' +
          '<button type="button" class="modal-x" data-action="prod-cancel" title="关闭">✕</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div class="modal-form">' +
            '<div class="field"><label>编号</label>' +
              '<input type="text" id="pf-id" readonly class="ro" placeholder="自动生成">' +
              '<div class="field-err" data-for="id"></div></div>' +
            '<div class="field"><label>商品名称 <span class="req">*</span></label>' +
              '<input type="text" id="pf-name" placeholder="请输入商品名称">' +
              '<div class="field-err" data-for="name"></div></div>' +
            '<div class="field"><label>图标（表情）</label>' +
              '<div class="emoji-cur" id="pf-emoji-cur">🛍️</div>' +
              '<div class="emoji-grid">' + emojiGrid + '</div>' +
              '<input type="text" id="pf-emoji" class="mt-2" placeholder="或手动输入一个表情" maxlength="4">' +
              '<div class="field-err" data-for="icon"></div></div>' +
            '<div class="field"><label>背景渐变</label>' +
              '<div class="grad-grid">' + gradGrid + '</div>' +
              '<div class="field-err" data-for="gradient"></div></div>' +
            '<div class="field-row">' +
              '<div class="field"><label>售价（元）<span class="req">*</span></label>' +
                '<input type="number" id="pf-price" min="0" step="0.01" placeholder="0">' +
                '<div class="field-err" data-for="price"></div></div>' +
              '<div class="field"><label>原价（元）<span class="req">*</span></label>' +
                '<input type="number" id="pf-orig" min="0" step="0.01" placeholder="0">' +
                '<div class="field-err" data-for="originalPrice"></div></div>' +
            '</div>' +
            '<div class="discount-line">实时折扣率：<span id="pf-discount">—</span></div>' +
            '<div class="field"><label>品类 <span class="req">*</span></label>' +
              '<input type="text" id="pf-cat" list="pf-catlist" placeholder="从已有品类选择，或输入新品类">' +
              '<datalist id="pf-catlist">' + catOpts + '</datalist>' +
              '<div class="field-err" data-for="category"></div></div>' +
            '<div class="field"><label>卖点标签 <span class="hint">（建议 2~4 个，回车添加，点 ✕ 删除）</span></label>' +
              '<div class="tag-input" id="pf-tags"></div>' +
              '<input type="text" id="pf-tag-input" class="mt-2" placeholder="输入卖点后回车添加">' +
              '<div class="field-err" data-for="selling"></div></div>' +
          '</div>' +
          '<div class="modal-preview">' +
            '<div class="preview-title">实时预览</div>' +
            '<div id="prod-preview"></div>' +
            '<p class="card-desc" style="margin-top:10px">改任意一项，右侧卡片立即同步。</p>' +
          '</div>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn-ghost" data-action="prod-cancel">取消</button>' +
          '<button type="button" class="btn-primary" data-action="prod-save">保存商品</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); }
  function markSelectedEmoji(emoji) {
    Array.prototype.forEach.call(document.querySelectorAll('.emoji-opt'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-emoji') === emoji);
    });
    var cur = document.getElementById('pf-emoji-cur'); if (cur) cur.textContent = emoji || '🛍️';
  }
  function markSelectedGrad(css) {
    Array.prototype.forEach.call(document.querySelectorAll('.grad-opt'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-css') === css);
    });
  }
  function getProductForm() {
    var num = function (id) { var v = parseFloat((document.getElementById(id) || {}).value); return isNaN(v) ? NaN : v; };
    return {
      id: (document.getElementById('pf-id') || {}).value || '',
      name: (document.getElementById('pf-name') || {}).value.trim(),
      price: num('pf-price'),
      originalPrice: num('pf-orig'),
      category: (document.getElementById('pf-cat') || {}).value.trim(),
      icon: (document.getElementById('pf-emoji') || {}).value.trim() || '🛍️',
      gradient: (document.getElementById('pf-gradient') || {}).value || GRADIENT_PRESETS[0].css,
      selling: modalTags.slice()
    };
  }
  // 逐项校验：返回 { 字段: 具体原因 }；空对象表示通过
  function validateProductForm(f) {
    var e = {};
    if (!f.name) e.name = '商品名称不能为空';
    if (!(f.price > 0)) e.price = '售价必须大于 0';
    if (!(f.originalPrice > 0)) e.originalPrice = '原价必须大于 0';
    else if (f.originalPrice < f.price) e.originalPrice = '原价不能低于售价（当前售价 ¥' + fmtPrice(f.price) + '）';
    if (!f.category) e.category = '品类不能为空';
    if (!f.icon) e.icon = '请选择一个图标';
    if (f.selling.length === 0) e.selling = '至少添加 1 个卖点（回车添加）';
    if (f.selling.length > 8) e.selling = '卖点最多 8 个';
    return e;
  }
  function showProductErrors(errs) {
    ['id','name','price','originalPrice','category','icon','gradient','selling'].forEach(function (k) {
      var el = document.querySelector('.field-err[data-for="' + k + '"]');
      if (el) el.textContent = errs[k] || '';
    });
  }
  function renderProductPreview() {
    var f = getProductForm();
    var prod = {
      id: f.id, name: f.name || '商品名称预览', price: isNaN(f.price) ? 0 : f.price,
      originalPrice: isNaN(f.originalPrice) ? 0 : f.originalPrice, category: f.category || '未分类',
      selling: f.selling, icon: f.icon, gradient: f.gradient
    };
    var pv = document.getElementById('prod-preview');
    if (pv) pv.innerHTML = productCardHTML(prod);
    var disc = document.getElementById('pf-discount');
    if (disc) {
      disc.textContent = (f.price > 0 && f.originalPrice >= f.price)
        ? Math.round((f.originalPrice - f.price) / f.originalPrice * 100) + '%'
        : '—';
    }
  }
  function renderTags() {
    var box = document.getElementById('pf-tags');
    if (!box) return;
    box.innerHTML = (modalTags.length
      ? modalTags.map(function (t, i) {
          return '<span class="tag-chip">' + esc(t) + '<button type="button" class="tag-x" data-action="prod-tag-del" data-idx="' + i + '" title="删除">✕</button></span>';
        }).join('')
      : '<span class="tag-empty">暂无卖点，输入后回车添加</span>');
  }
  function onProductFieldInput() {
    var f = getProductForm();
    showProductErrors(validateProductForm(f));
    renderProductPreview();
  }
  function onTagKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var inp = document.getElementById('pf-tag-input');
    var v = inp ? inp.value.trim() : '';
    if (!v) return;
    if (modalTags.indexOf(v) < 0 && modalTags.length < 8) modalTags.push(v);
    if (inp) inp.value = '';
    renderTags(); renderProductPreview();
    showProductErrors(validateProductForm(getProductForm()));
  }
  function openProductModal(prod) {
    editingId = prod ? prod.id : null;
    modalTags = prod ? (prod.selling || []).slice() : [];
    var title = document.getElementById('prod-modal-title');
    if (title) title.textContent = prod ? '编辑商品' : '新增商品';
    setVal('pf-id', prod ? prod.id : genProductId());
    setVal('pf-name', prod ? prod.name : '');
    setVal('pf-price', prod ? prod.price : '');
    setVal('pf-orig', prod ? prod.originalPrice : '');
    setVal('pf-cat', prod ? prod.category : '');
    var emoji = (prod && prod.icon) ? prod.icon : EMOJI_CHOICES[0];
    setVal('pf-emoji', emoji);
    var grad = (prod && prod.gradient) ? prod.gradient : GRADIENT_PRESETS[0].css;
    setVal('pf-gradient', grad);
    markSelectedEmoji(emoji);
    markSelectedGrad(grad);
    renderTags(); renderProductPreview(); showProductErrors({});
    var m = document.getElementById('prod-modal');
    if (m) m.classList.remove('hidden');
  }
  function closeProductModal() {
    var m = document.getElementById('prod-modal');
    if (m) m.classList.add('hidden');
  }
  // 校验通过 → 写入 working.products → 持久化（三级配置）→ 刷新列表
  function saveProductModal() {
    var f = getProductForm();
    var errs = validateProductForm(f);
    showProductErrors(errs);
    if (Object.keys(errs).length) { toast('请修正表单中标红的项后再保存'); return; }
    var prod = {
      id: f.id, name: f.name, price: f.price, originalPrice: f.originalPrice,
      category: f.category, selling: f.selling, icon: f.icon, gradient: f.gradient
    };
    var list = state.working.products ? state.working.products.slice() : [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === f.id) { idx = i; break; } }
    if (idx >= 0) list[idx] = prod; else list.push(prod);
    state.working.products = list;
    closeProductModal();
    persistProductsNow(prod.id, editingId ? '已更新商品' : '已新增商品');
    renderProductList();
  }
  // 仅持久化商品（复用服务端 POST + 本机镜像逻辑；配置整体合法，无需再校验）
  function persistProductsNow(id, okMsg) {
    var payload = JSON.stringify(state.working);
    if (isHttp) {
      fetch('/api/admin-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.status >= 200 && res.status < 300 && res.data && res.data.ok) {
            persistLocal(); setSavedSnapshot(); toast(okMsg + '（服务端' + (res.data.backup ? '·已备份' : '') + '）');
          } else {
            persistLocal(); setSavedSnapshot();
            toast('服务端未保存：' + ((res.data && res.data.error) || '未知错误') + '，已存本机');
          }
          updateDirtyUI();
        })
        .catch(function () {
          persistLocal(); setSavedSnapshot(); toast(okMsg + '（已保存到本机浏览器）'); updateDirtyUI();
        });
      return;
    }
    persistLocal(); setSavedSnapshot(); toast(okMsg + '（已保存到本机浏览器）'); updateDirtyUI();
  }
  function deleteProduct(id) {
    if (!window.confirm('确定删除该商品？此操作会同步保存到三级配置。')) return;
    var list = (state.working.products || []).filter(function (p) { return p.id !== id; });
    state.working.products = list;
    persistProductsNow(id, '已删除商品');
    renderProductList();
  }

  /* ---------------- 商品库：多选 + 批量操作（删除 / 改品类） ---------------- */
  function getSelectedProducts() {
    var all = state.working.products || [];
    return selPids.map(function (id) {
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    }).filter(Boolean);
  }
  function renderBatchBar() {
    var bar = document.getElementById('prod-batchbar');
    if (!bar) return;
    var n = selCount();
    if (n === 0) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.innerHTML = '<div class="batchbar-inner">' +
      '<span class="batch-count">已选 <b>' + n + '</b> 件</span>' +
      '<button type="button" class="btn-ghost" data-action="batch-selall">全选当前结果</button>' +
      '<button type="button" class="btn-primary" data-action="batch-cat">批量改品类</button>' +
      '<button type="button" class="btn-danger" data-action="batch-del">批量删除</button>' +
      '<button type="button" class="btn-ghost" data-action="batch-clear">取消选择</button>' +
    '</div>';
  }
  // 批量删除确认弹窗（自定义，可列出每件商品的引用数量）
  function openBatchDelete() {
    var sel = getSelectedProducts();
    if (!sel.length) { toast('请先勾选要删除的商品'); return; }
    var body = document.getElementById('batchdel-body');
    var anyRef = false;
    var rows = sel.map(function (p) {
      var r = countHotspotRefs(p);
      if (r.count > 0) anyRef = true;
      var refLine = r.count > 0
        ? '⚠️ 被 <b>' + r.count + '</b> 条热点推荐引用，删除后这些推荐会失效'
        : '（无热点引用）';
      return '<li class="ref-item"><span class="ref-name">' + esc(p.name) + '</span><span class="ref-count ' + (r.count > 0 ? 'ref-bad' : 'ref-good') + '">' + refLine + '</span></li>';
    }).join('');
    if (body) {
      body.innerHTML = (anyRef
        ? '<div class="ref-warn">⚠️ 其中部分商品被热点推荐引用，删除后对应热点的推荐将失效，请确认后再操作。</div>'
        : '<div class="ref-ok">所选商品均未被热点推荐引用，可安全删除。</div>') +
        '<ul class="ref-list">' + rows + '</ul>';
    }
    var confirmBtn = document.querySelector('#prod-batchdel-modal [data-action="batch-del-confirm"]');
    if (confirmBtn) confirmBtn.textContent = '确认删除 ' + sel.length + ' 件';
    var m = document.getElementById('prod-batchdel-modal');
    if (m) m.classList.remove('hidden');
  }
  function closeBatchDel() { var m = document.getElementById('prod-batchdel-modal'); if (m) m.classList.add('hidden'); }
  function confirmBatchDelete() {
    var sel = getSelectedProducts();
    if (!sel.length) return;
    var ids = sel.map(function (p) { return p.id; });
    var before = (state.working.products || []).length;
    var list = (state.working.products || []).filter(function (p) { return ids.indexOf(p.id) < 0; });
    var deleted = before - list.length;
    var notFound = sel.length - deleted;
    state.working.products = list;
    clearSel();
    closeBatchDel();
    persistProductsNow('batch', '已批量删除商品');
    renderProductList();
    var msg = '批量删除：成功 ' + deleted + ' 件';
    if (notFound > 0) msg += '；跳过 ' + notFound + ' 件（商品不存在或已被删除）';
    toast(msg);
  }
  // 批量改品类
  function openBatchCat() {
    var sel = getSelectedProducts();
    if (!sel.length) { toast('请先勾选要修改的商品'); return; }
    var catOpts = distinctCategories(state.working.products).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    var dl = document.getElementById('batch-catlist'); if (dl) dl.innerHTML = catOpts;
    var hint = document.getElementById('batch-cat-hint');
    if (hint) hint.innerHTML = '将 <b>' + sel.length + '</b> 件已选商品统一改为以下品类（已是该品类的会自动跳过）：';
    var inp = document.getElementById('batch-cat-input'); if (inp) inp.value = '';
    var m = document.getElementById('prod-batchcat-modal'); if (m) m.classList.remove('hidden');
  }
  function closeBatchCat() { var m = document.getElementById('prod-batchcat-modal'); if (m) m.classList.add('hidden'); }
  function applyBatchCat() {
    var sel = getSelectedProducts();
    var target = (document.getElementById('batch-cat-input') || {}).value.trim();
    if (!target) { toast('请输入或选择目标品类'); return; }
    var success = 0, skippedSame = 0, notFound = 0;
    var list = (state.working.products || []).slice();
    sel.forEach(function (p) {
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === p.id) { idx = i; break; }
      if (idx < 0) { notFound++; return; }
      if (list[idx].category === target) { skippedSame++; return; }
      list[idx] = Object.assign({}, list[idx], { category: target });
      success++;
    });
    state.working.products = list;
    clearSel();
    closeBatchCat();
    persistProductsNow('batch', '已批量修改品类');
    renderProductList();
    var parts = ['批量改品类：成功 ' + success + ' 件'];
    if (skippedSame > 0) parts.push('跳过 ' + skippedSame + ' 件（已是「' + target + '」）');
    if (notFound > 0) parts.push('跳过 ' + notFound + ' 件（商品不存在）');
    toast(parts.join('；'));
  }
  function batchModalsHTML() {
    return '' +
    '<div id="prod-batchdel-modal" class="modal-mask hidden">' +
      '<div class="modal-card modal-sm">' +
        '<div class="modal-head"><h3>确认批量删除</h3><button type="button" class="modal-x" data-action="batch-del-cancel" title="关闭">✕</button></div>' +
        '<div class="modal-body"><div id="batchdel-body"></div></div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn-ghost" data-action="batch-del-cancel">取消</button>' +
          '<button type="button" class="btn-danger" data-action="batch-del-confirm">确认删除</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="prod-batchcat-modal" class="modal-mask hidden">' +
      '<div class="modal-card modal-sm">' +
        '<div class="modal-head"><h3>批量修改品类</h3><button type="button" class="modal-x" data-action="batch-cat-cancel" title="关闭">✕</button></div>' +
        '<div class="modal-body">' +
          '<p class="card-desc" id="batch-cat-hint"></p>' +
          '<div class="field"><label>目标品类</label>' +
            '<input type="text" id="batch-cat-input" list="batch-catlist" placeholder="从已有品类选择，或输入新品类">' +
            '<datalist id="batch-catlist"></datalist>' +
          '</div>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn-ghost" data-action="batch-cat-cancel">取消</button>' +
          '<button type="button" class="btn-primary" data-action="batch-cat-confirm">应用修改</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 商品库：批量导入 / 导出 ---------------- */
  // 健壮 CSV 解析（RFC4180 风格）：支持引号包裹、字段内逗号 / 换行、"" 转义为 "
  function csvParse(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去 UTF-8 BOM
    var rows = [], row = [], field = '', inQ = false, i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); if (!(row.length === 1 && row[0] === '')) rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (!(row.length === 1 && row[0] === '')) { row.push(field); rows.push(row); }
    return rows;
  }
  function csvCell(v) {
    v = (v == null) ? '' : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  // 表格文件表头（中文）；编号用于导入时稳定匹配商品，保证「导出→再导入」完全一致
  var CSV_HEADER = ['编号', '名称', '售价', '原价', '品类', '卖点', '图标'];
  function csvSerialize(products) {
    var lines = [CSV_HEADER.map(csvCell).join(',')];
    (products || []).forEach(function (p) {
      var row = [
        p.id || '',
        p.name || '',
        (typeof p.price === 'number') ? p.price : '',
        (p.originalPrice > 0) ? p.originalPrice : '',
        p.category || '',
        (p.selling || []).join('、'),
        p.icon || ''
      ];
      lines.push(row.map(csvCell).join(','));
    });
    return '﻿' + lines.join('\r\n'); // BOM 让 Excel 正确识别 UTF-8 中文
  }
  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function fileStamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

  function exportProductsJSON() {
    downloadText('商品库-结构化-' + fileStamp() + '.json',
      JSON.stringify(state.working.products || [], null, 2), 'application/json');
    toast('已导出商品库（结构化 JSON）');
  }
  function exportProductsCSV() {
    downloadText('商品库-表格-' + fileStamp() + '.csv', csvSerialize(state.working.products || []), 'text/csv;charset=utf-8');
    toast('已导出商品库（表格 CSV）');
  }

  // 解析：自动识别 JSON / CSV，返回 { mode, rows } 或 { fatal }
  function parseImportJSON(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { fatal: '文件不是合法 JSON：' + e.message }; }
    var arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.products) ? parsed.products : null);
    if (!arr) return { fatal: 'JSON 结构不正确：应为「商品数组」，或含 products 数组的对象' };
    var rows = arr.map(function (p, idx) {
      var op = (p.originalPrice === undefined || p.originalPrice === null || p.originalPrice === '') ? undefined : Number(p.originalPrice);
      return {
        id: p.id != null ? String(p.id) : '',
        name: p.name != null ? String(p.name) : '',
        price: Number(p.price),
        originalPrice: op,
        category: p.category != null ? String(p.category) : '',
        icon: p.icon != null ? String(p.icon) : '',
        selling: Array.isArray(p.selling) ? p.selling.map(String)
          : (typeof p.selling === 'string' && p.selling ? p.selling.split(/[、,]/) : []),
        lineLabel: '第 ' + (idx + 1) + ' 条',
        _raw: p
      };
    });
    return { mode: 'json', rows: rows };
  }
  function parseImportCSV(text) {
    var grid = csvParse(text);
    if (!grid.length) return { fatal: '文件为空' };
    var header = grid[0].map(function (h) { return h.trim(); });
    var col = {};
    CSV_HEADER.forEach(function (zh) { var hi = header.indexOf(zh); if (hi >= 0) col[zh] = hi; });
    if (col['名称'] == null || col['售价'] == null)
      return { fatal: '表头缺少必要的「名称」「售价」列。当前表头：' + header.join('、') };
    var rows = [];
    for (var r = 1; r < grid.length; r++) {
      var cells = grid[r];
      if (cells.length === 1 && cells[0] === '') continue; // 跳过空行
      var get = function (zh) { var i = col[zh]; return (i != null && cells[i] != null) ? cells[i] : ''; };
      var sRaw = get('卖点');
      var selling = sRaw ? sRaw.split('、').map(function (s) { return s.trim(); }).filter(function (s) { return s; }) : [];
      var priceRaw = get('售价').trim(), origRaw = get('原价').trim();
      rows.push({
        id: get('编号').trim(),
        name: get('名称').trim(),
        price: priceRaw === '' ? NaN : Number(priceRaw),
        originalPrice: origRaw === '' ? undefined : Number(origRaw),
        category: get('品类').trim(),
        icon: get('图标').trim(),
        selling: selling,
        lineLabel: '第 ' + (r + 1) + ' 行'  // 表格软件里看到的行号（第 1 行为表头）
      });
    }
    return { mode: 'csv', rows: rows };
  }
  // 逐行校验：返回 { valid:[...], issues:[{line, reasons:[]}] }
  function validateImportRows(rows) {
    var valid = [], issues = [];
    rows.forEach(function (row) {
      var reasons = [];
      if (!row.name) reasons.push('名称不能为空');
      if (row.price === undefined || isNaN(row.price)) reasons.push('售价不是有效数字');
      else if (row.price <= 0) reasons.push('售价必须大于 0（当前值：' + row.price + '）');
      if (row.originalPrice !== undefined) {
        if (isNaN(row.originalPrice)) reasons.push('原价不是有效数字');
        else if (row.originalPrice <= 0) reasons.push('原价必须大于 0');
        else if (row.price > 0 && row.originalPrice < row.price) reasons.push('原价不能低于售价');
      }
      if (!row.category) reasons.push('品类不能为空');
      if (reasons.length) issues.push({ line: row.lineLabel, reasons: reasons });
      else valid.push(row);
    });
    return { valid: valid, issues: issues };
  }
  function importProductsFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var name = (file.name || '').toLowerCase();
      var isJson = name.endsWith('.json') || /^\s*[[{]/.test(text);
      var parsed = isJson ? parseImportJSON(text) : parseImportCSV(text);
      if (parsed.fatal) { pendingImport = { fatal: true, message: parsed.fatal }; openImportReview(pendingImport); return; }
      var v = validateImportRows(parsed.rows);
      pendingImport = { mode: parsed.mode, valid: v.valid, issues: v.issues, fatal: false };
      openImportReview(pendingImport);
    };
    reader.onerror = function () { toast('导入失败：文件读取错误'); };
    reader.readAsText(file);
  }
  // 导入预览 / 校验弹窗：先让用户看问题再决定，确认才写入
  function importReviewModalHTML() {
    return '' +
      '<div id="prod-import-modal" class="modal-mask hidden">' +
        '<div class="modal-card modal-md">' +
          '<div class="modal-head"><h3>导入预览与校验</h3><button type="button" class="modal-x" data-action="imp-review-cancel" title="关闭">✕</button></div>' +
          '<div class="modal-body"><div id="imp-review-body"></div></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn-ghost" data-action="imp-review-cancel">取消（不改动）</button>' +
            '<button type="button" class="btn-primary" id="imp-review-confirm" data-action="imp-review-confirm">继续导入</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  function openImportReview(res) {
    var body = document.getElementById('imp-review-body');
    var confirmBtn = document.getElementById('imp-review-confirm');
    if (!body) return;
    if (res.fatal) {
      body.innerHTML = '<div class="ref-warn">⚠️ ' + esc(res.message) + '</div>' +
        '<p class="card-desc">请修正文件后重新导入，原商品库不会被改动。</p>';
      if (confirmBtn) confirmBtn.style.display = 'none';
      var m0 = document.getElementById('prod-import-modal'); if (m0) m0.classList.remove('hidden');
      return;
    }
    if (confirmBtn) confirmBtn.style.display = '';
    var total = res.valid.length + res.issues.length;
    var issueHtml = res.issues.length
      ? '<ul class="ref-list">' + res.issues.map(function (it) {
          return '<li class="ref-item"><span class="ref-name">' + esc(it.line) + '</span><span class="ref-count ref-bad">' + esc(it.reasons.join('；')) + '</span></li>';
        }).join('') + '</ul>'
      : '<div class="ref-ok">所有 ' + total + ' 条均通过校验，可直接导入。</div>';
    body.innerHTML = '<div class="' + (res.issues.length ? 'ref-warn' : 'ref-ok') + '">' +
        '共解析 <b>' + total + '</b> 条，其中 <b>' + res.issues.length + '</b> 条存在问题（将跳过），<b>' + res.valid.length + '</b> 条将' +
        (res.mode === 'csv' ? '导入 / 更新' : '导入（整体替换）') + '。</div>' + issueHtml;
    if (confirmBtn) confirmBtn.textContent = res.issues.length
      ? '继续导入（跳过 ' + res.issues.length + ' 条）' : '确认导入 ' + res.valid.length + ' 条';
    var m = document.getElementById('prod-import-modal'); if (m) m.classList.remove('hidden');
  }
  function closeImportReview() { var m = document.getElementById('prod-import-modal'); if (m) m.classList.add('hidden'); }
  function confirmImport() {
    var res = pendingImport;
    if (!res || res.fatal) { closeImportReview(); return; }
    var valid = res.valid;
    // JSON：整体替换商品库（仅保留校验通过的，原样保留其全部字段）
    if (res.mode === 'json') {
      var list = valid.map(function (row) {
        var p = row._raw || {};
        return {
          id: p.id || genProductId(),
          name: row.name, price: row.price,
          originalPrice: (row.originalPrice !== undefined && isFinite(row.originalPrice)) ? row.originalPrice : 0,
          category: row.category,
          icon: p.icon || row.icon || '🛍️',
          gradient: p.gradient || GRADIENT_PRESETS[0].css,
          selling: row.selling,
          month: p.month, detail: p.detail
        };
      });
      state.working.products = list;
      closeImportReview();
      persistProductsNow('import', '已导入商品库（结构化替换）');
      renderProductList();
      toast('导入完成：成功 ' + list.length + ' 件' + (res.issues.length ? '；跳过 ' + res.issues.length + ' 条（校验未通过）' : ''));
      pendingImport = null;
      return;
    }
    // CSV：按编号匹配 → 更新（保留 gradient / month / detail），否则新增
    var existing = (state.working.products || []).slice();
    var byId = {}; existing.forEach(function (p) { byId[p.id] = p; });
    var usedIds = {}; existing.forEach(function (p) { usedIds[p.id] = true; });
    var added = 0, updated = 0;
    valid.forEach(function (row) {
      var id = row.id;
      if (!id) { id = genProductId(); while (usedIds[id]) id = genProductId(); }
      usedIds[id] = true;
      var ex = byId[id];
      var prod;
      if (ex) {
        prod = Object.assign({}, ex, {
          name: row.name, price: row.price,
          originalPrice: (row.originalPrice !== undefined && isFinite(row.originalPrice)) ? row.originalPrice : (ex.originalPrice || 0),
          category: row.category,
          icon: row.icon || ex.icon || '🛍️',
          selling: row.selling
        });
        updated++;
      } else {
        prod = {
          id: id, name: row.name, price: row.price,
          originalPrice: (row.originalPrice !== undefined && isFinite(row.originalPrice)) ? row.originalPrice : 0,
          category: row.category, icon: row.icon || '🛍️',
          gradient: GRADIENT_PRESETS[0].css, selling: row.selling
        };
        added++;
      }
      var idx = -1;
      for (var i = 0; i < existing.length; i++) if (existing[i].id === id) { idx = i; break; }
      if (idx >= 0) existing[idx] = prod; else existing.push(prod);
    });
    state.working.products = existing;
    clearSel();
    closeImportReview();
    persistProductsNow('import', '已导入 / 更新商品（表格）');
    renderProductList();
    var msg = '导入完成：新增 ' + added + ' 件、更新 ' + updated + ' 件';
    if (res.issues.length) msg += '；跳过 ' + res.issues.length + ' 条（校验未通过）';
    toast(msg);
    pendingImport = null;
  }

  /* ---------------- 占位符 / 模板拼装（与工作台共用同一套规则） ---------------- */
  // 认识的占位符说明（用于清单展示）；点一下插入到光标处
  var PLACEHOLDERS = [
    { group: '素材模板占位符', items: [
      { k: 'hotspot_title',  d: '热点新闻标题' },
      { k: 'hotspot_summary', d: '热点新闻摘要' },
      { k: 'topic_tags',     d: '话题标签（多个 # 话题，空格分隔）' },
      { k: 'product_list',   d: '商品清单（容器）：内部逐件按「单件格式」渲染后拼接' },
      { k: 'tone',           d: '主打语调（来自工作台「主打语调」下拉，按运营后台「语调预设」生成）' },
      { k: 'style_name',     d: '创作风格名称（来自运营后台「创作风格」，每个风格一次调用）' },
      { k: 'style_requirement', d: '创作风格要求（来自运营后台「创作风格」对应说明）' }
    ]},
    { group: '单件商品占位符（仅在「单件格式」内有效）', items: [
      { k: 'product_name',     d: '商品名称' },
      { k: 'product_price',    d: '商品价格' },
      { k: 'product_category', d: '商品分类' },
      { k: 'product_selling',  d: '商品卖点（多条用、分隔）' },
      { k: 'product_month',    d: '近一个月销量' },
      { k: 'product_detail',   d: '商品详情' }
    ]}
  ];

  // 渲染模板：认识 → 替换；不认识 → 原样保留（含 {{ }}），便于发现笔误
  function renderTpl(tpl, data) {
    if (!tpl) return '';
    return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (m, key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        var v = data[key];
        return (v == null) ? '' : String(v);
      }
      return m; // 未知占位符原样保留
    });
  }

  // 示例素材（预览 / 试运行可选）：每个场景含一条热点新闻 + 若干商品
  var SAMPLES = [
    {
      id: 'coffee', label: '场景 A · 精品咖啡豆热点',
      news: { title: '全球精品咖啡豆风味盘点出炉', summary: '近期全球精品咖啡豆价格走高，风味分级成为消费新趋势。', keywords: ['咖啡豆', '精品咖啡', '风味分级'] },
      products: [
        { name: '进口精品咖啡豆 200g', price: '89.00', category: '咖啡/冲煮', selling: ['精选原料', '风味醇厚'], month: '1200', detail: '中浅烘焙，柑橘与坚果调性' },
        { name: '手冲咖啡入门套装', price: '159.00', category: '咖啡器具', selling: ['入门友好', '附教程'], month: '860', detail: '含滤杯、滤纸与量勺' }
      ]
    },
    {
      id: 'cool', label: '场景 B · 夏日高温清凉',
      news: { title: '多地发布高温橙色预警', summary: '本周多地气温突破 38℃，防暑降温需求激增。', keywords: ['高温', '防暑', '降温'] },
      products: [
        { name: '便携迷你小风扇', price: '49.90', category: '生活电器', selling: ['静音', '长续航'], month: '5300', detail: 'USB 充电，三档风力' },
        { name: '冰感运动毛巾', price: '29.90', category: '运动户外', selling: ['速干', '冰感降温'], month: '4100', detail: '接触瞬间降温 3℃' }
      ]
    },
    {
      id: 'ride', label: '场景 C · 城市骑行通勤',
      news: { title: '城市骑行通勤热度上升', summary: '油价与地铁拥挤推动城市骑行通勤升温，装备升级需求明显。', keywords: ['骑行', '通勤', '城市出行'] },
      products: [
        { name: '轻量碳纤维头盔', price: '299.00', category: '骑行装备', selling: ['仅重 230g', '通风好'], month: '980', detail: '一体成型，通过国标认证' },
        { name: '手机骑行支架', price: '39.00', category: '骑行配件', selling: ['防震', '单手装取'], month: '2600', detail: '适配 4.7-7 寸手机' }
      ]
    }
  ];
  var currentSample = SAMPLES[0];

  // 仅拼装「素材」部分（不含 system）：供预览的素材块与试运行的 user 消息复用
  // opts: { tone, styleName, styleRequirement, extraRequirement }
  function buildMaterial(tpl, itemFmt, news, products, opts) {
    opts = opts || {};
    var tone = opts.tone || '';
    var styleName = opts.styleName || '';
    var styleRequirement = opts.styleRequirement || '';
    var extraRequirement = opts.extraRequirement || '';
    var topicTags = (news.keywords || []).map(function (k) { return '#' + k; }).join(' ');
    var productList = (products || []).map(function (pr) {
      return renderTpl(itemFmt, {
        product_name:     pr.name,
        product_price:    pr.price,
        product_category: pr.category,
        product_selling:  (pr.selling || []).join('、'),
        product_month:    pr.month,
        product_detail:   pr.detail
      });
    }).join('\n');
    var material = renderTpl(tpl, {
      hotspot_title:   news.title,
      hotspot_summary: news.summary,
      topic_tags:      topicTags,
      product_list:    productList,
      tone:            tone,
      style_name:      styleName,
      style_requirement: styleRequirement
    });
    if (extraRequirement && extraRequirement.trim()) {
      material += '\n\n补充要求：' + extraRequirement.trim();
    }
    return material;
  }

  // 拼装最终下发给模型的内容：role=system 用规范，role=user 用素材；并返回合并全文便于预览
  function buildPayload(system, tpl, itemFmt, news, products, opts) {
    var material = buildMaterial(tpl, itemFmt, news, products, opts);
    return {
      messages: [
        { role: 'system', content: system || '' },
        { role: 'user',   content: material }
      ],
      material: material,
      full: (system ? system + '\n\n' : '') + material
    };
  }

  // 占位符清单 HTML（两组：素材模板 / 单件格式）
  function placeholderLegendHTML() {
    var html = '<div class="ph-legend"><div class="ph-legend-title">占位符清单 · 点击插入到光标处</div>';
    PLACEHOLDERS.forEach(function (g) {
      html += '<div class="ph-group-title">' + esc(g.group) + '</div><div class="ph-chips">';
      g.items.forEach(function (it) {
        html += '<button type="button" class="ph-chip" data-ph="' + esc(it.k) + '" title="' + esc(it.d) + '">{{' + esc(it.k) + '}}</button>';
      });
      html += '</div>';
    });
    html += '<p class="card-desc" style="margin-top:10px">提示：先点一下要编辑的输入框，再点占位符即可插入到光标当前位置。' +
            '未定义的占位符（如笔误）在预览与生成时会原样保留，不会变成空白。</p></div>';
    return html;
  }

  /* ---------------- 预览 / 试运行 ---------------- */
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function countChars(s) { return Array.from(String(s || '')).length; }
  function truncate(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

  // 本地模拟输出（未配置真实密钥时）：每个风格对应 1 个候选版本，便于看 tabs 渲染
  function simulateCopy(sample, payload, styleName) {
    var names = (sample.products || []).map(function (p) { return p.name; }).join('、');
    var tag = (sample.news.keywords || []).slice(0, 2).map(function (k) { return '#' + k; }).join(' ');
    var v = '【模拟输出 · 非真实模型 · 风格：' + (styleName || '默认') + '】\n' +
      '结合热点《' + sample.news.title + '》，为你推荐：' + names + '。' + (tag ? ' ' + tag : '') + '\n' +
      '（本地模拟文案，仅用于验证模板与占位符是否正常拼装；开启真实调用后，模型会按「' + (styleName || '默认') + '」风格生成 1 条微博文案。）';
    return [v];
  }

  // 把上游错误 / 网络错误翻译成人话（兼容 OpenAI 风格 {error} 与 Coze 风格 {code,msg}）
  function classifyError(status, data) {
    // Coze 风格：HTTP 200 但 body 带 {code, msg}，code !== 0 表示错误
    if (data && typeof data.code === 'number' && data.code !== 0) {
      var cm = String(data.msg || '').toLowerCase();
      if (/login|token|auth|unauthor|invalid|expired|权限|校验|验证/i.test(cm) || /^70/.test(String(data.code))) {
        return '密钥无效或已过期（登录校验未通过），请检查 API Key。';
      }
      if (/model|模型|找不到|不存在|unknown|invalid/i.test(cm)) {
        return '模型名不存在或不可用，请检查 Model 参数。';
      }
      return '模型服务返回错误（code ' + data.code + '）：' + truncate(data.msg || '', 140);
    }
    // OpenAI 风格：{error:{message,type}}
    var msg = '';
    if (data) {
      if (data.error && data.error.message) msg = data.error.message;
      else if (typeof data.error === 'string') msg = data.error;
      else if (data.raw) msg = data.raw;
      else if (data.msg) msg = data.msg;
    }
    var low = msg.toLowerCase();
    // 上游自定义错误类型优先于 HTTP 状态判断
    if (data && data.error && data.error.type === 'config_missing') return '配置不完整：' + truncate(msg, 140);
    if (data && data.error && data.error.type === 'relay_error') return '无法连接到模型服务（域名或网络错误）：' + truncate(msg, 140);
    if (status === 401) return '密钥无效或已过期（Authorization 校验未通过），请检查 API Key。';
    if (status === 403) return '密钥权限不足，无法访问该模型 / 接口。';
    if (status === 404) return '接口或模型名不存在，请检查 Base URL 与 Model。';
    if (status === 429) return '请求过于频繁，已被限流，请稍后重试。';
    if (status === 402 || /balance|quota|insufficient|额度|余额/i.test(msg)) return '账户余额不足或额度已用尽，请充值后重试。';
    if (status === 400) {
      if (/model/i.test(low) && /(not|no|exist|found|invalid|unknow|未知)/i.test(low)) return '模型名不存在或不可用，请检查 Model 参数。';
      return '请求参数有误：' + truncate(msg, 140);
    }
    if (status >= 500) return '模型服务暂时不可用（服务端错误），请稍后重试。';
    if (status === 0) return '网络错误：无法连接到本地代理 /api/llm，请确认 Dev 服务器在运行。';
    if (status && status >= 200 && status < 300) return '模型返回了非空结果但无法解析为标准格式，请确认端点是否为 OpenAI 兼容接口（需返回 choices 字段）。';
    return '调用失败（HTTP ' + status + '）：' + truncate(msg, 140);
  }

  function metaRow(k, v) {
    return '<div class="tm"><span class="tm-k">' + esc(k) + '</span><span class="tm-v">' + esc(v) + '</span></div>';
  }
  // 试运行结果 HTML：单版本 / 多版本（tab 切换）
  function trialHTML(o) {
    if (o.error) {
      return '<div class="err-banner">⚠ 调用失败：' + esc(o.error) + '</div>' +
        '<div class="trial-meta">' + metaRow('接入方式', o.method || '-') + metaRow('模型', o.model || '-') + metaRow('耗时', o.time || '-') + '</div>';
    }
    var simBanner = o.sim ? '<div class="sim-banner">ⓘ 现在是模拟输出，不代表真实模型效果。</div>' : '';
    var body;
    if (Array.isArray(o.versions) && o.versions.length > 1) {
      var tabsHtml = o.versions.map(function (_, i) {
        var letter = String.fromCharCode(65 + i); // A/B/C
        var actCls = (i === 0) ? ' active' : '';
        return '<button type="button" class="ver-tab' + actCls + '" data-ver="' + i + '">版本 ' + letter + '</button>';
      }).join('');
      var panelsHtml = o.versions.map(function (v, i) {
        var actCls = (i === 0) ? ' active' : '';
        var charN = countChars(v);
        return '<div class="ver-panel' + actCls + '" data-ver="' + i + '"><div class="ver-head">版本 ' + String.fromCharCode(65 + i) + ' · 字数 ' + charN + '</div><pre class="pb-body">' + esc(v) + '</pre></div>';
      }).join('');
      body = simBanner +
        '<div class="ver-tabs">' + tabsHtml + '</div>' +
        '<div class="ver-panels">' + panelsHtml + '</div>' +
        '<div class="trial-meta">' +
          metaRow('接入方式', o.method || '-') +
          metaRow('模型', o.model || '-') +
          metaRow('耗时', o.time || '-') +
          metaRow('消耗 tokens', o.tokens || '-') +
          metaRow('版本数', o.versions.length + '（按 \\n\\n 切分）') +
        '</div>';
    } else {
      var text = Array.isArray(o.versions) ? (o.versions[0] || '') : (o.result || '');
      body = simBanner +
        '<div class="trial-result"><div class="tr-head">生成结果</div><pre class="pb-body">' + esc(text) + '</pre></div>' +
        '<div class="trial-meta">' +
          metaRow('接入方式', o.method || '-') +
          metaRow('模型', o.model || '-') +
          metaRow('耗时', o.time || '-') +
          metaRow('消耗 tokens', o.tokens || '-') +
        '</div>';
    }
    return body;
  }
  // 多版本 tabs 切换（事件委托）
  function bindVerTabs(root) {
    if (!root || root.__verTabsBound) return;
    root.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('.ver-tab');
      if (!t) return;
      var i = t.getAttribute('data-ver');
      var tabs = root.querySelectorAll('.ver-tab');
      var panels = root.querySelectorAll('.ver-panel');
      for (var k = 0; k < tabs.length; k++) tabs[k].classList.toggle('active', tabs[k].getAttribute('data-ver') === i);
      for (var k2 = 0; k2 < panels.length; k2++) panels[k2].classList.toggle('active', panels[k2].getAttribute('data-ver') === i);
    });
    root.__verTabsBound = true;
  }

  // 预览：把两块（system / 素材）渲染到预览区并更新字数（取首个风格 + 首个语调作示例）
  function refreshPreview() {
    if (currentRoute() !== 'prompts') return;
    var p = state.working.prompt || {};
    var styles = state.working.creativeStyles || [];
    var tones = state.working.tonePresets || [];
    var st = styles[0] || { name: '', requirement: '' };
    var tone = tones[0] || '';
    var payload = buildPayload(p.system, p.template, p.itemFormat, currentSample.news, currentSample.products, {
      tone: tone, styleName: st.name, styleRequirement: st.requirement
    });
    setText('pv-system', payload.messages[0].content);
    setText('pv-material', payload.messages[1].content);
    setText('cnt-system', '字数 ' + countChars(payload.messages[0].content));
    setText('cnt-material', '字数 ' + countChars(payload.messages[1].content));
  }

  // 试运行：用当前模板真调一次 Coze createCopy 工作流（或本地模拟），结果仅调试不写回
  // 注意：Coze Chat API（/api/v1/chat/completions）不认工作流的 PAT，会 700012006；
  // 工作流调用（/v1/workflow/run）才认这把 PAT，所以走 createCopy 端到端验证最直接。
  function runTrial() {
    var p = state.working.prompt || {};
    var llm = state.working.llm || {};
    var out = document.getElementById('trial-out');
    if (!out) return;
    // 试运行取首个创作风格 + 首个语调，模拟工作台“按风格各跑一次”的单次行为
    var styles = state.working.creativeStyles || [];
    var tones = state.working.tonePresets || [];
    var st = styles[0] || { name: '', requirement: '' };
    var tone = tones[0] || '';
    var payload = buildPayload(p.system, p.template, p.itemFormat, currentSample.news, currentSample.products, {
      tone: tone, styleName: st.name, styleRequirement: st.requirement
    });
    var effectiveSim = !!llm.simulate;
    if (effectiveSim) {
      out.innerHTML = trialHTML({
        sim: true,
        versions: simulateCopy(currentSample, payload, st.name),
        model: '本地模拟',
        method: '本地模拟（勾选了强制本地模拟，不真实调用）',
        time: '-', tokens: '-'
      });
      bindVerTabs(out);
      return;
    }
    out.innerHTML = '<div class="trial-loading">调用中…（Coze createCopy 工作流通常需数秒至数十秒）</div>';
    var t0 = Date.now();
    // 组装 Coze createCopy 入参：把 sample 字段名转成工作流要求的 schema
    //   news:{title,brief,url}  products:[{product,price,classification,month,detail}]  user_prompt:String
    var newsObj = {
      title: currentSample.news.title,
      brief: currentSample.news.summary,
      url: currentSample.news.url || ''
    };
    var productsArr = (currentSample.products || []).map(function (pr) {
      return {
        product: pr.name,
        price: typeof pr.price === 'number' ? pr.price : (parseFloat(pr.price) || 0),
        classification: pr.category || '',
        month: typeof pr.month === 'number' ? pr.month : (parseInt(pr.month, 10) || 0),
        detail: pr.detail || ''
      };
    });
    fetch('/api/coze-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: '<COZE_WORKFLOW_ID>',
        parameters: {
          news: newsObj,
          products: productsArr,
          user_prompt: payload.full
        }
      })
    })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
      .then(function (res) {
        var ms = Date.now() - t0;
        var data; try { data = JSON.parse(res.text); } catch (e) { data = { raw: res.text }; }
        if (res.status >= 200 && res.status < 300 && data && data.code === 0) {
          // 解析 output_wb：data.data 可能是字符串、对象、或 JSON 字符串
          var raw = data.data;
          var text = '';
          if (typeof raw === 'string') {
            try {
              var parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                text = parsed.output_wb || parsed.output || parsed.text || JSON.stringify(parsed);
              } else {
                text = String(parsed);
              }
            } catch (e) {
              text = raw;
            }
          } else if (raw && typeof raw === 'object') {
            text = raw.output_wb || raw.output || raw.text || JSON.stringify(raw);
          } else {
            text = String(raw == null ? '' : raw);
          }
          // 切分多版本（与工作台 Step4 规则一致：按 \n\n 严格分隔）
          var versions = String(text).split(/\n\s*\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
          if (versions.length === 0) versions = [String(text)];
          out.innerHTML = trialHTML({
            sim: false,
            versions: versions,
            model: 'coze（Coze createCopy 工作流）',
            method: '服务端代理（/api/coze-trial → Coze /v1/workflow/run）',
            time: ms + ' ms',
            tokens: '—（工作流不直接返回 tokens）'
          });
          bindVerTabs(out);
        } else {
          out.innerHTML = trialHTML({
            error: classifyError(res.status, data),
            model: 'coze（Coze createCopy 工作流）',
            method: '服务端代理（/api/coze-trial → Coze /v1/workflow/run）',
            time: ms + ' ms'
          });
        }
      })
      .catch(function (err) {
        var ms = Date.now() - t0;
        out.innerHTML = trialHTML({
          error: classifyError(0, { error: { type: 'network', message: err && err.message ? err.message : String(err) } }),
          model: 'coze（Coze createCopy 工作流）',
          method: '服务端代理（/api/coze-trial → Coze /v1/workflow/run）',
          time: ms + ' ms'
        });
      });
  }

  // 商品匹配页「测试关键词提取」：用示例新闻跑一次大模型（或本地模拟），展示生成的关键词。
  function testMatch() {
    var mg = state.working.matchGoods || {};
    if (mg.mode !== 'llm') { toast('请先把匹配方式切到「大模型 LLM」再测试'); return; }
    var llm = state.working.llm || {};
    var out = document.getElementById('match-test-out');
    if (!out) return;
    var news = (currentSample && currentSample.news) || {
      title: '多地气温突破40°C，清凉家电销量暴涨300%',
      summary: '全国多地持续高温红色预警，空调、风扇、制冰机等清凉家电销量同比增长超300%。'
    };
    var prompt = (mg.prompt || '')
      .replace(/\{\{\s*title\s*\}\}/g, news.title)
      .replace(/\{\{\s*brief\s*\}\}/g, news.summary || '');
    if (!prompt.trim()) { toast('匹配提示词为空'); return; }
    var messages = [{ role: 'user', content: prompt }];

    var effectiveSim = !!llm.simulate || !llm.apiKey;
    if (effectiveSim) {
      out.innerHTML = '<div class="trial-loading">本地模拟：无密钥 / 已勾选模拟，返回示例关键词</div>' +
        '<pre class="code">关键词示例：清凉家电，空调，风扇，降温，饮品</pre>';
      return;
    }
    out.innerHTML = '<div class="trial-loading">调用中…（大模型通常需数秒）</div>';
    var t0 = Date.now();
    fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: llm.baseURL, apiKey: llm.apiKey, model: llm.model, messages: messages, temperature: 0.4 })
    })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
      .then(function (res) {
        var ms = Date.now() - t0;
        var data; try { data = JSON.parse(res.text); } catch (e) { data = { raw: res.text }; }
        var text = '';
        if (data && data.choices && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
          text = data.choices[0].message.content || '';
        } else if (typeof data === 'string') {
          text = data;
        } else {
          text = res.text;
        }
        var kw = String(text).split(/[，,、;；\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
        out.innerHTML = '<div class="trial-loading">大模型返回（' + ms + ' ms）</div>' +
          '<pre class="code">原始输出：\n' + esc(text) + '</pre>' +
          (kw.length ? '<div class="kv" style="margin-top:10px"><div><span class="k">解析关键词</span><span class="v">' + kw.map(esc).join('、') + '</span></div></div>' : '');
      })
      .catch(function (err) {
        out.innerHTML = '<div class="trial-loading">调用失败：' + esc(err && err.message ? err.message : String(err)) + '</div>';
      });
  }

  // prompts 页渲染后：绑定示例素材下拉 + 试运行按钮 + 首屏预览
  function initPromptsPage() {
    var sel = document.getElementById('sampleSel');
    if (sel) {
      sel.value = currentSample.id;
      sel.addEventListener('change', function () {
        var s = null;
        for (var i = 0; i < SAMPLES.length; i++) { if (SAMPLES[i].id === sel.value) s = SAMPLES[i]; }
        if (s) { currentSample = s; refreshPreview(); }
      });
    }
    var bt = document.getElementById('btn-trial');
    if (bt) bt.addEventListener('click', runTrial);
    refreshPreview();
  }

  // 把本机单独保存的 llm（含密钥）注入到工作状态，确保服务端模式下刷新后仍保留
  function injectLocalLLM() {
    try {
      var raw = localStorage.getItem(LS_LLM_KEY);
      if (raw) {
        var llm = JSON.parse(raw);
        state.working.llm = Object.assign({}, state.working.llm, llm);
      }
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 三级配置读取 ---------------- */
  function readLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* localStorage 不可用 */ }
    return null;
  }
  function seedLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(BUILTIN_DEFAULTS)); } catch (e) { /* 忽略 */ }
  }
  // 读取后补默认：缺字段 / 非法值 → 用内置默认补齐。保证「误删某段」后仍能返回完整配置。
  function normalizeConfig(c) {
    c = (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
    var out = {};
    out.siteName = (typeof c.siteName === 'string' && c.siteName.trim()) ? c.siteName : BUILTIN_DEFAULTS.siteName;
    out.siteDesc = (typeof c.siteDesc === 'string') ? c.siteDesc : BUILTIN_DEFAULTS.siteDesc;
    out.brandColor = (typeof c.brandColor === 'string' && c.brandColor.trim()) ? c.brandColor : BUILTIN_DEFAULTS.brandColor;
    out.defaultPrompt = (typeof c.defaultPrompt === 'string') ? c.defaultPrompt : BUILTIN_DEFAULTS.defaultPrompt;
    out.maxNews = (typeof c.maxNews === 'number') ? c.maxNews : BUILTIN_DEFAULTS.maxNews;
    out.workflows = (c.workflows && typeof c.workflows === 'object' && !Array.isArray(c.workflows))
      ? c.workflows : deepClone(BUILTIN_DEFAULTS.workflows);
    ['getNews', 'matchGoods', 'createCopy'].forEach(function (k) {
      if (!out.workflows[k] || typeof out.workflows[k] !== 'object') out.workflows[k] = deepClone(BUILTIN_DEFAULTS.workflows[k]);
    });
    out.prompt = {};
    ['system', 'template', 'itemFormat'].forEach(function (k) {
      out.prompt[k] = (c.prompt && typeof c.prompt[k] === 'string' && c.prompt[k].trim())
        ? c.prompt[k] : BUILTIN_DEFAULTS.prompt[k];
    });
    out.creativeStyles = (Array.isArray(c.creativeStyles) && c.creativeStyles.length)
      ? c.creativeStyles : deepClone(BUILTIN_DEFAULTS.creativeStyles);
    out.tonePresets = Array.isArray(c.tonePresets) ? c.tonePresets : deepClone(BUILTIN_DEFAULTS.tonePresets);
    out.llm = (c.llm && typeof c.llm === 'object' && !Array.isArray(c.llm)) ? c.llm : deepClone(BUILTIN_DEFAULTS.llm);
    out.matchGoods = (c.matchGoods && typeof c.matchGoods === 'object' && !Array.isArray(c.matchGoods))
      ? {
          mode: c.matchGoods.mode === 'llm' ? 'llm' : 'coze',
          prompt: (typeof c.matchGoods.prompt === 'string' && c.matchGoods.prompt.trim())
            ? c.matchGoods.prompt : (BUILTIN_DEFAULTS.matchGoods ? BUILTIN_DEFAULTS.matchGoods.prompt : '')
        }
      : deepClone(BUILTIN_DEFAULTS.matchGoods);
    out.products = (Array.isArray(c.products) && c.products.length)
      ? c.products : deepClone(BUILTIN_DEFAULTS.products);
    out.newsSources = (Array.isArray(c.newsSources) && c.newsSources.length)
      ? c.newsSources.map(function (s) { return normalizeNewsSource(s); }).filter(function (x) { return x; })
      : deepClone(BUILTIN_DEFAULTS.newsSources);
    out.eval = (c.eval && typeof c.eval === 'object' && !Array.isArray(c.eval))
      ? c.eval : deepClone(BUILTIN_DEFAULTS.eval);
    return out;
  }

  // 写入校验：关键内容为空 / 缺字段 → 拒绝，避免一次误操作把库清掉。
  // 与 vite 端 /api/admin-config 的校验保持一致（客户端用于导入校验，服务端用于写入校验）。
  function validateAdminConfig(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: '配置文件不是合法的对象' };
    if (typeof c.siteName !== 'string' || !c.siteName.trim()) return { ok: false, error: '站点名称(siteName)不能为空' };
    if (typeof c.brandColor !== 'string' || !c.brandColor.trim()) return { ok: false, error: '品牌色(brandColor)不能为空' };
    if (!c.workflows || typeof c.workflows !== 'object' || Array.isArray(c.workflows))
      return { ok: false, error: '工作流配置(workflows)缺失或格式错误' };
    if (!c.prompt || typeof c.prompt !== 'object') return { ok: false, error: '提示词配置(prompt)缺失' };
    var pkArr = ['system', 'template', 'itemFormat'];
    for (var pi = 0; pi < pkArr.length; pi++) {
      if (typeof c.prompt[pkArr[pi]] !== 'string' || !c.prompt[pkArr[pi]].trim())
        return { ok: false, error: '提示词块 prompt.' + pkArr[pi] + ' 不能为空' };
    }
    if (!Array.isArray(c.creativeStyles) || c.creativeStyles.length === 0)
      return { ok: false, error: '创作风格(creativeStyles)不能为空，至少需保留 1 个' };
    for (var si = 0; si < c.creativeStyles.length; si++) {
      var s = c.creativeStyles[si];
      if (!s || typeof s !== 'object') return { ok: false, error: 'creativeStyles[' + si + '] 格式错误（应为对象）' };
      if (typeof s.name !== 'string' || !s.name.trim()) return { ok: false, error: 'creativeStyles[' + si + '].name 不能为空' };
      if (typeof s.requirement !== 'string' || !s.requirement.trim())
        return { ok: false, error: 'creativeStyles[' + si + '].requirement 不能为空' };
    }
    if (!Array.isArray(c.tonePresets)) return { ok: false, error: '语调预设(tonePresets)必须是数组' };
    if (!c.llm || typeof c.llm !== 'object' || Array.isArray(c.llm))
      return { ok: false, error: '试运行设置(llm)缺失或格式错误' };
    if (c.matchGoods) {
      if (typeof c.matchGoods !== 'object' || Array.isArray(c.matchGoods))
        return { ok: false, error: '商品匹配(matchGoods)格式错误' };
      if (c.matchGoods.mode !== 'coze' && c.matchGoods.mode !== 'llm')
        return { ok: false, error: 'matchGoods.mode 必须为 coze 或 llm' };
      if (typeof c.matchGoods.prompt !== 'string' || !c.matchGoods.prompt.trim())
        return { ok: false, error: 'matchGoods.prompt 不能为空' };
    }
    return { ok: true };
  }
  /* ---------------- 品牌色应用 ---------------- */
  // 把运营选的 brandColor 推算成 50-700 一整套色阶并写到 :root 上的 --brand-* 与 Tailwind v4 的 --color-brand-*，
  // 后台 styles.css 用 var(--brand-600) 等、工作台用 var(--color-brand-600) 等，命名空间不同需同时覆盖。
  function applyBrandColor(color) {
    var def = (typeof color === 'string' && color.trim()) ? color.trim() : '#7c3aed';
    // 规范化 3 位十六进制 → 6 位
    var m3 = /^#?([0-9a-f]{3})$/i.exec(def);
    if (m3) def = '#' + m3[1].split('').map(function (c) { return c + c; }).join('');
    var m6 = /^#?([0-9a-f]{6})$/i.exec(def);
    if (!m6) return;
    var h6 = m6[1];
    var r = parseInt(h6.slice(0, 2), 16) / 255;
    var g = parseInt(h6.slice(2, 4), 16) / 255;
    var b = parseInt(h6.slice(4, 6), 16) / 255;
    // RGB → HSL（h:0-360, s:0-100, l:0-100）
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var H = 0, S = 0, L = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) H = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) H = (b - r) / d + 2;
      else H = (r - g) / d + 4;
      H /= 6;
    }
    H *= 360; S *= 100; L *= 100;
    function toHex(rr, gg, bb) {
      function h(v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }
      return '#' + h(rr) + h(gg) + h(bb);
    }
    function setHsl(hue, sat, lit) {
      var ss = Math.max(0, Math.min(100, sat)) / 100;
      var ll = Math.max(0, Math.min(100, lit)) / 100;
      if (ss === 0) return toHex(ll, ll, ll);
      var q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
      var p = 2 * ll - q;
      function hue2rgb(t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      }
      return toHex(hue2rgb(H / 360 + 1 / 3), hue2rgb(H / 360), hue2rgb(H / 360 - 1 / 3));
    }
    // 推算色阶：700=偏暗（hover/文字），50-500=同色相的浅色调（背景/边框），饱和度逐步降防止太刺眼
    var ramp = {
      '600': def,
      '700': setHsl(H, S, Math.max(20, L - 12)),
      '500': setHsl(H, S, Math.min(72, L + 6)),
      '400': setHsl(H, Math.max(0, S - 4),  Math.min(82, L + 14)),
      '300': setHsl(H, Math.max(0, S - 8),  Math.min(88, L + 22)),
      '200': setHsl(H, Math.max(0, S - 12), Math.min(93, L + 32)),
      '100': setHsl(H, Math.max(0, S - 20), Math.min(95, L + 40)),
      '50':  setHsl(H, Math.max(0, S - 30), Math.min(97, L + 46)),
    };
    var root = document.documentElement;
    Object.keys(ramp).forEach(function (k) {
      root.style.setProperty('--brand-' + k, ramp[k]);          // 后台 styles.css 命名空间
      root.style.setProperty('--color-brand-' + k, ramp[k]);    // 工作台 Tailwind v4 命名空间
    });
  }
  function loadConfig() {
    if (isHttp) {
      return fetch('/api/admin-config', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) return { config: d.config, source: 'server' };
          throw new Error('api not ok');
        })
        .catch(function () {
          var local = readLocal();
          if (local) return { config: normalizeConfig(local), source: 'local' };
          seedLocal();
          return { config: normalizeConfig(deepClone(BUILTIN_DEFAULTS)), source: 'default' };
        });
    }
    var local = readLocal();
    if (local) return Promise.resolve({ config: normalizeConfig(local), source: 'local' });
    seedLocal();
    return Promise.resolve({ config: normalizeConfig(deepClone(BUILTIN_DEFAULTS)), source: 'default' });
  }

  /* ---------------- 页面注册表 ---------------- */
  // 每个页面：key / title / sub / icon / sections[]
  // section：id / title / desc / tag / build() 返回卡片主体 HTML（可编辑字段用 data-bind）
  function field(name, label, value, type) {
    if (type === 'textarea') {
      return '<div class="field"><label>' + esc(label) + '</label>' +
        '<textarea data-bind="' + esc(name) + '" rows="3">' + esc(value) + '</textarea></div>';
    }
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<input type="text" data-bind="' + esc(name) + '" value="' + esc(value) + '"></div>';
  }
  function wfCard(key) {
    var w = (state.working.workflows && state.working.workflows[key]) || {};
    return '<div class="kv">' +
      '<div><span class="k">工作流 ID</span><span class="v">' + esc(w.id || '-') + '</span></div>' +
      '<div><span class="k">用途</span><span class="v">' + esc(w.label || '-') + '</span></div>' +
      '</div><p class="card-desc" style="margin-top:12px">此处为只读展示，编辑能力后续接入。</p>';
  }

  var PAGES = {
    general: {
      key: 'general', title: '通用设置', sub: '站点基础信息、品牌视觉与默认创作参数的集中配置。',
      icon: ICON.general,
      sections: [
        { id: 'basic', title: '基础信息', desc: '站点的名称与对外描述，展示在后台顶部与工作流文案模板中。', tag: '通用',
          restore: ['siteName', 'siteDesc'],
          build: function () {
            return field('siteName', '站点名称', state.working.siteName, 'text') +
                   field('siteDesc', '站点描述', state.working.siteDesc, 'text');
          } },
        { id: 'visual', title: '品牌视觉', desc: '后台与工作台共用的主色，修改后两端保持一致。', tag: '视觉',
          restore: ['brandColor'],
          build: function () {
            var c = state.working.brandColor || '#7c3aed';
            return '<div class="field"><label>主品牌色</label>' +
              '<div style="display:flex;align-items:center;gap:12px">' +
              '<input type="color" data-bind="brandColor" value="' + esc(c) + '" ' +
              'style="width:46px;height:38px;padding:2px;border:1px solid var(--gray-200);border-radius:10px;background:#fff;cursor:pointer">' +
              '<span class="kv"><span class="k">当前值</span><span class="v" id="brandVal">' + esc(c) + '</span></span>' +
              '</div><p class="card-desc" style="margin-top:10px">颜色通过 CSS 变量 --brand-600 注入，保存后两端统一生效。</p></div>';
          } },
        { id: 'defaults', title: '默认创作参数', desc: '当用户未填写创作要求时，下发给 Coze 工作流的默认提示词（user_prompt）。', tag: '创作',
          restore: ['defaultPrompt'],
          build: function () {
            return field('defaultPrompt', '默认创作要求（user_prompt）', state.working.defaultPrompt, 'textarea');
          } }
      ]
    },
    workflows: {
      key: 'workflows', title: '工作流管理', sub: '三个独立 Coze 工作流的当前配置，后续可在此切换版本与参数。',
      icon: ICON.workflows,
      sections: [
        { id: 'getnews', title: 'getNews · 抓取新闻热点', desc: '输出新闻列表，作为后续匹配与创作的上游数据。', tag: 'Coze 工作流',
          build: function () { return wfCard('getNews'); } },
        { id: 'matchgoods', title: 'matchGoods · 匹配商品', desc: '基于单条新闻匹配商品候选，输出商品品类与卖点。', tag: 'Coze 工作流',
          build: function () { return wfCard('matchGoods'); } },
        { id: 'createcopy', title: 'createCopy · 生成营销文案', desc: '结合新闻与已选商品，生成多版本微博文案。', tag: 'Coze 工作流',
          build: function () { return wfCard('createCopy'); } }
      ]
    },
    datasource: {
      key: 'datasource', title: '数据源', sub: '配置按 服务端 → 本机浏览器 → 内置默认 三级读取，此处可查看当前生效来源。',
      icon: ICON.datasource,
      sections: [
        { id: 'server', title: '服务端配置', desc: '通过 ' + SERVER_URL + ' 探测；服务端可用时优先级最高。', tag: '三级 · 1',
          build: function () {
            return '<div class="kv">' +
              '<div><span class="k">探测地址</span><span class="v">' + esc(SERVER_URL) + '</span></div>' +
              '<div><span class="k">当前来源</span><span class="v">' + sourceText(state.source) + '</span></div>' +
              '</div>' +
              '<p class="card-desc" style="margin-top:12px">当前生效配置（已合并）：</p>' +
              '<pre class="code">' + esc(JSON.stringify(state.config, null, 2)) + '</pre>' +
              '<p class="card-desc" style="margin-top:12px">说明：经 HTTP 打开时，服务端为权威来源（保存写服务端、同时镜像本机）；服务端不可用时回退本机 / 内置默认。任意缺失字段在读取时自动补默认，不会因误删某段而崩溃。</p>';
          } },
        { id: 'local', title: '本机缓存', desc: '浏览器 localStorage 中保存的配置，服务不可用时兜底。', tag: '三级 · 2',
          build: function () {
            var raw = null; try { raw = localStorage.getItem(LS_KEY); } catch (e) { }
            var has = !!raw;
            return '<div class="kv">' +
              '<div><span class="k">缓存键</span><span class="v">' + esc(LS_KEY) + '</span></div>' +
              '<div><span class="k">是否存在</span><span class="v">' + (has ? '已存在' : '空') + '</span></div>' +
              '</div>' +
              (has ? '<pre class="code" style="margin-top:12px">' + esc(JSON.stringify(JSON.parse(raw), null, 2)) + '</pre>'
                   : '<p class="card-desc" style="margin-top:12px">尚未写入本机缓存，保存后将出现在此处。</p>');
          } },
        { id: 'reset', title: '缓存重置', desc: '清除本机缓存并回退到内置默认；不影响服务端配置。', tag: '三级 · 3',
          build: function () {
            return '<p class="card-desc">点击下方按钮清除本机浏览器中的配置缓存。重置后若服务端不可用，将使用内置默认。</p>' +
              '<button class="btn-ghost" id="btn-reset-inline" style="margin-top:10px">清除本机缓存</button>';
          } }
      ]
    },

    prompts: {
      key: 'prompts', title: '文案模板 · 模型指令', sub: '把下发给模型的指令与素材模板搬到此处，运营无需改代码即可调模型输出；本页支持实时预览与试运行调试。',
      icon: ICON.pencil,
      sections: [
        { id: 'access', title: '试运行调用设置', desc: '「试运行」会真实调用 Coze createCopy 工作流（与工作台 Step4 同一条链路），无需在后台填任何密钥。', tag: '接入',
          restore: ['llm'],
          build: function () {
            var l = state.working.llm || {};
            return '' +
              '<label class="sim-toggle"><input type="checkbox" data-bind="llm.simulate" ' + (l.simulate ? 'checked' : '') + '> 强制本地模拟（不真实调用，输出仅供演示模板与占位符渲染）</label>' +
              '<div class="field" style="margin-top:14px"><label>调用方式（只读）</label>' +
                '<input type="text" value="服务端代理 → Coze /v1/workflow/run（createCopy）" readonly></div>' +
              '<div class="field"><label>鉴权凭证（只读）</label>' +
                '<input type="text" value="由 Dev 服务器持有，不暴露给浏览器" readonly></div>' +
              '<p class="card-desc" style="margin-top:10px">' +
              '<b>为什么后台不再让你填 API Key？</b><br>' +
              'Coze Chat API（/api/v1/chat/completions）不认工作流的 PAT，会直接报 <code>700012006 Login verification is invalid</code>；' +
              '而 Coze 工作流调用（/v1/workflow/run）才认这把 PAT。所以「试运行」直接走 <b>createCopy 工作流</b>——' +
              '你刚才在工作台 Step4 调通的那条。改完模板按「试运行」，看到的就是真实的端到端产出。' +
              '<br><br><b>前端提示：</b>如果改了模板发现模型输出没变，还需要去 Coze「文案生成专家_wb」节点把硬指令改为引用 <code>{{user_prompt}}</code>（仅一次改动），后台编辑才会真正生效。' +
              '</p>';
          } },
        { id: 'system', title: '角色设定与写作规范', desc: '写给模型的人设与写作规则；在模型调用中作为 system 角色下发。', tag: '指令',
          restore: ['prompt.system'],
          build: function () {
            var v = (state.working.prompt && state.working.prompt.system) || '';
            return '<textarea data-bind="prompt.system" rows="13" class="ta-lg">' + esc(v) + '</textarea>' +
              '<p class="card-desc" style="margin-top:10px">提示：确保 Coze「文案生成专家_wb」节点已改为引用 {{user_prompt}}（仅此一次改动），本段指令才会真正生效。</p>';
          } },
        { id: 'template', title: '素材拼装模板', desc: '每次调用时把运行期数据填进模板。用占位符表示运行期才有的内容，点下方清单可插入光标处。', tag: '模板',
          restore: ['prompt.template'],
          build: function () {
            var v = (state.working.prompt && state.working.prompt.template) || '';
            return '<textarea data-bind="prompt.template" rows="10" class="ta-lg">' + esc(v) + '</textarea>' +
              placeholderLegendHTML();
          } },
        { id: 'item', title: '单件商品呈现格式', desc: '商品清单占位符 {{product_list}} 内部，每一件商品按此格式渲染后再拼接。', tag: '单件格式',
          restore: ['prompt.itemFormat'],
          build: function () {
            var v = (state.working.prompt && state.working.prompt.itemFormat) || '';
            return '<textarea data-bind="prompt.itemFormat" rows="3" class="ta-lg">' + esc(v) + '</textarea>' +
              placeholderLegendHTML();
          } },
        { id: 'styles', title: '创作风格', desc: '每个风格独立产出 1 个候选版本；至少保留 1 个，删到 0 会被拦住。可上下移调整顺序，也能新增 / 删除 / 改名改要求。', tag: '风格',
          restore: ['creativeStyles'],
          build: function () {
            var styles = state.working.creativeStyles || [];
            var html = '<div class="style-list" id="style-list">';
            styles.forEach(function (s, i) {
              var upDisabled = (i === 0) ? ' disabled' : '';
              var downDisabled = (i === styles.length - 1) ? ' disabled' : '';
              html += '<div class="style-card" data-idx="' + i + '">' +
                '<div class="style-head"><span class="style-no">风格 ' + (i + 1) + '</span>' +
                  '<span class="style-actions">' +
                    '<button type="button" class="mini-btn" data-action="style-up" data-idx="' + i + '"' + upDisabled + '>↑</button>' +
                    '<button type="button" class="mini-btn" data-action="style-down" data-idx="' + i + '"' + downDisabled + '>↓</button>' +
                    '<button type="button" class="mini-btn danger" data-action="style-del" data-idx="' + i + '">✕ 删除</button>' +
                  '</span></div>' +
                '<div class="field"><label>风格名称</label>' +
                  '<input type="text" data-bind="creativeStyles.' + i + '.name" value="' + esc(s.name) + '"></div>' +
                '<div class="field"><label>创作要求</label>' +
                  '<textarea data-bind="creativeStyles.' + i + '.requirement" rows="2">' + esc(s.requirement) + '</textarea></div>' +
              '</div>';
            });
            html += '</div>' +
              '<button type="button" class="btn-ghost add-style-btn" data-action="style-add">＋ 新增创作风格</button>';
            return html;
          } },
        { id: 'tones', title: '语调预设', desc: '一组标签，作为工作台「主打语调」下拉的可选项；选中后作为素材的一部分传给模型。可增删。', tag: '语调',
          restore: ['tonePresets'],
          build: function () {
            var tones = state.working.tonePresets || [];
            var chips = tones.map(function (t, i) {
              return '<span class="tone-chip">' + esc(t) +
                '<button type="button" class="tone-del" data-action="tone-del" data-idx="' + i + '" title="删除">✕</button></span>';
            }).join('');
            return '<div class="tone-list">' + (chips || '<span class="card-desc">暂无语调预设，请在下方添加。</span>') + '</div>' +
              '<div class="tone-add"><input type="text" id="tone-input" placeholder="输入新语调，如：节日氛围" maxlength="20">' +
                '<button type="button" class="btn-ghost" data-action="tone-add">＋ 添加语调</button></div>';
          } },
        { id: 'preview', title: '实时预览', desc: '选一条示例素材，按角色分块展示最终会发给模型的内容；改模板时预览立即跟随变化，每块显示字数。', tag: '校验',
          build: function () {
            var opts = SAMPLES.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>'; }).join('');
            return '' +
              '<div class="field" style="max-width:440px"><label>示例素材</label><select id="sampleSel">' + opts + '</select></div>' +
              '<div class="preview-block"><div class="pb-head"><span class="pb-role">① 给模型的规范说明（system）</span><span class="pb-count" id="cnt-system">字数 0</span></div>' +
                '<pre class="pb-body" id="pv-system"></pre></div>' +
              '<div class="preview-block"><div class="pb-head"><span class="pb-role">② 拼装好的素材（user）</span><span class="pb-count" id="cnt-material">字数 0</span></div>' +
                '<pre class="pb-body" id="pv-material"></pre></div>' +
              '<p class="card-desc" style="margin-top:10px">改动上方任意模板 / 规范，预览会即时重算；未定义占位符将<strong>原样保留</strong>。</p>';
          } },
        { id: 'trial', title: '试运行（调试用）', desc: '用当前模板与模型配置真调一次，显示生成结果、耗时、消耗量以及接入方式与模型；结果仅用于调试，不写回工作台。', tag: '调试',
          build: function () {
            return '' +
              '<div class="trial-bar"><button class="btn-primary" id="btn-trial"><span class="play">▶</span> 试运行当前模板</button>' +
                '<span class="trial-hint">使用上方「示例素材」与「模型接入配置」</span></div>' +
              '<div id="trial-out"></div>';
          } }
      ]
    },

    products: {
      key: 'products', title: '商品库', sub: '运营可维护的商品清单（新增 / 编辑 / 删除）。数据按 服务端 → 本机浏览器 → 内置默认 三级读取，顶栏徽章显示当前生效来源；保存后工作台即时生效。',
      icon: ICON.products,
      sections: [
        { id: 'library', title: '商品库', desc: '支持卡片 / 表格两种视图，可按名称与卖点搜索、按品类筛选、按价格或品类排序；顶部统计随当前筛选结果实时更新。点「＋ 新增商品」用弹窗维护，右侧实时预览卡片。', tag: '可编辑',
          build: function () {
            return '<div id="prod-stats"></div>' + productToolbarHTML() +
              '<div id="prod-batchbar" class="batchbar hidden"></div>' +
              '<div id="prod-list"></div>' + productModalHTML() + batchModalsHTML() + importReviewModalHTML();
          } }
      ]
    },
    match: {
      key: 'match', title: '商品匹配', sub: '配置 matchGoods 的匹配方式：可走 Coze 工作流，也可改用大模型（分析新闻 → 生成关键词 → 在商品库检索推荐）。',
      icon: ICON.match,
      sections: [
        { id: 'mode', title: '匹配方式', desc: '选择「Coze 工作流」沿用既有链路，或「大模型」改用外接 LLM 分析新闻并检索商品库。', tag: '模式',
          build: function () {
            var mode = (state.working.matchGoods && state.working.matchGoods.mode) || 'coze';
            var cozeActive = mode === 'coze';
            var llmActive = mode === 'llm';
            return '' +
              '<div class="mode-grid">' +
                '<button class="mode-card ' + (cozeActive ? 'active' : '') + '" data-action="set-mode" data-value="coze">' +
                  '<div class="mode-ico">🅒</div>' +
                  '<div class="mode-name">Coze 工作流</div>' +
                  '<div class="mode-desc">沿用既有 matchGoods 工作流，由 Coze 知识库返回商品。</div>' +
                '</button>' +
                '<button class="mode-card ' + (llmActive ? 'active' : '') + '" data-action="set-mode" data-value="llm">' +
                  '<div class="mode-ico">⚡</div>' +
                  '<div class="mode-name">大模型 LLM</div>' +
                  '<div class="mode-desc">分析新闻生成关键词，在前端商品库检索并推荐命中商品。</div>' +
                '</button>' +
              '</div>' +
              (cozeActive
                ? '<p class="card-desc" style="margin-top:14px">当前：商品由 Coze 工作流实时匹配（价格 / 卖点为示例视觉）。</p>'
                : '<p class="card-desc" style="margin-top:14px">当前：将使用下方「大模型接入」与「匹配提示词」在工作台 Step2 执行匹配。</p>');
          } },
        { id: 'llm', title: '大模型接入', desc: '仅「大模型」模式需要。配置 OpenAI 兼容端点的 baseURL / apiKey / model；密钥仅存本机，不会写入服务端文件。', tag: '大模型',
          restore: ['llm'],
          build: function () {
            var l = state.working.llm || {};
            return '' +
              '<div class="field"><label>Base URL（OpenAI 兼容）</label>' +
                '<input type="text" data-bind="llm.baseURL" value="' + esc(l.baseURL || '') + '" placeholder="https://…/v1"></div>' +
              '<div class="field"><label>API Key</label>' +
                '<input type="password" data-bind="llm.apiKey" value="' + esc(l.apiKey || '') + '" placeholder="sk-…" autocomplete="off"></div>' +
              '<div class="field"><label>模型名</label>' +
                '<input type="text" data-bind="llm.model" value="' + esc(l.model || '') + '" placeholder="deepseek-v4-flash"></div>' +
              '<label class="sim-toggle"><input type="checkbox" data-bind="llm.simulate" ' + (l.simulate ? 'checked' : '') + '> 强制本地模拟（无密钥 / 勾选时，工作台用新闻关键词兜底匹配）</label>';
          } },
        { id: 'prompt', title: '匹配提示词（大模型模式）', desc: '下发给 LLM 的指令；用 {{title}} / {{brief}} 占位新闻标题与内容，运行期自动填充。', tag: '大模型',
          restore: ['matchGoods.prompt'],
          build: function () {
            var v = (state.working.matchGoods && state.working.matchGoods.prompt) || '';
            return '' +
              '<div class="ph-row">' +
                '<span class="ph-chip" data-ph="title">{{title}} 新闻标题</span>' +
                '<span class="ph-chip" data-ph="brief">{{brief}} 新闻内容</span>' +
              '</div>' +
              '<textarea data-bind="matchGoods.prompt" rows="16" class="ta-lg">' + esc(v) + '</textarea>' +
              '<p class="card-desc" style="margin-top:10px">要求：LLM 只输出一行商品关键词（用 、或 ，分隔），前端据其在商品库检索。若对应不出商品，输出「没有对应内容」。</p>' +
              '<button class="btn-ghost" data-action="test-match" style="margin-top:10px">⚡ 测试关键词提取（用示例新闻）</button>' +
              '<div id="match-test-out" class="trial-out-wrap"></div>';
          } }
      ]
    },
    news: {
      key: 'news', title: '新闻来源 · 抓取配置', sub: '把新闻抓取来源做成可配置：内置平台热榜 + 运营自定义订阅源；支持启用 / 停用、删除、真实抓取测试，并附合规与风控说明。',
      icon: ICON.news,
      sections: [
        { id: 'compliance', title: '合规提示', desc: '公开热榜接口仅适合原型演示；正式上线应改用官方开放平台或商业舆情服务，并遵守对方的爬虫协议与服务条款。', tag: '合规',
          build: function () { return complianceHTML(); } },
        { id: 'risk', title: '风险识别规则', desc: '系统会按关键词预判热点的借势风险，分为「禁止借势」与「需人工判断」两类，最终以人工审核为准。', tag: '风控',
          build: function () { return riskHTML(); } },
        { id: 'sources', title: '抓取来源', desc: '列出全部来源（内置平台热榜 + 自定义订阅源）。可逐个启用 / 停用，自定义来源可删除；点「测试全部来源」真实抓取并查看结果。', tag: '配置',
          build: function () { return '<div id="news-mgr"></div>'; } }
      ]
    },

    eval: {
      key: 'eval', title: '文案评测', sub: '配置「文案效果评测体系」的机器校验阈值、广告法违禁词库、模型评审与自动返工提示词；工作台「文案评测台」与 Step4 一键修正共用这一份。',
      icon: ICON.eval,
      sections: [
        { id: 'scoring', title: '评分权重与校验阈值', desc: '机器校验（硬性规则）与模型评审（四维评分）的合并权重；以及字数、emoji、话题标签等机器校验阈值。', tag: '评测',
          restore: ['eval.weightsMachine', 'eval.lengthMin', 'eval.lengthMax', 'eval.emojiMin', 'eval.emojiMax', 'eval.hashtagCountMax'],
          build: function () {
            var e = state.working.eval || {};
            var wm = (typeof e.weightsMachine === 'number') ? e.weightsMachine : 0.5;
            return '' +
              '<div class="field"><label>机器校验 / 模型评审 权重（默认各 50%）</label>' +
                '<div style="display:flex;align-items:center;gap:14px">' +
                  '<input type="range" id="eval-wm" min="0" max="100" step="5" value="' + Math.round(wm * 100) + '">' +
                  '<span class="kv"><span class="k">当前</span><span class="v" id="eval-wm-label"></span></span>' +
                '</div>' +
                '<p class="card-desc" style="margin-top:8px">机器校验占 <b id="eval-wm-m">50</b>%、模型评审占 <b id="eval-wm-r">50</b>%。关闭模型评审时此权重无效，仅用机器分。</p>' +
              '</div>' +
              '<div class="grid-2">' +
                '<div class="field"><label>字数下限</label><input type="number" data-bind="eval.lengthMin" value="' + esc(e.lengthMin) + '"></div>' +
                '<div class="field"><label>字数上限</label><input type="number" data-bind="eval.lengthMax" value="' + esc(e.lengthMax) + '"></div>' +
              '</div>' +
              '<div class="grid-2">' +
                '<div class="field"><label>emoji 最少</label><input type="number" data-bind="eval.emojiMin" value="' + esc(e.emojiMin) + '"></div>' +
                '<div class="field"><label>emoji 最多</label><input type="number" data-bind="eval.emojiMax" value="' + esc(e.emojiMax) + '"></div>' +
              '</div>' +
              '<div class="field"><label>话题标签总数上限</label><input type="number" data-bind="eval.hashtagCountMax" value="' + esc(e.hashtagCountMax) + '"></div>';
          } },
        { id: 'banned', title: '广告法违禁词库', desc: '命中即判为「硬伤」（最高权重，必走返工）。每行一个词，可在工作台评测台实时追加。', tag: '硬伤',
          restore: ['eval.bannedWords'],
          build: function () {
            var e = state.working.eval || {};
            return '<textarea data-bind="eval.bannedWords" rows="10" class="ta-lg">' + esc(e.bannedWords || '') + '</textarea>' +
              '<p class="card-desc" style="margin-top:10px">每行一个词。常用：最佳 / 最好 / 最低 / 第一 / 国家级 / 顶级 / 绝对 / 永久 / 百分百 / 全网最低 / 唯一 / 首选 / 冠军 / 领导品牌 / 完美 / 万能 / 极致 / 销量第一 / 独家 / 最低价 / 零风险 等。</p>';
          } },
        { id: 'review', title: '模型评审', desc: '独立调用一次模型，对热点关联度 / 素材还原度 / 传播吸引力 / 语气自然度 四维各打 1-5 分并给一句总评；低温度保证稳定。提示词可改。', tag: '模型',
          restore: ['eval.reviewPrompt', 'eval.reviewTemp', 'eval.model', 'eval.enabledReview'],
          build: function () {
            var e = state.working.eval || {};
            var on = e.enabledReview !== false;
            return '' +
              '<label class="sim-toggle"><input type="checkbox" data-bind="eval.enabledReview" ' + (on ? 'checked' : '') + '> 启用模型评审（关闭则总分只用机器校验）</label>' +
              '<div class="grid-2" style="margin-top:14px">' +
                '<div class="field"><label>评审模型名</label><input type="text" data-bind="eval.model" value="' + esc(e.model || '') + '" placeholder="留空用全局默认"></div>' +
                '<div class="field"><label>评审温度</label><input type="number" step="0.1" data-bind="eval.reviewTemp" value="' + esc(e.reviewTemp) + '"></div>' +
              '</div>' +
              '<div class="field" style="margin-top:12px"><label>模型评审提示词（输出严格 JSON）</label>' +
                '<textarea data-bind="eval.reviewPrompt" rows="13" class="ta-lg">' + esc(e.reviewPrompt || '') + '</textarea></div>';
          } },
        { id: 'rework', title: '自动返工', desc: '校验未过时，把「具体哪几项没过、为什么」原样交给模型修订并复验；只接受分数不降的版本，防止越改越差。提示词可改。', tag: '返工',
          restore: ['eval.reworkPrompt', 'eval.reworkMaxRounds', 'eval.reworkTemp', 'eval.concurrency', 'eval.repeats', 'eval.unitPrice', 'eval.simulate'],
          build: function () {
            var e = state.working.eval || {};
            return '' +
              '<div class="field"><label>返工提示词（低温度，照清单改错）</label>' +
                '<textarea data-bind="eval.reworkPrompt" rows="11" class="ta-lg">' + esc(e.reworkPrompt || '') + '</textarea></div>' +
              '<div class="grid-2" style="margin-top:12px">' +
                '<div class="field"><label>最大返工轮数</label><input type="number" data-bind="eval.reworkMaxRounds" value="' + esc(e.reworkMaxRounds) + '"></div>' +
                '<div class="field"><label>返工温度</label><input type="number" step="0.1" data-bind="eval.reworkTemp" value="' + esc(e.reworkTemp) + '"></div>' +
              '</div>' +
              '<div class="grid-2">' +
                '<div class="field"><label>并发数（评测台用）</label><input type="number" data-bind="eval.concurrency" value="' + esc(e.concurrency) + '"></div>' +
                '<div class="field"><label>每个用例重复次数</label><input type="number" data-bind="eval.repeats" value="' + esc(e.repeats) + '"></div>' +
              '</div>' +
              '<div class="grid-2">' +
                '<div class="field"><label>参考单价（元/次，用于成本估算）</label><input type="number" step="0.001" data-bind="eval.unitPrice" value="' + esc(e.unitPrice) + '"></div>' +
                '<div class="field"><label>&nbsp;</label><label class="sim-toggle" style="margin-top:8px"><input type="checkbox" data-bind="eval.simulate" ' + (e.simulate ? 'checked' : '') + '> 强制本地模拟（不真实调用模型）</label></div>' +
              '</div>';
          } }
      ]
    }
  };

  // 合规提示（静态说明）
  function complianceHTML() {
    return '' +
      '<div class="notice notice-warn">' +
        '<div class="notice-title">⚠️ 合规提示（上线前必读）</div>' +
        '<ul class="notice-list">' +
          '<li><b>公开热榜接口仅适合原型演示。</b>本页内置的微博 / 头条 / B站 / 知乎 / 百度热榜接口多为非官方、可能随时变动或被反爬限制，不应直接用于正式生产环境。</li>' +
          '<li><b>正式上线应改用官方开放平台或商业舆情服务</b>（如各平台开放 API、微博 OpenAPI、商业舆情 / 热点监测 SaaS），并遵守对方的<b>爬虫协议（robots.txt）与服务条款</b>。</li>' +
          '<li><b>控制抓取频率与用途：</b>避免高频请求对被抓取方造成压力；抓取内容仅用于内部选题参考，对外发布前需经人工审核与版权确认。</li>' +
          '<li><b>隐私与授权：</b>不得抓取需登录的隐私内容；涉及用户生成内容时遵守相关数据与隐私法规。</li>' +
        '</ul>' +
      '</div>';
  }
  // 风险识别规则（静态说明 + 关键字清单）
  function riskHTML() {
    return '' +
      '<div class="notice notice-info">' +
        '<div class="notice-title">🛡️ 风险识别规则</div>' +
        '<p class="card-desc">系统会按关键词预判热点能否借势。工作台 Step1 每条新闻右侧会标注风险等级：' +
          '<span class="risk-badge risk-ban">禁止借势</span> <span class="risk-badge risk-review">需人工判断</span> <span class="risk-badge risk-ok">可借势</span></p>' +
        '<div class="risk-cols">' +
          '<div class="risk-col"><div class="risk-h risk-ban">🚫 禁止借势（系统拦截，文案生成应拒绝）</div><ul class="notice-list">' +
            '<li>灾难与伤亡：地震、洪水、台风、海啸、泥石流、坠机、车祸、火灾、坍塌、爆炸、遇难、死亡、伤亡</li>' +
            '<li>公共卫生：疫情、新冠、隔离、病毒</li>' +
            '<li>暴力与违法：恐怖、枪击、战争、爆炸袭击、拐卖、性侵、家暴、校园欺凌</li>' +
            '<li>极端负面：自杀、自伤、坠楼、网暴受害者</li>' +
          '</ul></div>' +
          '<div class="risk-col"><div class="risk-h risk-review">⚠️ 需人工判断（标记后人工确认再用）</div><ul class="notice-list">' +
            '<li>未经证实：网传、疑似、辟谣、传闻、小道消息</li>' +
            '<li>名人私域：明星离婚、出轨、塌房、私人情感</li>' +
            '<li>争议话题：维权、投诉、315、数据造假、裁员、欠薪、罢工</li>' +
            '<li>敏感领域：医疗健康、减肥、投资理财、股票基金、房地产、考试录取</li>' +
          '</ul></div>' +
        '</div>' +
        '<p class="card-desc" style="margin-top:10px">规则为<b>关键词命中</b>的初级风控，存在漏判 / 误判可能，最终以人工审核为准。</p>' +
      '</div>';
  }

  /* ---------------- 评测页 ---------------- */
  // 权重滑块：原始 0-100 → 存为 0..1；同时刷新标签。不使用 data-bind（需 /100 换算）。
  function initEvalPage() {
    var s = document.getElementById('eval-wm');
    if (!s) return;
    function upd() {
      var pct = Number(s.value);
      setPath(state.working, 'eval.weightsMachine', pct / 100);
      var lbl = document.getElementById('eval-wm-label'); if (lbl) lbl.textContent = pct + '% / ' + (100 - pct) + '%';
      var m = document.getElementById('eval-wm-m'); if (m) m.textContent = pct;
      var r = document.getElementById('eval-wm-r'); if (r) r.textContent = (100 - pct);
      updateDirtyUI();
    }
    s.addEventListener('input', upd);
    upd();
  }

  /* ---------------- 渲染 ---------------- */
  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    return PAGES[h] ? h : 'general';
  }

  function updateBadge(source) {
    var map = {
      server:  { cls: 'source-server',  text: '数据来源 · 服务端' },
      local:   { cls: 'source-local',   text: '数据来源 · 本机浏览器' },
      default: { cls: 'source-default', text: '数据来源 · 内置默认' }
    };
    var m = map[source] || map.default;
    var badge = document.getElementById('source-badge');
    badge.className = 'source-badge ' + m.cls;
    badge.querySelector('.label').textContent = m.text;
  }

  function render() {
    var route = currentRoute();
    var page = PAGES[route];

    document.title = page.title + ' · 热点营销运营后台';
    document.getElementById('page-title').textContent = page.title;
    document.getElementById('page-sub').textContent = page.sub;

    // 内容区：卡片分节
    document.getElementById('content').innerHTML = page.sections.map(function (s) {
      var restoreBtn = s.restore
        ? '<button type="button" class="sec-restore" data-restore="' + s.id + '" title="仅把本区块恢复为内置默认（不重置其它配置）">恢复默认</button>'
        : '';
      return '<section class="card" id="sec-' + s.id + '">' +
        '<div class="card-head"><div class="card-title-row"><div class="card-title">' + esc(s.title) + '</div>' + restoreBtn + '</div>' +
        '<div class="card-tag">' + esc(s.tag) + '</div></div>' +
        '<p class="card-desc">' + esc(s.desc) + '</p>' +
        (s.build ? s.build() : '') + '</section>';
    }).join('');

    // 左侧组 1：本页配置区块（点击滚动定位）
    var secNav = document.getElementById('section-nav');
    secNav.innerHTML = page.sections.map(function (s) {
      return '<a class="nav-item" data-sec="' + s.id + '" href="javascript:void(0)">' + ICON.dot +
        '<span>' + esc(s.title) + '</span></a>';
    }).join('');
    Array.prototype.forEach.call(secNav.querySelectorAll('[data-sec]'), function (a) {
      a.addEventListener('click', function () {
        var el = document.getElementById('sec-' + a.getAttribute('data-sec'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // 左侧组 2：其它后台页面（hash 路由跳转，当前页高亮）
    var pageNav = document.getElementById('page-nav');
    pageNav.innerHTML = Object.keys(PAGES).map(function (k) {
      var p = PAGES[k];
      var active = (k === route) ? ' active' : '';
      return '<a class="nav-item' + active + '" href="#/' + k + '">' + p.icon + '<span>' + esc(p.title) + '</span></a>';
    }).join('');

    // 数据源页内的"清除本机缓存"按钮
    var ri = document.getElementById('btn-reset-inline');
    if (ri) ri.addEventListener('click', resetLocal);

    if (route === 'prompts') initPromptsPage();
    if (route === 'products') initProductsPage();
    if (route === 'news') initNewsPage();
    if (route === 'eval') initEvalPage();

    updateBadge(state.source);
    setupScrollSpy(page);
    updateDirtyUI();   // 渲染后同步底部栏「未保存」状态
  }

  // 滚动定位高亮当前区块
  function setupScrollSpy(page) {
    if (window.__adminIO) window.__adminIO.disconnect();
    var secNav = document.getElementById('section-nav');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id.replace('sec-', '');
          Array.prototype.forEach.call(secNav.querySelectorAll('[data-sec]'), function (a) {
            a.classList.toggle('active', a.getAttribute('data-sec') === id);
          });
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
    page.sections.forEach(function (s) {
      var el = document.getElementById('sec-' + s.id);
      if (el) io.observe(el);
    });
    window.__adminIO = io;
  }

  /* ---------------- 交互 ---------------- */
  // 支持 data-bind 嵌套路径（如 "prompt.system"）写入 state.working
  function setPath(obj, path, val) {
    var keys = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
  }

  // 记录最后聚焦的可编辑框（占位符清单点击时插入到此处光标）
  var lastFocus = null;
  function trackFocus(e) {
    var t = e.target;
    if (t && t.tagName === 'TEXTAREA' && t.getAttribute('data-bind')) lastFocus = t;
  }
  function closestAttr(el, attr) {
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute(attr)) return el.getAttribute(attr);
      el = el.parentNode;
    }
    return null;
  }
  // 在指定 textarea 光标处插入 token，并触发 input 事件同步到 state.working
  function insertToken(tok) {
    var ta = lastFocus;
    if (!ta) { toast('请先点一下要编辑的输入框，再点占位符插入'); return; }
    var s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
    var v = ta.value;
    ta.value = v.slice(0, s) + tok + v.slice(e);
    var pos = s + tok.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    toast('已插入 ' + tok);
  }

  function onInput(e) {
    var t = e.target;
    var bind = t.getAttribute('data-bind');
    if (!bind) return;
    if (bind === 'brandColor') {
      var bv = document.getElementById('brandVal');
      if (bv) bv.textContent = t.value;
      applyBrandColor(t.value);   // 实时预览：选色时立刻更新 :root 上整套品牌色变量
    }
    var val = (t.type === 'checkbox') ? t.checked
      : (t.type === 'number' && t.value !== '') ? Number(t.value)
      : t.value;
    setPath(state.working, bind, val);
    refreshPreview();   // 在 prompts 页即时更新预览（其它页无操作）
    updateDirtyUI();    // 任意输入都视为「有未保存改动」
  }

  /* ---------------- 脏状态（未保存改动）追踪 ---------------- */
  // savedSnapshot：上一次「已保存」时的完整配置快照；与当前 working 对比判断是否脏。
  function serializeWorking() { return JSON.stringify(state.working); }
  function setSavedSnapshot() { state.savedSnapshot = serializeWorking(); }
  function isDirty() {
    if (!state.savedSnapshot) return false;
    return serializeWorking() !== state.savedSnapshot;
  }
  // 底部操作栏提示：脏 → 显眼「有未保存的改动」；干净 → 「所有改动已保存」
  function updateDirtyUI() {
    var hint = document.getElementById('save-hint');
    if (!hint) return;
    if (isDirty()) {
      hint.className = 'bottombar-hint dirty';
      hint.innerHTML = '● <b>有未保存的改动</b> · ' + (isHttp ? '将保存到服务端' : '将保存到本机浏览器');
    } else {
      hint.className = 'bottombar-hint';
      hint.textContent = '所有改动已保存' + (isHttp ? '（服务端）' : '（本机浏览器）');
    }
  }

  // 分区块恢复默认：仅把该 section 的字段重置为内置默认值，并标脏。
  function getPath(obj, path) {
    var keys = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur == null) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }
  function restoreSection(sectionId) {
    var page = PAGES[currentRoute()];
    var sec = null;
    for (var i = 0; i < page.sections.length; i++) { if (page.sections[i].id === sectionId) { sec = page.sections[i]; break; } }
    if (!sec || !sec.restore) return;
    var paths = Array.isArray(sec.restore) ? sec.restore : [sec.restore];
    paths.forEach(function (p) { setPath(state.working, p, deepClone(getPath(BUILTIN_DEFAULTS, p))); });
    render();
    toast('已恢复「' + sec.title + '」为默认（记得保存）');
  }

  /* ---------------- 新闻来源管理页 ---------------- */
  var lastNewsTest = null;  // 最近一次 /api/news-test 的结果，按 id 索引

  function initNewsPage() {
    renderNewsMgr();
  }

  // 单个来源的渲染行
  function newsSourceRowHTML(s) {
    var kindLabel = ({ rss: 'RSS/Atom', json: 'JSON', weibo: '微博热搜', toutiao: '今日头条', bilibili: 'B站热门', zhihu: '知乎热榜', baidu: '百度热点' })[s.kind] || s.kind;
    var res = lastNewsTest && lastNewsTest[s.id];
    var resHTML = '';
    if (res) {
      if (res.ok) {
        resHTML = '<span class="src-test ok">✓ 成功 · 抓到 ' + res.count + ' 条 · ' + res.ms + 'ms</span>';
      } else {
        resHTML = '<span class="src-test fail" title="' + esc(res.error || '') + '">✗ 失败 · ' + res.ms + 'ms · ' + esc((res.error || '').slice(0, 40)) + '</span>';
      }
    }
    var toggleCls = s.enabled ? 'on' : '';
    var delBtn = s.builtin
      ? '<span class="src-badge-builtin">内置</span>'
      : '<button class="src-del" data-action="news-del" data-id="' + esc(s.id) + '">删除</button>';
    return '<div class="src-row ' + (s.enabled ? '' : 'disabled') + '">' +
      '<button class="src-toggle ' + toggleCls + '" data-action="news-toggle" data-id="' + esc(s.id) + '" title="启用 / 停用">' +
        '<span class="dot"></span>' + (s.enabled ? '已启用' : '已停用') +
      '</button>' +
      '<div class="src-main">' +
        '<div class="src-name">' + esc(s.name) + ' <span class="src-kind">' + esc(kindLabel) + '</span></div>' +
        '<div class="src-url">' + esc(s.url) + '</div>' +
        resHTML +
      '</div>' +
      delBtn +
    '</div>';
  }

  function renderNewsMgr() {
    var box = document.getElementById('news-mgr');
    if (!box) return;
    var srcs = state.working.newsSources || [];
    var enabledCnt = srcs.filter(function (s) { return s.enabled; }).length;
    var html =
      '<div class="news-toolbar">' +
        '<div class="news-stat">共 ' + srcs.length + ' 个来源 · 已启用 ' + enabledCnt + ' 个</div>' +
        '<button class="btn-primary" data-action="news-test">⚡ 测试全部来源</button>' +
      '</div>' +
      '<div class="src-list">' + srcs.map(newsSourceRowHTML).join('') + '</div>' +
      '<div class="news-add">' +
        '<div class="news-add-title">＋ 添加自定义订阅源</div>' +
        '<div class="news-add-grid">' +
          '<div class="field"><label>来源名称</label><input type="text" id="news-name" placeholder="如：36氪快讯"></div>' +
          '<div class="field"><label>订阅地址（URL）</label><input type="text" id="news-url" placeholder="https://example.com/feed.xml"></div>' +
          '<div class="field"><label>类型</label>' +
            '<select id="news-kind">' +
              '<option value="rss">RSS / Atom（XML）</option>' +
              '<option value="json">JSON（自定义路径）</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="news-json-paths" id="news-json-paths" style="display:none">' +
          '<div class="field"><label>数组路径（留空=根数组）</label><input type="text" id="news-jitems" placeholder="如 items 或 data.list"></div>' +
          '<div class="field"><label>标题字段</label><input type="text" id="news-jtitle" placeholder="title（默认）"></div>' +
          '<div class="field"><label>摘要字段</label><input type="text" id="news-jbrief" placeholder="summary（默认）"></div>' +
          '<div class="field"><label>链接字段</label><input type="text" id="news-jurl" placeholder="url（默认）"></div>' +
        '</div>' +
        '<div class="news-add-foot">' +
          '<span class="card-desc">URL 须以 http:// 或 https:// 开头，且为合法地址。RSS 自动解析；JSON 按字段路径提取。</span>' +
          '<button class="btn-primary" data-action="news-add">添加来源</button>' +
        '</div>' +
      '</div>' +
      '<div class="news-test-panel"><div class="news-test-title">抓取测试</div><div id="news-test-out" class="news-test-out"><span class="ref-note">点「测试全部来源」进行真实抓取，结果将显示在这里。</span></div></div>';

    box.innerHTML = html;

    // JSON 路径区随类型显隐
    var kindSel = document.getElementById('news-kind');
    var jp = document.getElementById('news-json-paths');
    if (kindSel && jp) {
      kindSel.addEventListener('change', function () {
        jp.style.display = kindSel.value === 'json' ? 'block' : 'none';
      });
    }
    // 若已有上次测试结果，回填到面板
    if (lastNewsTest) renderTestResults({ ok: true, total: Object.keys(lastNewsTest).length, results: Object.keys(lastNewsTest).map(function (k) {
      var r = lastNewsTest[k]; return { id: k, name: r.name, ok: r.ok, count: r.count, ms: r.ms, error: r.error, url: r.url, kind: r.kind };
    }) });
  }

  function testNewsSources() {
    var out = document.getElementById('news-test-out');
    if (out) out.innerHTML = '<div class="test-loading">正在逐个抓取，请稍候…</div>';
    fetch('/api/news-test', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { renderTestResults(d); })
      .catch(function (e) { if (out) out.innerHTML = '<div class="ref-note">测试失败：' + esc(String((e && e.message) || e)) + '</div>'; });
  }

  function renderTestResults(d) {
    var out = document.getElementById('news-test-out');
    if (!out) return;
    var results = (d && d.results) || [];
    if (!results.length) { out.innerHTML = '<div class="ref-note">没有已启用的来源（请先启用至少一个来源）。</div>'; return; }
    // 缓存到 lastNewsTest（带名称）供来源行内联展示
    lastNewsTest = {};
    results.forEach(function (r) { lastNewsTest[r.id] = { ok: r.ok, count: r.count, ms: r.ms, error: r.error, name: r.name, url: r.url, kind: r.kind }; });
    var rows = results.map(function (r) {
      var status = r.ok
        ? '<span class="src-test ok">✓ 成功</span>'
        : '<span class="src-test fail">✗ 失败</span>';
      var detail = r.ok
        ? '抓到 <b>' + r.count + '</b> 条 · ' + r.ms + 'ms'
        : (esc((r.error || '未知错误').slice(0, 80)) + ' · ' + r.ms + 'ms');
      return '<div class="test-row ' + (r.ok ? 'ok' : 'fail') + '">' +
        '<div class="test-row-head">' + status + '<span class="test-name">' + esc(r.name) + '</span>' +
          '<span class="test-kind">' + esc(r.kind || '') + '</span></div>' +
        '<div class="test-row-url">' + esc(r.url || '') + '</div>' +
        '<div class="test-row-detail">' + detail + '</div>' +
      '</div>';
    }).join('');
    var summary = '<div class="test-summary">共 ' + results.length + ' 个来源 · 成功 ' +
      results.filter(function (r) { return r.ok; }).length + ' · 失败 ' +
      results.filter(function (r) { return !r.ok; }).length + '</div>';
    out.innerHTML = summary + rows;
    // 同步刷新来源行内联结果
    renderNewsMgr();
  }

  // 处理创作风格 / 语调预设 的结构化操作（新增 / 删除 / 上下移）
  function handleAction(action, el) {
    var idx = parseInt(el.getAttribute('data-idx') || '-1', 10);
    var styles = state.working.creativeStyles;
    if (!Array.isArray(styles)) { styles = state.working.creativeStyles = []; }

    if (action === 'style-up') {
      if (idx > 0) { var a = styles[idx - 1]; styles[idx - 1] = styles[idx]; styles[idx] = a; render(); }
    } else if (action === 'style-down') {
      if (idx >= 0 && idx < styles.length - 1) { var b = styles[idx + 1]; styles[idx + 1] = styles[idx]; styles[idx] = b; render(); }
    } else if (action === 'style-del') {
      // 至少保留 1 个：删到 0 拦住并给出说明
      if (styles.length <= 1) {
        toast('至少需保留 1 个创作风格，无法删除最后一个。');
        return;
      }
      styles.splice(idx, 1);
      render();
    } else if (action === 'style-add') {
      styles.push({ name: '新风格', requirement: '' });
      render();
    } else if (action === 'tone-del') {
      var tones = state.working.tonePresets || [];
      if (idx >= 0 && idx < tones.length) { tones.splice(idx, 1); render(); }
    } else if (action === 'tone-add') {
      var input = document.getElementById('tone-input');
      var val = input ? input.value.trim() : '';
      if (!val) { toast('请输入语调名称'); return; }
      var tones2 = state.working.tonePresets;
      if (!Array.isArray(tones2)) { tones2 = state.working.tonePresets = []; }
      if (tones2.indexOf(val) >= 0) { toast('该语调已存在'); return; }
      tones2.push(val);
      render();
    }
    // ---- 商品匹配页：模式切换 / 测试 ----
    if (action === 'set-mode') {
      var mv = el.getAttribute('data-value') || 'coze';
      state.working.matchGoods = state.working.matchGoods || {};
      state.working.matchGoods.mode = mv === 'llm' ? 'llm' : 'coze';
      render();
      return;
    } else if (action === 'test-match') {
      testMatch();
      return;
    }
    // ---- 商品库：弹窗与行内操作 ----
    else if (action === 'prod-emoji') {
      var em = el.getAttribute('data-emoji') || '';
      setVal('pf-emoji', em); markSelectedEmoji(em); renderProductPreview();
    } else if (action === 'prod-grad') {
      var gc = el.getAttribute('data-css') || '';
      setVal('pf-gradient', gc); markSelectedGrad(gc); renderProductPreview();
    } else if (action === 'prod-tag-del') {
      var ti = parseInt(el.getAttribute('data-idx') || '-1', 10);
      if (ti >= 0 && ti < modalTags.length) {
        modalTags.splice(ti, 1); renderTags(); renderProductPreview();
        showProductErrors(validateProductForm(getProductForm()));
      }
    } else if (action === 'prod-save') {
      saveProductModal();
    } else if (action === 'prod-cancel') {
      closeProductModal();
    } else if (action === 'prod-edit') {
      var eid = el.getAttribute('data-id');
      var ep = null;
      (state.working.products || []).forEach(function (p) { if (p.id === eid) ep = p; });
      if (ep) openProductModal(ep);
    } else if (action === 'prod-del') {
      var did = el.getAttribute('data-id');
      if (did) deleteProduct(did);
    }
    // ---- 商品库：批量操作 ----
    else if (action === 'batch-selall') {
      setSelAll(getFilteredProducts().map(function (p) { return p.id; }));
      syncSelectionUI();
    } else if (action === 'batch-clear') {
      clearSel(); syncSelectionUI();
    } else if (action === 'batch-cat') {
      openBatchCat();
    } else if (action === 'batch-cat-cancel') {
      closeBatchCat();
    } else if (action === 'batch-cat-confirm') {
      applyBatchCat();
    } else if (action === 'batch-del') {
      openBatchDelete();
    } else if (action === 'batch-del-cancel') {
      closeBatchDel();
    } else if (action === 'batch-del-confirm') {
      confirmBatchDelete();
    }
    // ---- 商品库：导入预览 / 校验 ----
    else if (action === 'imp-review-cancel') {
      closeImportReview(); pendingImport = null;
    } else if (action === 'imp-review-confirm') {
      confirmImport();
    }
    // ---- 新闻来源管理 ----
    else if (action === 'news-test') {
      testNewsSources();
    } else if (action === 'news-toggle') {
      var tid = el.getAttribute('data-id');
      var tsrcs = state.working.newsSources || [];
      for (var ti = 0; ti < tsrcs.length; ti++) {
        if (tsrcs[ti].id === tid) { tsrcs[ti].enabled = !tsrcs[ti].enabled; break; }
      }
      updateDirtyUI();
      renderNewsMgr();
      toast('已' + (function () { for (var i = 0; i < (state.working.newsSources || []).length; i++) { if (state.working.newsSources[i].id === tid) return state.working.newsSources[i].enabled ? '启用' : '停用'; } return ''; })() + '，记得保存生效');
    } else if (action === 'news-del') {
      var did = el.getAttribute('data-id');
      if (!window.confirm('确定删除该自定义来源？此操作需点「保存」才生效。')) return;
      state.working.newsSources = (state.working.newsSources || []).filter(function (s) { return s.id !== did; });
      updateDirtyUI();
      renderNewsMgr();
      toast('已删除来源（记得保存生效）');
    } else if (action === 'news-add') {
      var nname = (document.getElementById('news-name') || {}).value || '';
      var nurl = (document.getElementById('news-url') || {}).value || '';
      var nkind = (document.getElementById('news-kind') || {}).value || 'rss';
      nname = (nname || '').trim(); nurl = (nurl || '').trim();
      if (!nname) { toast('请填写来源名称'); return; }
      if (!/^https?:\/\//i.test(nurl)) { toast('地址格式不正确：须以 http:// 或 https:// 开头'); return; }
      try { new URL(nurl); } catch (e) { toast('地址不是合法 URL：' + nurl); return; }
      var ns = { id: 'src-' + Date.now().toString(36), name: nname, url: nurl, kind: nkind, enabled: true, builtin: false };
      if (nkind === 'json') {
        ns.jsonItemsPath = (document.getElementById('news-jitems') || {}).value.trim() || '';
        ns.jsonTitlePath = (document.getElementById('news-jtitle') || {}).value.trim() || 'title';
        ns.jsonBriefPath = (document.getElementById('news-jbrief') || {}).value.trim() || 'summary';
        ns.jsonUrlPath = (document.getElementById('news-jurl') || {}).value.trim() || 'url';
      }
      state.working.newsSources = (state.working.newsSources || []).concat([ns]);
      updateDirtyUI();
      renderNewsMgr();
      toast('已添加来源「' + nname + '」，记得点「保存」生效');
    }
  }

  // 把当前 working 持久化到本机（始终作为镜像缓存，保证 file:// 模式与工作台一致）
  function persistLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.working)); } catch (e) { }
    try { localStorage.setItem(LS_LLM_KEY, JSON.stringify(state.working.llm || {})); } catch (e) { }
  }

  function save() {
    // 1) 先做一次格式校验（防止客户端误生成空内容）
    var v = validateAdminConfig(state.working);
    if (!v.ok) { toast('无法保存：' + v.error); return; }

    // 服务端写入前剥离 apiKey：密钥只留在本机 localStorage，避免落到服务端文件被 GET 回显
    var payloadObj = JSON.parse(JSON.stringify(state.working));
    if (payloadObj.llm) { delete payloadObj.llm.apiKey; }
    var payload = JSON.stringify(payloadObj);
    // 2) 经 HTTP → 优先写服务端（带备份）；失败则回退本机
    if (isHttp) {
      fetch('/api/admin-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.status >= 200 && res.status < 300 && res.data && res.data.ok) {
            persistLocal();                 // 镜像到本机，保证工作台 / file:// 兜底一致
            setSavedSnapshot();
            toast('已保存到服务端' + (res.data.backup ? '（已备份上一版）' : ''));
            if (currentRoute() === 'datasource') render();
          } else {
            var msg = (res.data && res.data.error) ? res.data.error : ('服务端拒绝（HTTP ' + res.status + '）');
            // 服务端拒绝（如关键内容为空）→ 不改任何东西，明确告知
            toast('服务端未保存：' + msg);
          }
        })
        .catch(function () {
          persistLocal();
          setSavedSnapshot();
          toast('服务端写入失败，已保存到本机浏览器（下次以本机为准）');
          if (currentRoute() === 'datasource') render();
        });
      return;
    }
    // 3) file:// 模式 → 只能写本机
    persistLocal();
    setSavedSnapshot();
    toast('已保存到本机浏览器');
    if (currentRoute() === 'datasource') render();
  }

  function resetLocal() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { }
    state.config = deepClone(BUILTIN_DEFAULTS);
    state.working = deepClone(BUILTIN_DEFAULTS);
    state.source = 'default';
    setSavedSnapshot();
    render();
    toast('已重置为内置默认（记得保存以同步服务端）');
  }

  // 导出当前配置为 JSON 文件
  function exportConfig() {
    var data = JSON.stringify(state.working, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = 'admin-config-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('已导出当前配置为文件');
  }

  // 导入配置：先校验再载入，坏文件明确报错且不改动原配置
  function importConfig(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        toast('导入失败：文件不是合法 JSON（' + e.message + '）');
        return;
      }
      var v = validateAdminConfig(parsed);
      if (!v.ok) {
        toast('导入失败：' + v.error);
        return;
      }
      state.working = normalizeConfig(parsed);   // 补默认后载入
      render();                                   // 标脏（savedSnapshot 未更新）
      toast('已导入配置（尚未保存，请点保存生效）');
    };
    reader.onerror = function () { toast('导入失败：文件读取错误'); };
    reader.readAsText(file);
  }

  function reprobe() {
    loadConfig().then(function (res) {
      state.config = res.config;
      state.source = res.source;
      state.working = deepClone(res.config);
      injectLocalLLM();
      setSavedSnapshot();
      render();
      applyBrandColor(res.config.brandColor);
      toast('数据源：' + sourceText(res.source));
    });
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    document.querySelector('.topbar-right a[href="http://localhost:5173/"]').href = WORKBENCH_URL;
    document.getElementById('reprobe').addEventListener('click', reprobe);
    document.getElementById('btn-save').addEventListener('click', save);
    document.getElementById('btn-reset').addEventListener('click', resetLocal);
    document.getElementById('btn-export').addEventListener('click', exportConfig);
    document.getElementById('btn-import').addEventListener('click', function () {
      var inp = document.getElementById('import-file');
      if (inp) inp.click();
    });
    var importInput = document.getElementById('import-file');
    if (importInput) importInput.addEventListener('change', function (e) {
      var f = e.target && e.target.files && e.target.files[0];
      importConfig(f);
      e.target.value = '';   // 允许再次选同一文件
    });
    document.getElementById('content').addEventListener('input', onInput);
    document.getElementById('content').addEventListener('change', onInput); // 让 radio 等控件也触发 data-bind 写入
    // 占位符清单：记录聚焦的输入框 + 点击插入到光标处
    document.getElementById('content').addEventListener('focusin', trackFocus);
    document.getElementById('content').addEventListener('click', function (e) {
      var ph = closestAttr(e.target, 'data-ph');
      if (ph) { insertToken('{{' + ph + '}}'); return; }
      var restore = closestAttr(e.target, 'data-restore');
      if (restore) { restoreSection(restore); return; }
      var action = closestAttr(e.target, 'data-action');
      if (action) handleAction(action, e.target);
    });
    window.addEventListener('hashchange', render);
    // 保存快捷键 Ctrl/Cmd + S
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        save();
      }
    });
    // 有未保存改动时离开页面（刷新 / 关闭 / 跳走）拦截提醒
    window.addEventListener('beforeunload', function (e) {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    loadConfig().then(function (res) {
      state.config = res.config;
      state.source = res.source;
      state.working = deepClone(res.config);
      injectLocalLLM();
      setSavedSnapshot();
      render();
      applyBrandColor(res.config.brandColor);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
