import { useState } from "react";
import { ArrowLeft, MessageCircle, Repeat, Heart, Share2, Sparkles, CheckCircle2, ShieldCheck, Send, Loader2 } from "lucide-react";
import { useWorkflow } from "../../context/WorkflowContext";
import { PageHeader, SelectedContextBar } from "../Shared";
import Thumb from "../Thumb";

export default function Step5Review() {
  const {
    currentNews, setCurrentStep, copyList, selectedCopyIndex,
    setReviewStatus, reviewStatus, showToast,
  } = useWorkflow();

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!currentNews) {
    return (
      <div className="max-w-[1280px] mx-auto">
        <PageHeader date="THURSDAY · JUL 30, 2026" title="审核并发送" subtitle="完成最后审核，让好内容准时抵达用户。" />
        <div className="card p-10 text-center">
          <div className="text-[14px] text-gray-500 mb-4">尚未选择热点新闻</div>
          <button
            onClick={() => setCurrentStep(1)}
            className="h-11 px-6 rounded-xl text-white text-[14px] btn-brand inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> 返回选择新闻
          </button>
        </div>
      </div>
    );
  }

  const currentCopy = copyList[selectedCopyIndex] || "";
  const isApproved = reviewStatus === "approved" || reviewStatus === "sent";
  const isSent = reviewStatus === "sent";

  const handleApprove = () => {
    setReviewStatus("approved");
    showToast("success", "审核已通过");
  };

  const handleSend = () => {
    if (reviewStatus !== "approved") {
      showToast("info", "请先完成审核");
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setReviewStatus("sent");
      showToast("success", "已成功模拟发送至微博");
    }, 1500);
  };

  return (
    <div className="max-w-[1280px] mx-auto">
      <PageHeader
        date="THURSDAY · JUL 30, 2026"
        title="审核并发送"
        subtitle="完成最后审核，让好内容准时抵达用户。"
        actions={
          <span className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-medium ${
            isSent
              ? "bg-emerald-50 text-emerald-700"
              : isApproved
              ? "bg-brand-50 text-brand-700"
              : "bg-amber-50 text-amber-700"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isSent ? "bg-emerald-500" : isApproved ? "bg-brand-500" : "bg-amber-500"
            }`} />
            {isSent ? "已发送" : isApproved ? "已通过" : "待审核"}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-5">
        {/* 左侧：微博预览 */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">微博预览</h2>
            <span className="text-[11px] text-gray-400">发布前最终样貌</span>
          </div>

          <div className="border border-gray-100 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="avatar-gradient w-11 h-11 rounded-full flex items-center justify-center text-white font-medium shrink-0">
                信
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold text-gray-900">SignalFlow</span>
                  <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  <span className="text-[11px] text-gray-400 ml-1">营销 · 来自 微博</span>
                </div>
                <div className="mt-2 text-[13.5px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {currentCopy || <span className="text-gray-400">没有可预览的文案</span>}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-around text-[12px] text-gray-500">
              <button className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> 12</button>
              <button className="flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> 3</button>
              <button className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> 8</button>
              <button className="flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> 分享</button>
            </div>
          </div>

          {sent && (
            <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2.5 text-[12.5px] text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>已成功模拟发送至微博，效果可在微博工作台查看</span>
            </div>
          )}
        </div>

        {/* 右侧：审核清单 */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">发布检查清单</h2>
            <ShieldCheck className="w-4 h-4 text-gray-400" />
          </div>

          <div className="space-y-2.5">
            <CheckItem
              title="敏感词检测"
              desc="未发现违禁/敏感词"
              passed
            />
            <CheckItem
              title="商品信息校验"
              desc="商品与热点匹配，名称一致"
              passed={isApproved || isSent}
            />
            <CheckItem
              title="人工审核确认"
              desc="运营人员已通过本轮内容"
              passed={isApproved || isSent}
            />
          </div>

          <div className="mt-5 space-y-2">
            <button
              onClick={handleApprove}
              disabled={isApproved || isSent || sending}
              className="w-full h-11 rounded-xl text-[13.5px] font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isApproved || isSent ? "✓ 审核已通过" : "确认审核通过"}
            </button>
            <button
              onClick={handleSend}
              disabled={!isApproved || sending || isSent}
              className="w-full h-11 rounded-xl text-white text-[13.5px] font-medium btn-brand disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2"
            >
              {isSent ? (
                <><CheckCircle2 className="w-4 h-4" /> 已发送</>
              ) : sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 发送中…</>
              ) : (
                <><Send className="w-4 h-4" /> 一键发送到微博</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="mt-7 flex items-center justify-between">
        <button onClick={() => setCurrentStep(4)} className="h-11 px-5 rounded-xl text-[13px] text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> 上一步
        </button>
        <div className="text-[12.5px] text-gray-500">
          微博文案生成 · 运营审核 · 模拟发布
        </div>
      </div>
    </div>
  );
}

function CheckItem({ title, desc, passed }: { title: string; desc: string; passed: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      passed ? "bg-emerald-50/40 border-emerald-100" : "bg-white border-gray-100"
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        passed ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"
      }`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-900">{title}</div>
        <div className="text-[11.5px] text-gray-500 mt-0.5">{desc}</div>
      </div>
      <span className={`text-[11.5px] font-medium ${
        passed ? "text-emerald-600" : "text-gray-400"
      }`}>
        {passed ? "通过" : "待确认"}
      </span>
    </div>
  );
}
