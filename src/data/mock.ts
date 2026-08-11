import type { NewsItem, Product, MatchedProduct } from "../types";

export const mockNews: NewsItem[] = [
  {
    id: "n1",
    title: "《黑神话：悟空》全球销量突破3000万份，国产3A游戏里程碑",
    summary: "游戏科学官方宣布《黑神话：悟空》全平台销量突破3000万份，成为中国游戏史上最畅销作品。Steam同时在线人数再创新高，海外媒体评分持续走高。",
    source: "36氪",
    time: "10分钟前",
    heat: 98,
    category: "游戏",
    keywords: ["黑神话悟空", "国产3A", "销量", "游戏"],
  },
  {
    id: "n2",
    title: "华为 Mate 70 系列发布：搭载纯血鸿蒙，起售价5499元",
    summary: "华为正式发布 Mate 70 系列旗舰手机，首发搭载 HarmonyOS NEXT 纯血鸿蒙系统，不再兼容安卓应用。全系支持卫星通信，Pro版配备钛金属中框。",
    source: "界面新闻",
    time: "25分钟前",
    heat: 95,
    category: "科技",
    keywords: ["华为", "Mate70", "鸿蒙", "手机"],
  },
  {
    id: "n3",
    title: "多地气温突破40°C，清凉家电销量暴涨300%",
    summary: "全国多地持续高温红色预警，上海、杭州、成都等城市气温突破40°C。京东数据显示，空调、风扇、制冰机等清凉家电销量同比增长超300%。",
    source: "央视财经",
    time: "1小时前",
    heat: 92,
    category: "生活",
    keywords: ["高温", "空调", "清凉家电", "热销"],
  },
  {
    id: "n4",
    title: "《繁花》续集官宣：胡歌、马伊琍原班人马回归",
    summary: "王家卫导演宣布《繁花》续集正式启动，胡歌、马伊琍、唐嫣等原班人马悉数回归。故事将聚焦90年代上海外贸行业，预计明年开机。",
    source: "新浪娱乐",
    time: "2小时前",
    heat: 88,
    category: "娱乐",
    keywords: ["繁花", "胡歌", "王家卫", "电视剧"],
  },
  {
    id: "n5",
    title: "骑行热潮持续：城市骑行装备市场规模突破千亿",
    summary: "中国自行车协会发布报告，2026年城市骑行装备市场规模突破千亿元。骑行服、智能头盔、骑行眼镜等品类增长迅猛，年轻女性成为消费主力。",
    source: "经济日报",
    time: "3小时前",
    heat: 85,
    category: "消费",
    keywords: ["骑行", "装备", "户外运动", "消费"],
  },
  {
    id: "n6",
    title: "AI 陪伴机器人走红：孤独经济催生千亿新赛道",
    summary: "多家科技公司推出 AI 陪伴机器人产品，搭载大语言模型实现情感交互。单月销售额突破10亿元，主要购买人群为独居青年和银发族。",
    source: "晚点LatePost",
    time: "4小时前",
    heat: 82,
    category: "科技",
    keywords: ["AI", "陪伴机器人", "孤独经济", "大模型"],
  },
  {
    id: "n7",
    title: "中秋国庆连休8天，旅游平台机票搜索量暴涨500%",
    summary: "2026年中秋国庆假期安排出炉，连休8天。携程、飞猪等平台数据显示，机票搜索量暴涨500%，三亚、大理、延吉等目的地酒店预订量翻倍。",
    source: "澎湃新闻",
    time: "5小时前",
    heat: 80,
    category: "旅游",
    keywords: ["中秋", "国庆", "旅游", "机票"],
  },
  {
    id: "n8",
    title: "新茶饮品牌集体降价：9.9元奶茶时代来临",
    summary: "喜茶、奈雪、霸王茶姬等头部新茶饮品牌相继宣布降价，主力产品价格降至9.9-15元区间。行业分析认为，供应链优化和规模效应是降价主因。",
    source: "第一财经",
    time: "6小时前",
    heat: 78,
    category: "消费",
    keywords: ["新茶饮", "降价", "奶茶", "消费"],
  },
];

