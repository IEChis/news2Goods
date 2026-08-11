import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, ShoppingCart, Filter, Heart, MessageSquare, Eye, Sparkles, Loader2 } from "lucide-react";
import { useWorkflow } from "../../context/WorkflowContext";
import { getMatchScores, mockProducts } from "../../data/mock";
import { PageHeader, PrimaryActionButton, SelectedContextBar } from "../Shared";
import Thumb from "../Thumb";

// 加载中商品卡片占位（matchGoodsLoading 期间显示，避免页面"静止"无反馈）
function SkeletonCard() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-50" />
      <div className="p-4 space-y-2.5">
        <div className="h-3 w-20 bg-gray-100 rounded" />
        <div className="h-4 w-36 bg-gray-100 rounded" />
        <div className="h-5 w-24 bg-gray-100 rounded" />
        <div className="flex gap-1.5">
          <div className="h-5 w-14 bg-gray-100 rounded" />
          <div className="h-5 w-16 bg-gray-100 rounded" />
          <div className="h-5 w-10 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-full bg-gray-100 rounded-lg mt-2" />
      </div>
    </div>
  );
}

const SCOPES = [
  { key: "all", label: "匹配度最高" },
  { key: "price", label: "销量优先" },
  { key: "fresh", label: "库存充足" },
];

interface Item { product: any; score: number; source: "coze" | "llm" | "local"; }

