import {
  Newspaper,
  Lightbulb,
  ShoppingCart,
  PenLine,
  CheckCircle,
  Workflow,
  BarChart3,
} from "lucide-react";
import { useWorkflow, type Step } from "../context/WorkflowContext";

interface StepDef {
  id: Step;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const STEPS: StepDef[] = [
  { id: 1, label: "新闻抓取",    desc: "挑选爆款素材",     icon: Newspaper  },
  { id: 2, label: "建议匹配商品", desc: "智能关联候选项",   icon: Lightbulb  },
  { id: 3, label: "匹配商品",    desc: "手动筛选与绑定",   icon: ShoppingCart },
  { id: 4, label: "创作文案",    desc: "AI 多版本生成",    icon: PenLine    },
  { id: 5, label: "审核并发送",  desc: "合规与模拟发布",   icon: CheckCircle},
];

export default function LeftSidebar() {
  const { currentStep, setCurrentStep, currentNews, selectedProductIds, copyList, reviewStatus } = useWorkflow();

  // 计算总进度：每完成 1 步 +20%
  const completedCount =
    (currentNews ? 1 : 0) +
    (selectedProductIds.length > 0 ? 1 : 0) +
    (selectedProductIds.length > 0 ? 1 : 0) +
    (copyList.length > 0 ? 1 : 0) +
    (reviewStatus === "approved" || reviewStatus === "sent" ? 1 : 0);
  const progressPct = Math.min(100, completedCount * 20);

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-gray-100 flex flex-col">
      {/* 顶部小标题 */}
      <div className="px-5 pt-6 pb-3">
        <div className="text-meta">工作流程</div>
        <div className="mt-1 text-[12px] text-gray-400">从热点到发布，共 5 步</div>
      </div>

      {/* 步骤列表 */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {STEPS.map((s) => {
          const isActive = currentStep === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              className={`group relative w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                isActive ? "bg-brand-50" : "hover:bg-gray-50"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b bg-brand-600" />
              )}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isActive
                    ? "bg-gradient-to-br bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                }`}
              >
                <Icon className="w-[16px] h-[16px]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className={`text-[13.5px] font-medium leading-tight ${
                  isActive ? "text-brand-700" : "text-gray-800"
                }`}>
                  {s.label}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{s.desc}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* 评测台入口（独立于 5 步工作流） */}
      <div className="px-3 pb-2">
        <div className="border-t border-gray-100 my-1" />
        <button
          onClick={() => setCurrentStep(6)}
          className={`group relative w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
            currentStep === 6 ? "bg-brand-50" : "hover:bg-gray-50"
          }`}
        >
          {currentStep === 6 && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b bg-brand-600" />
          )}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentStep === 6 ? "bg-gradient-to-br bg-brand-600 text-white" : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
          }`}>
            <BarChart3 className="w-[16px] h-[16px]" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className={`text-[13.5px] font-medium leading-tight ${currentStep === 6 ? "text-brand-700" : "text-gray-800"}`}>
              文案评测台
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">校验 · 评审 · 返工</div>
          </div>
        </button>
      </div>

      {/* 底部工作流进度卡 */}
      <div className="px-4 pb-4">
        <div className="bg-gray-50 rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
            <Workflow className="w-3.5 h-3.5" />
            <span>工作流进度</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-semibold text-gradient-brand">{progressPct}%</span>
          </div>
          <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r bg-brand-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