export const mockProducts: Product[] = [
  {
    id: "p1",
    name: "游戏鼠标垫 黑神话悟空联名款 900×400mm",
    price: 89,
    originalPrice: 129,
    image: "game",
    selling: ["联名授权", "精密锁边", "防滑底面", "RGB灯效"],
    category: "游戏外设",
    matchKeywords: ["黑神话悟空", "游戏", "国产3A"],
  },
  {
    id: "p2",
    name: "华为 Mate 70 Pro 钛金属保护壳 磁吸款",
    price: 149,
    originalPrice: 199,
    image: "phone",
    selling: ["钛金属质感", "MagSafe磁吸", "防摔军工级", "轻薄0.8mm"],
    category: "手机配件",
    matchKeywords: ["华为", "Mate70", "手机"],
  },
  {
    id: "p3",
    name: "桌面迷你空调扇 制冷加湿三合一 静音款",
    price: 168,
    originalPrice: 259,
    image: "fan",
    selling: ["3秒速冷", "大容量水箱", "静音30dB", "USB供电"],
    category: "清凉家电",
    matchKeywords: ["高温", "空调", "清凉家电", "热销"],
  },
  {
    id: "p4",
    name: "繁花同款 90年代复古丝巾 上海老字号",
    price: 68,
    originalPrice: 98,
    image: "scarf",
    selling: ["繁花同款", "真丝材质", "上海风情", "送礼佳品"],
    category: "服饰配饰",
    matchKeywords: ["繁花", "胡歌", "王家卫", "电视剧"],
  },
  {
    id: "p5",
    name: "城市骑行头盔 智能款 蓝牙通话+LED警示灯",
    price: 329,
    originalPrice: 459,
    image: "helmet",
    selling: ["蓝牙5.3", "智能灯光", "MIPS保护", "轻量280g"],
    category: "骑行装备",
    matchKeywords: ["骑行", "装备", "户外运动", "消费"],
  },
  {
    id: "p6",
    name: "AI 智能陪伴机器人 桌面版 语音对话+情绪识别",
    price: 599,
    originalPrice: 899,
    image: "robot",
    selling: ["GPT大模型", "情绪识别", "儿童模式", "IoT控制"],
    category: "智能硬件",
    matchKeywords: ["AI", "陪伴机器人", "孤独经济", "大模型"],
  },
  {
    id: "p7",
    name: "便携旅行收纳套装 6件套 防水压缩袋",
    price: 49,
    originalPrice: 79,
    image: "travel",
    selling: ["防水材质", "压缩收纳", "6件套装", "轻便出行"],
    category: "旅行用品",
    matchKeywords: ["中秋", "国庆", "旅游", "机票"],
  },
  {
    id: "p8",
    name: "冻干柠檬片 即冲即饮 独立包装 100片",
    price: 29.9,
    originalPrice: 49.9,
    image: "tea",
    selling: ["FD冻干技术", "无添加糖", "独立包装", "冷热双泡"],
    category: "食品饮料",
    matchKeywords: ["新茶饮", "降价", "奶茶", "消费"],
  },
  {
    id: "p9",
    name: "氮化镓充电器 100W 三口快充 折叠插脚",
    price: 129,
    originalPrice: 199,
    image: "charger",
    selling: ["GaN氮化镓", "100W大功率", "三口同时充", "折叠便携"],
    category: "数码配件",
    matchKeywords: ["华为", "手机", "科技"],
  },
  {
    id: "p10",
    name: "复古骑行背包 防水卷口设计 25L大容量",
    price: 199,
    originalPrice: 299,
    image: "bag",
    selling: ["防水面料", "卷口设计", "25L容量", "反光条"],
    category: "骑行装备",
    matchKeywords: ["骑行", "装备", "户外运动", "消费"],
  },
];

// 基于关键词重叠计算「新闻-商品」匹配度（模拟推荐算法，真实场景由 Coze 工作流完成）
// 第二参数 products 允许传入「本地商品库」（运营在后台维护的单一数据源），
// 这样新增的商品也能被本地匹配算法推荐出来。
export function getMatchScores(newsId: string, products: Product[] = mockProducts): MatchedProduct[] {
  const news = mockNews.find((n) => n.id === newsId);
  if (!news) return [];

  return products
    .map((product) => {
      const kws = product.matchKeywords && product.matchKeywords.length ? product.matchKeywords : [];
      const matched = kws.filter((kw) =>
        news.keywords.some((nk) => nk.includes(kw) || kw.includes(nk))
      );
      const score = Math.round(
        (matched.length / Math.max(kws.length, 1)) * 100
      );
      return {
        product,
        score: Math.min(score + Math.floor(Math.random() * 12), 98),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// 生成多版本微博营销文案（离线兜底；真实数据由 Coze 工作流返回 output_red_list）
export function generateMockCopies(news: NewsItem, products: Product[]): string[] {
  const used = products.length ? products : [];
  const kw = news.keywords[0] || "热点";
  const names = used.map((p) => p.name);
  const priceLines = used.length
    ? used.map((p) => `💰 ${p.name} 限时 ¥${p.price}（原价 ¥${p.originalPrice}）`).join("\n")
    : "";
  const sellingAll = Array.from(new Set(used.flatMap((p) => p.selling))).slice(0, 4);
  const sellingLine = sellingAll.map((s) => `✅ ${s}`).join("\n");
  const tags = `#${kw}# #好物推荐# #限时抢购#`;

  const v0 = `🔥【爆款速递】${news.title.split("：")[0] || news.title}！

💕 小编结合热点第一时间挖到宝藏好物：
${priceLines}

${sellingLine}

${tags}

👇 戳链接，手慢无！`;

  const v1 = `家人们谁懂啊！${news.title.slice(0, 26)}...

✅ 趁热安利 👉 ${names.join("、")}
🎆 核心卖点：${sellingAll.join("、")}

${tags}

🔥 这波不冲更待何时？评论区告诉我你冲不冲！`;

  const v2 = `📢 热点来了！${news.title.slice(0, 22)}…

📦 精选搭配好物：
${priceLines}
✨ ${sellingLine}

${tags}

💰 转发+关注，抽粉丝送同款好物！`;

  return [v0, v1, v2];
}
