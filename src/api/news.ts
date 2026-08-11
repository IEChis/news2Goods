/**
 * 新闻抓取（可配置来源，不再依赖 Coze 工作流）。
 *
 * - runFetchNews()：调用同源 /api/news，由 Vite 开发服务器按「已启用」的新闻来源
 *   真实抓取并聚合为 NewsItem[]（每条带 source 名称）。工作台 Step1 使用它。
 * - classifyRisk(title)：按关键词预判热点借势风险，返回 'ban' | 'review' | 'ok'，
 *   供 Step1 在每条新闻上标注风险等级。
 *
 * 解析与风控规则的服务端实现在 vite.config.ts（newsRelay），此处为工作台侧的纯函数副本，
 * 用于前端展示，与服务端规则保持一致。
 */
import type { NewsItem } from "../types";

export async function runFetchNews(): Promise<NewsItem[]> {
  const resp = await fetch("/api/news", { cache: "no-store" });
  if (!resp.ok) throw new Error("新闻聚合接口返回 HTTP " + resp.status);
  const data = await resp.json();
  const news: NewsItem[] = Array.isArray(data.news) ? data.news : [];
  if (!news.length) {
    throw new Error("未抓到任何新闻：请确认至少有一个来源已启用且可访问（后台「新闻来源」页可测试）");
  }
  return news;
}

export type RiskLevel = "ban" | "review" | "ok";

export interface RiskResult {
  level: RiskLevel;
  reason: string;
}

const BAN_KEYWORDS = [
  "地震", "洪水", "台风", "海啸", "泥石流", "坠机", "车祸", "火灾", "坍塌", "爆炸",
  "遇难", "死亡", "伤亡", "疫情", "新冠", "隔离", "病毒", "恐怖", "枪击", "战争",
  "爆炸袭击", "拐卖", "性侵", "家暴", "校园欺凌", "自杀", "自伤", "坠楼", "网暴",
];

const REVIEW_KEYWORDS = [
  "网传", "疑似", "辟谣", "传闻", "小道消息", "离婚", "出轨", "塌房", "私人情感",
  "维权", "投诉", "315", "数据造假", "裁员", "欠薪", "罢工", "医疗", "健康", "减肥",
  "投资", "理财", "股票", "基金", "房地产", "考试", "录取",
];

export function classifyRisk(title: string): RiskResult {
  const t = title || "";
  for (const k of BAN_KEYWORDS) {
    if (t.indexOf(k) >= 0) return { level: "ban", reason: "命中禁止借势关键词：「" + k + "」" };
  }
  for (const k of REVIEW_KEYWORDS) {
    if (t.indexOf(k) >= 0) return { level: "review", reason: "命中需人工判断关键词：「" + k + "」" };
  }
  return { level: "ok", reason: "未命中风险关键词" };
}
