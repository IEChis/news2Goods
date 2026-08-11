import { useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, Plus, Check, X, Sparkles } from "lucide-react";
import { useWorkflow } from "../../context/WorkflowContext";
import { getMatchScores, mockProducts } from "../../data/mock";
import { PageHeader, PrimaryActionButton, SelectedContextBar } from "../Shared";
import Thumb from "../Thumb";

interface Item { product: any; score: number; fromCoze: boolean; }

export default function Step3Match() {
  const {
    currentNews, setCurrentStep, selectedProductIds, bindProduct, unbindProduct,
    visibleCozeProducts, cozeLoaded, productLibrary, matchMode, matchKeywords,
  } = useWorkflow();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"match" | "price" | "sales">("match");

  // 匹配池 = Coze 实时结果（如有）+ 本地商品库（运营后台维护的单一数据源）。
  // 合并后：后台新增的商品在 Step3 可被搜到，本地匹配算法(getMatchScores)也会推荐它。
  const items = useMemo<Item[]>(() => {
    const lib = (productLibrary.length ? productLibrary : mockProducts).map((p) => {
      const m = currentNews ? getMatchScores(currentNews.id, [p])[0] : null;
      return { product: p, score: m ? m.score : 0, fromCoze: false };
    });
    const coze = visibleCozeProducts.map((p, i) => ({ product: p, score: 96 - i * 2, fromCoze: true }));
    const merged = [...coze, ...lib];
    const seen: Record<string, boolean> = {};
    const uni: Item[] = [];
    merged.forEach((it) => {
      if (!seen[it.product.id]) { seen[it.product.id] = true; uni.push(it); }
    });
    return uni;
  }, [visibleCozeProducts, productLibrary, currentNews]);

  const filtered = useMemo(() => {
    let l = items;
    if (q) {
      const kw = q.toLowerCase();
      l = l.filter((m) =>
        `${m.product.name} ${m.product.category} ${(m.product.selling || []).join(" ")}`.toLowerCase().includes(kw)
      );
    }
    if (sort === "price") l = [...l].sort((a, b) => a.product.price - b.product.price);
    if (sort === "sales") l = [...l].sort((a, b) => b.score - a.score);
    return l;
  }, [items, q, sort]);

  if (!currentNews) {
    return (
      <div className="max-w-[1280px] mx-auto">
        <PageHeader date="THURSDAY · JUL 30, 2026" title="匹配商品" subtitle="手动筛选与绑定商品库。" />
        <div className="card p-10 text-center">
          <div className="text-[14px] text-gray-500 mb-4">尚未选择热点新闻</div>
          <PrimaryActionButton onClick={() => setCurrentStep(1)}>
            <ArrowLeft className="w-4 h-4" /> 返回选择新闻
          </PrimaryActionButton>
        </div>
      </div>
    );
  }

  const boundList = items.filter((m) => selectedProductIds.includes(m.product.id));

  return (
    <div className="max-w-[1280px] mx-auto">
      <PageHeader
        date="THURSDAY · JUL 30, 2026"
        title="匹配商品"
        subtitle="手动调整与精细化筛选，构建本轮爆款商品库。"
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

      <div className="mt-5">
        <span className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[12px] font-medium ${
          matchMode === "llm" ? "bg-violet-50 text-violet-700"
          : cozeLoaded ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500"
        }`}>
          {matchMode === "llm" ? (
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

      <div className="mt-6 grid grid-cols-3 gap-5">
        {/* 左侧：商品清单 */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-gray-900">商品库 · 共 {items.length} 件</h2>
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索商品"
                className="h-8 pl-3 pr-3 bg-white border border-gray-200 rounded-lg text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none w-44"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="h-8 px-2 bg-white border border-gray-200 rounded-lg text-[12.5px] text-gray-700 focus:border-brand-300 focus:outline-none"
              >
                <option value="match">按匹配度</option>
                <option value="price">按价格</option>
                <option value="sales">按销量</option>
              </select>
            </div>
          </div>

          <div className="card divide-y divide-gray-100 overflow-hidden">
            {filtered.map((m) => {
              const isBound = selectedProductIds.includes(m.product.id);
              return (
                <div
                  key={m.product.id}
                  className={`group px-4 py-3.5 flex items-center gap-3 transition-colors ${isBound ? "row-selected" : "hover:bg-gray-50/60"}`}
                >
                  <Thumb category={m.product.category} kind="product" size="md" emoji={m.product.icon} gradient={m.product.gradient} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-gray-900 line-clamp-1">{m.product.name}</div>
                    <div className="mt-1 text-[12px] text-gray-500 line-clamp-1">
                      {m.fromCoze ? (matchMode === "llm" ? "大模型匹配" : "Coze 实时匹配") : `${m.product.selling.slice(0, 3).join(" · ")}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[15px] font-semibold text-rose-500 tabular-nums">¥{m.product.price}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">{m.fromCoze ? (matchMode === "llm" ? "大模型匹配" : "Coze 匹配") : `匹配度 ${m.score}%`}</div>
                  </div>
                  <button
                    onClick={() => isBound ? unbindProduct(m.product.id) : bindProduct(m.product.id)}
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      isBound
                        ? "bg-brand-100 text-brand-600 hover:bg-brand-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    title={isBound ? "取消绑定" : "绑定此商品"}
                  >
                    {isBound ? <Check className="w-4 h-4" strokeWidth={2.4} /> : <Plus className="w-4 h-4" strokeWidth={2.2} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧：已选摘要 */}
        <div className="col-span-1">
          <div className="card p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-gray-900">已选商品</h2>
              <span className="text-[11px] text-gray-400">{selectedProductIds.length} 件</span>
            </div>
            {boundList.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] text-gray-400">
                尚未绑定商品
              </div>
            ) : (
              <div className="space-y-2.5">
                {boundList.map((m) => (
                  <div key={m.product.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 group">
                    <Thumb category={m.product.category} kind="product" size="sm" emoji={m.product.icon} gradient={m.product.gradient} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-gray-900 line-clamp-1">{m.product.name}</div>
                      <div className="text-[11px] text-rose-500 tabular-nums">¥{m.product.price}</div>
                    </div>
                    <button
                      onClick={() => unbindProduct(m.product.id)}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-[12px]">
              <div className="flex justify-between text-gray-500">
                <span>商品数量</span><span className="text-gray-900 font-medium">{selectedProductIds.length}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>预估价格区间</span>
                <span className="text-gray-900 font-medium tabular-nums">
                  {boundList.length > 0
                    ? `¥${Math.min(...boundList.map((m) => m.product.price))} – ¥${Math.max(...boundList.map((m) => m.product.price))}`
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <button onClick={() => setCurrentStep(2)} className="h-11 px-5 rounded-xl text-[13px] text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <PrimaryActionButton onClick={() => setCurrentStep(4)} disabled={selectedProductIds.length === 0}>
          下一步 · 生成文案 <ArrowRight className="w-4 h-4" />
        </PrimaryActionButton>
      </div>
    </div>
  );
}
