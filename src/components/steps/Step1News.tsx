import { useMemo, useState } from "react";
import { Search, Flame, ArrowRight, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { useWorkflow } from "../../context/WorkflowContext";
import { PageHeader, PrimaryActionButton } from "../Shared";
import Thumb from "../Thumb";
import { classifyRisk, type RiskLevel } from "../../api/news";

export default function Step1News() {
  const {
    displayNewsList, currentNews, setCurrentNews, setCurrentStep,
    fetchGetNews, cozeLoading, cozeLoaded, cozeProducts, copyList,
  } = useWorkflow();
  // copyList 仍从 Context 取（兼容展示），不再由 fetchGetNews 触发
  void copyList;
  const [tab, setTab] = useState("全部");
  const [q, setQ] = useState("");

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(displayNewsList.map((n) => n.category)))],
    [displayNewsList]
  );

  const filtered = useMemo(() => {
    return displayNewsList.filter((n) => {
      if (tab !== "全部" && n.category !== tab) return false;
      if (q && !`${n.title}${n.summary}${n.keywords.join("")}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [displayNewsList, tab, q]);

  const hotCount = displayNewsList.filter((n) => n.heat >= 90).length;

  return (
    <div className="max-w-[1280px] mx-auto">
      <PageHeader
        date="THURSDAY · JUL 30, 2026"
        title="发现热点，抢占先机"
        subtitle="实时追踪全网热点新闻，找到下一个爆款机会。"
        actions={
          <button
            onClick={() => fetchGetNews()}
            disabled={cozeLoading}
            className="h-9 px-4 rounded-lg bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
          >
            {cozeLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 抓取中…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> 抓取热点
              </>
            )}
          </button>
        }
      />

      {/* 数据来源标识 */}
      <div className="mb-5">
        {cozeLoaded ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-brand-50 text-brand-700 text-[12px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> 数据来源：可配置新闻源（实时抓取，可在后台「新闻来源」配置）
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-gray-100 text-gray-500 text-[12px]">
            当前为演示数据 · 点击右上「抓取热点」接入已配置来源
          </span>
        )}
      </div>

      {/* 顶部数据卡 */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <StatCard label="实时热点" value={displayNewsList.length} unit="条" trend={`${displayNewsList.length} 条`} trendUp />
        <StatCard label="高潜热点" value={hotCount} unit="条" trend="+8.4%" trendUp />
        <StatCard label="匹配商品方向" value={cozeProducts.length > 0 ? cozeProducts.length : "—"} unit={cozeProducts.length > 0 ? "个" : ""} trend="+18.2%" trendUp />
        <StatCard label="Coze 文案版本" value={copyList.length > 0 ? copyList.length : "—"} unit={copyList.length > 0 ? "版" : ""} trend="+2.1%" trendUp highlight />
      </div>

      {/* 实时热点 区块标题 */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900">实时热点</h2>
            <span className="text-[11px] text-gray-400">来源 · 可配置新闻源</span>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索新闻关键词"
            className="h-8 pl-8 pr-3 bg-white border border-gray-200 rounded-lg text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none w-56"
          />
        </div>
      </div>

      {/* 主列表卡 */}
      <div className="card overflow-hidden">
        {/* 分类筛选 */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-1 overflow-x-auto">
          {categories.map((t) => {
            const isActive = tab === t;
            const count = t === "全部" ? displayNewsList.length : displayNewsList.filter((n) => n.category === t).length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3.5 h-8 rounded-lg text-[12.5px] font-medium transition-colors flex items-center gap-1.5 shrink-0 ${
                  isActive ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t}
                <span className={`text-[11px] ${isActive ? "text-gray-300" : "text-gray-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* 列表 */}
        <div className="divide-y divide-gray-100">
          {filtered.length === 0 && (
            <div className="py-16 text-center text-[13px] text-gray-400">无匹配结果</div>
          )}
          {filtered.map((n) => {
            const isActive = currentNews?.id === n.id;
            const risk = classifyRisk(n.title);
            return (
              <div
                key={n.id}
                onClick={() => setCurrentNews(n)}
                className={`group relative px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors ${
                  isActive ? "row-selected" : "hover:bg-gray-50/60"
                }`}
              >
                <Thumb category={n.category} kind="news" size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-gray-500 font-medium">{n.category}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span className="text-[11px] text-gray-400">{n.source}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span className="text-[11px] text-gray-400">{n.time}</span>
                    <RiskPill level={risk.level} />
                  </div>
                  <div className={`text-[14.5px] font-semibold leading-snug ${isActive ? "text-brand-700" : "text-gray-900"} line-clamp-1`}>
                    {n.title}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-gray-500 leading-relaxed line-clamp-2">
                    {n.summary}
                  </div>
                </div>

                {/* 右侧：热度 + 操作 */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-rose-500">
                      <Flame className="w-3.5 h-3.5 fill-rose-500" />
                      <span className="text-[15px] font-semibold tabular-nums">{n.heat}</span>
                    </div>
                    <div className="text-[10.5px] text-gray-400 mt-0.5">热度</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCurrentNews(n); }}
                    className={`text-[12px] font-medium ${
                      isActive ? "text-brand-600" : "text-gray-400 group-hover:text-brand-600"
                    }`}
                  >
                    {isActive ? "已选择" : "选择 →"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="mt-6 flex items-center justify-between text-[12.5px]">
        <div className="text-gray-500">
          {currentNews ? (
            <>已选 1 条：<span className="text-gray-900 font-medium">{currentNews.title.slice(0, 18)}…</span></>
          ) : (
            "未选择任何热点"
          )}
        </div>
        <PrimaryActionButton onClick={() => setCurrentStep(2)} disabled={!currentNews}>
          进入下一步
          <ArrowRight className="w-4 h-4" />
        </PrimaryActionButton>
      </div>
    </div>
  );
}

function StatCard({
  label, value, unit, trend, trendUp, highlight,
}: {
  label: string; value: number | string; unit: string; trend?: string; trendUp?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`card p-6 ${highlight ? "ring-1 ring-brand-100" : ""}`}>
      <div className="text-meta mb-3">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[28px] font-semibold leading-none tabular-nums ${highlight ? "text-gradient-brand" : "text-gray-900"}`}>
          {value}
        </span>
        <span className="text-[12px] text-gray-400">{unit}</span>
      </div>
      {trend && (
        <div className={`mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium ${trendUp ? "text-emerald-600" : "text-rose-600"}`}>
          <Sparkles className="w-3 h-3" />
          {trend}
        </div>
      )}
    </div>
  );
}

/** 风险等级小标签（纯前端展示，规则与后台说明、服务端风控一致） */
function RiskPill({ level }: { level: RiskLevel }) {
  const map = {
    ban: { bg: "#fef2f2", fg: "#dc2626", bd: "#fecaca", t: "禁止借势" },
    review: { bg: "#fffbeb", fg: "#b45309", bd: "#fde68a", t: "需人工判断" },
    ok: { bg: "#f0fdf4", fg: "#16a34a", bd: "#bbf7d0", t: "可借势" },
  }[level];
  return (
    <span
      title={level === "ban" ? "该热点命中禁止借势规则，文案生成应拒绝" : level === "review" ? "该热点需人工审核后再用" : "可正常借势"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: 9999,
        fontSize: 10.5,
        fontWeight: 600,
        background: map.bg,
        color: map.fg,
        border: "1px solid " + map.bd,
        whiteSpace: "nowrap",
      }}
    >
      {map.t}
    </span>
  );
}