export default function Step2Suggest() {
  const {
    currentNews, setCurrentStep, selectedProductIds, bindProduct, unbindProduct,
    visibleCozeProducts, cozeLoaded, matchGoodsLoading, fetchMatchGoods, productLibrary,
    matchMode, matchKeywords,
  } = useWorkflow();
  const [scope, setScope] = useState("all");

  // 进入本页 + 选中新闻变了 → 自动触发 matchGoods（单步、传选中新闻）
  useEffect(() => {
    if (!currentNews) return;
    // 只要当前新闻不在已有 visibleCozeProducts 的语义范围内（或没接过），就重新拉一次
    if (!matchGoodsLoading) {
      fetchMatchGoods(currentNews);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNews?.id]);

  const items = useMemo<Item[]>(() => {
    if (matchMode === "llm") {
      // 大模型模式：visibleCozeProducts 此时是「关键词检索商品库」命中商品
      const list = visibleCozeProducts.map((p, i) => ({ product: p, score: 96 - i * 2, source: "llm" as const }));
      if (scope === "price") return [...list].sort((a, b) => a.product.price - b.product.price);
      return list;
    }
    if (visibleCozeProducts.length) {
      const list = visibleCozeProducts.map((p, i) => ({ product: p, score: 96 - i * 2, source: "coze" as const }));
      if (scope === "price") return [...list].sort((a, b) => a.product.price - b.product.price);
      return list;
    }
    if (!currentNews) return [];
    const lib = productLibrary.length ? productLibrary : mockProducts;
    const list = getMatchScores(currentNews.id, lib).map((m) => ({ product: m.product, score: m.score, source: "local" as const }));
    if (scope === "price") return [...list].sort((a, b) => a.product.price - b.product.price);
    if (scope === "fresh") return [...list].filter((m) => m.product.originalPrice - m.product.price > 30);
    return list;
  }, [visibleCozeProducts, currentNews, scope, matchMode]);

  if (!currentNews) {
    return (
      <div className="max-w-[1280px] mx-auto">
        <PageHeader date="THURSDAY · JUL 30, 2026" title="建议匹配商品" subtitle="系统已为你预选高契合度商品。" />
        <div className="card p-10 text-center">
          <div className="text-[14px] text-gray-500 mb-4">尚未选择热点新闻</div>
          <PrimaryActionButton onClick={() => setCurrentStep(1)}>
            <ArrowLeft className="w-4 h-4" /> 返回选择新闻
          </PrimaryActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto">
      <PageHeader
        date="THURSDAY · JUL 30, 2026"
        title="建议匹配商品"
        subtitle="基于新闻语义与商品卖点，系统已为你预选高契合度商品。"
        actions={<Filter className="hidden" />}
      />

      <SelectedContextBar
        label="当前热点"
        icon={<Thumb category={currentNews.category} kind="news" size="sm" />}
        onAction={() => setCurrentStep(1)}
        actionLabel="更换热点"
        highlight
      >
        {currentNews.title}
      </SelectedContextBar>

      {/* 数据来源说明（四态：loading / 大模型匹配 / Coze 实时 / 未接入） */}
      <div className="mt-5 mb-1">
        <span className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[12px] font-medium ${
          matchGoodsLoading ? "bg-amber-50 text-amber-700"
          : matchMode === "llm" ? "bg-violet-50 text-violet-700"
          : cozeLoaded ? "bg-brand-50 text-brand-700"
          : "bg-gray-100 text-gray-500"
        }`}>
          {matchGoodsLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {matchMode === "llm" ? "大模型正在分析新闻并检索商品库…" : "Coze 正在为你匹配商品…（约 5-10 秒）"}
            </>
          ) : matchMode === "llm" ? (
            <>
              <Sparkles className="w-3.5 h-3.5" /> 大模型匹配：AI 关键词「{matchKeywords.join("、") || "—"}」→ 商品库检索
            </>
          ) : cozeLoaded ? (
            <>
              <Sparkles className="w-3.5 h-3.5" /> 商品品类由 Coze 工作流实时匹配（价格/卖点为示例视觉）
            </>
          ) : (
            "未接入 Coze，当前展示演示商品"
          )}
        </span>
      </div>

      <div className="mt-5 mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">系统推荐</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">
            {matchMode === "llm" ? "大模型生成关键词 → 商品库检索命中" : cozeLoaded ? "Coze 实时匹配结果" : "AI 根据热点、销量、库存综合排序"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {SCOPES.map((s) => {
            const isActive = scope === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`h-8 px-3.5 rounded-lg text-[12.5px] font-medium transition-colors ${
                  isActive ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {matchGoodsLoading && visibleCozeProducts.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
        items.slice(0, 6).map((m) => {
          const isBound = selectedProductIds.includes(m.product.id);
          return (
            <div
              key={m.product.id}
              className={`card overflow-hidden transition-shadow ${isBound ? "ring-1 ring-brand-200" : "card-hover"}`}
            >
              <div className="relative h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden">
                <div className={`absolute top-3 left-3 inline-flex items-center gap-1 px-2 h-6 backdrop-blur rounded-md text-[11px] font-medium ${
                  m.source === "local" ? "bg-white/90 text-brand-600" : "bg-brand-500 text-white"
                }`}>
                  {m.source === "coze" ? "🟣 Coze 实时匹配" : m.source === "llm" ? "⚡ 大模型匹配" : `匹配度 ${m.score}%`}
                </div>
                {isBound && (
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 h-6 bg-brand-500 text-white rounded-md text-[11px] font-medium">
                    ✓ 已选
                  </div>
                )}
                <div className="scale-[2.5]">
                  <Thumb category={m.product.category} kind="product" size="lg" emoji={m.product.icon} gradient={m.product.gradient} />
                </div>
              </div>

              <div className="p-4">
                <div className="text-[11px] text-gray-400 mb-1.5">{m.product.category} · {m.product.selling.length}项亮点</div>
                <div className="text-[14px] font-semibold text-gray-900 line-clamp-1">{m.product.name}</div>

                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="text-[20px] font-semibold text-rose-500 tabular-nums">¥{m.product.price}</span>
                  <span className="text-[12px] text-gray-400 line-through tabular-nums">¥{m.product.originalPrice}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {m.product.selling.slice(0, 3).map((s: string, i: number) => (
                    <span key={i} className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                      ✦ {s}
                    </span>
                  ))}
                </div>

                <div className="mt-3.5 flex items-center justify-between text-[11px] text-gray-400">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{(m.score * 87).toFixed(0)}</span>
                    <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{(m.score * 4.2).toFixed(0)}</span>
                    <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{(m.score * 1.6).toFixed(0)}</span>
                  </div>
                </div>

                <button
                  onClick={() => isBound ? unbindProduct(m.product.id) : bindProduct(m.product.id)}
                  className={`mt-4 w-full h-9 rounded-lg text-[12.5px] font-medium transition-colors ${
                    isBound
                      ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                      : "bg-brand-600 text-white hover:bg-brand-700"
                  }`}
                >
                  {isBound ? "✓ 已绑定此商品" : "绑定此商品 →"}
                </button>
              </div>
            </div>
          );
        }))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="text-[12.5px] text-gray-500">
          {selectedProductIds.length > 0
            ? <>已选 <span className="text-gray-900 font-medium">{selectedProductIds.length}</span> 件商品</>
            : "尚未绑定商品，可多选"}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentStep(1)} className="h-11 px-5 rounded-xl text-[13px] text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> 上一步
          </button>
          <PrimaryActionButton onClick={() => setCurrentStep(3)} disabled={selectedProductIds.length === 0}>
            下一步 · 深度筛选 <ArrowRight className="w-4 h-4" />
          </PrimaryActionButton>
        </div>
      </div>
    </div>
  );
}
