import { useEffect, useRef, useState } from "react";
import { Bell, Search, Sparkles, Loader2, Settings, RotateCcw } from "lucide-react";
import { useWorkflow } from "../context/WorkflowContext";

/** 运营后台入口路径——指向独立 admin 外壳（同一标签页内切换，避免反复打开冗余标签页） */
const ADMIN_PATH = "/admin/index.html";

export default function TopHeader() {
  const { setCurrentStep, fetchGetNews, cozeLoading, reset } = useWorkflow();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K 全局聚焦搜索框
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // Esc 取消聚焦
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    setCurrentStep(1);
    fetchGetNews(q.trim());
  };

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center px-6 gap-6">
      {/* Logo + 名称 */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl btn-brand flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-gray-900">热点营销工作台</div>
          <div className="text-[11px] text-gray-400">Hotspot × Commerce · 电商媒体中心</div>
        </div>
      </div>

      {/* 中间搜索框 → 联动 getNews(input) */}
      <div className="flex-1 max-w-[520px] mx-auto">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-brand-600 transition-colors" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder='输入关键词回车触发 getNews（如"咖啡豆"）；留空=全网热点'
            className="w-full h-10 pl-10 pr-24 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-700 placeholder:text-gray-400 focus:bg-white focus:border-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-all"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {cozeLoading ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-brand-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                抓取中
              </span>
            ) : (
              <kbd className="text-[11px] text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5 font-mono">
                ⌘K
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* 右侧：通知 + 重置进度 + 运营后台 + 用户 */}
      <div className="flex items-center gap-4 shrink-0">
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        <div className="w-px h-6 bg-gray-100" />

        {/* 重置进度：清空 sessionStorage 持久化的工作台状态，回到初始（仅关闭标签页才自动清，刷新不清，故提供按钮） */}
        <button
          onClick={() => {
            if (window.confirm("确定清空当前工作台进度？（已选新闻/商品/生成的文案都会清空，不可撤销）")) {
              reset();
              setCurrentStep(1);
            }
          }}
          title="清空当前工作台进度（新闻/商品/文案）"
          className="group inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-lg text-[12.5px] text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <RotateCcw className="w-[15px] h-[15px] group-hover:-rotate-90 transition-transform duration-300" strokeWidth={1.8} />
          <span>重置进度</span>
        </button>

        <div className="w-px h-6 bg-gray-100" />

        {/* 运营后台入口 —— 独立外壳，同一标签页内切换，避免反复打开冗余标签页 */}
        <a
          href={ADMIN_PATH}
          title="进入运营后台（同一标签页内打开）"
          className="group inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-lg text-[12.5px] text-gray-500 hover:text-brand-700 hover:bg-brand-50 transition-colors"
        >
          <Settings className="w-[15px] h-[15px] group-hover:rotate-45 transition-transform duration-300" strokeWidth={1.8} />
          <span>运营后台</span>
        </a>

        <div className="w-px h-6 bg-gray-100" />

        <div className="flex items-center gap-2.5">
          <div className="avatar-gradient w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-medium">
            王
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-gray-900">运营小王</div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-gray-400">在线</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
