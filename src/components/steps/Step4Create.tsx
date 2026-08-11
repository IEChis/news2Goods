import { useState, useEffect } from "react";
import { ArrowRight, ArrowLeft, Sparkles, Copy, RefreshCw, Check, MessageCircle, Repeat, Heart, Share2, Loader2, Wand2 } from "lucide-react";
import { useWorkflow } from "../../context/WorkflowContext";
import { PageHeader, PrimaryActionButton, SelectedContextBar } from "../Shared";
import Thumb from "../Thumb";
import { loadCopyConfig, loadMatchConfig, type CreativeStyle } from "../../api/promptConfig";
import { loadEvalConfig } from "../../eval/config";
import { callLLM } from "../../api/coze";
import { toValidatorCfg } from "../../eval/prompts";
import { validateCopy, getFixableFailures } from "../../eval/validator";
import { runReworkLoop, simulateRewriter } from "../../eval/rework";
import type { ReworkResult, CheckResult, EvalMaterial } from "../../eval/types";

export default function Step4Create() {
  const {
    currentNews, selectedProducts, setCurrentStep,
    copyCandidates, selectedCopyIndex, setSelectedCopyIndex,
    cozeLoading, cozeLoaded, fetchCreateCopyMulti, showToast, updateCurrentCopyText,
  } = useWorkflow();

  // 「主打语调」下拉项（来自运营后台语调预设）；补充要求可选
  const [toneOptions, setToneOptions] = useState<string[]>([]);
  const [selectedTone, setSelectedTone] = useState("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [styleCount, setStyleCount] = useState(0);

  // 进入 Step4 时拉取语调预设与风格数量，填充下拉与提示
  useEffect(() => {
    let alive = true;
    loadCopyConfig()
      .then((cfg) => {
        if (!alive) return;
        const tones = cfg.tonePresets || [];
        setToneOptions(tones);
        setSelectedTone((prev) => (prev && tones.includes(prev) ? prev : tones[0] || ""));
        setStyleCount((cfg.creativeStyles || []).length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!currentNews) {
    return (
      <div className="max-w-[1280px] mx-auto">
        <PageHeader date="THURSDAY · JUL 30, 2026" title="创作文案" subtitle="让每一个热点，都变成有转化力的内容。" />
        <div className="card p-10 text-center">
          <div className="text-[14px] text-gray-500 mb-4">尚未选择热点新闻</div>
          <PrimaryActionButton onClick={() => setCurrentStep(1)}>
            <ArrowLeft className="w-4 h-4" /> 返回选择新闻
          </PrimaryActionButton>
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    if (!currentNews) return;
    if (selectedProducts.length === 0) {
      showToast?.("error", "请先在「匹配商品」选择至少 1 件商品");
      return;
    }
    try {
      const cfg = await loadCopyConfig();
      // 创作风格：运营后台配置，至少 1 个；缺失时兜底一个默认风格，保证能生成
      const styles: CreativeStyle[] =
        cfg.creativeStyles && cfg.creativeStyles.length
          ? cfg.creativeStyles
          : [{ name: "默认风格", requirement: "" }];
      const tone = selectedTone || cfg.tonePresets?.[0] || "";
      // 每个风格独立跑一次 createCopy，产出对应候选版本
      fetchCreateCopyMulti(currentNews, selectedProducts, tone, styles, extraPrompt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast?.("error", `读取后台配置失败：${msg.slice(0, 60)}`);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    showToast?.("success", "已复制到剪贴板");
  };

  // 一键修正：用评测体系的自动返工，把当前文案的「可修复问题」改好
  const [reworking, setReworking] = useState(false);
  const [reworkInfo, setReworkInfo] = useState<ReworkResult | null>(null);
  const handleRework = async () => {
    if (!currentNews || !currentCopy) return;
    setReworking(true);
    setReworkInfo(null);
    try {
      const cfg = await loadEvalConfig();
      const material: EvalMaterial = {
        news: { title: currentNews.title, summary: currentNews.summary, keywords: currentNews.keywords },
        products: selectedProducts,
        requiredTags: currentNews.keywords,
      };
      const validatorCfg = toValidatorCfg(cfg);
      const v = validateCopy(currentCopy, material, validatorCfg);
      const issues = getFixableFailures(v);
      if (issues.length === 0) {
        showToast?.("success", "当前文案机器校验已通过，无需修正");
        setReworking(false);
        return;
      }
      const useSim = cfg.simulate;
      let llmCall: ((m: { role: string; content: string }[], t: number) => Promise<string>) | null = null;
      if (!useSim) {
        try {
          const mc = await loadMatchConfig();
          const model = cfg.model || mc.llm.model;
          llmCall = (m, t) => callLLM({ baseURL: mc.llm.baseURL, apiKey: mc.llm.apiKey, model }, m, t);
        } catch {
          llmCall = null;
        }
      }
      const rewrite = useSim || !llmCall
        ? async (t: string, i: CheckResult[], m: EvalMaterial, c: typeof cfg) => simulateRewriter(t, i, m, c)
        : async (t: string, i: CheckResult[], m: EvalMaterial) => {
            const issueLines = i.map((x) => `- ${x.label}${x.failReason ? "：" + x.failReason : ""}`).join("\n");
            const prompt =
              (cfg.reworkPrompt || "") +
              "\n\n【没通过的文案】\n" +
              t +
              "\n\n【具体没过的原因】\n" +
              issueLines +
              "\n\n【素材真实金额】\n" +
              (m.products.map((p) => p.name + " ¥" + p.price).join("\n") || "（无）");
            return (await llmCall!([{ role: "user", content: prompt }], cfg.reworkTemp)).trim();
          };
      const result = await runReworkLoop({
        text: currentCopy,
        material,
        config: cfg,
        validate: (t) => validateCopy(t, material, validatorCfg),
        rewrite,
        maxRounds: cfg.reworkMaxRounds,
      });
      setReworkInfo(result);
      updateCurrentCopyText(result.finalText);
      showToast?.(
        result.improved ? "success" : "info",
        result.improved
          ? `自动返工完成，机器分 ${v.score} → ${result.finalValidation.score}`
          : "已尝试返工但未提升，已保留原版"
      );
    } catch (e) {
      showToast?.("error", "返工失败：" + (e as Error).message.slice(0, 60));
    } finally {
      setReworking(false);
    }
  };

  // 当前候选（按风格名驱动）
  const currentCopy = (() => {
    if (copyCandidates.length === 0) return "";
    const idx = Math.min(Math.max(selectedCopyIndex, 0), copyCandidates.length - 1);
    return copyCandidates[idx]?.text || "";
  })();

  const toneEmpty = (toneOptions.length === 0);

  return (
    <div className="max-w-[1280px] mx-auto">
      <PageHeader
        date="THURSDAY · JUL 30, 2026"
        title="创作文案"
        subtitle="让每一个热点，都变成有转化力的内容。"
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

      <div className="mt-7 grid grid-cols-2 gap-5">
        {/* 左侧：AI 生成器 */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-500" /> 微博文案生成器
            </h2>
            <span className={`text-[11px] px-2 h-5 rounded flex items-center ${cozeLoaded ? "text-brand-600 bg-brand-50" : "text-gray-400 bg-gray-100"}`}>
              {cozeLoaded ? "Coze 实时" : "演示文案"}
            </span>
          </div>
            <p className="text-[12.5px] text-gray-500 mb-3">已为你准备热点与商品上下文，按创作风格生成多个候选版本供挑选</p>

          <div className="mb-4 p-2.5 bg-brand-50/60 border border-brand-100 rounded-lg text-[11.5px] text-brand-700 leading-relaxed">
            ✦ 角色设定、素材模板、单件格式、创作风格与语调预设均可在「运营后台 → 文案模板」中调整；下方「主打语调」与「补充要求」会作为 <span className="font-mono">{'user_prompt'}</span> 注入模板。
          </div>

          {/* 主打语调 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[12px] text-gray-500 flex items-center gap-1.5">
                主打语调
                <span className="text-[10.5px] text-brand-600 bg-brand-50 px-1.5 h-4 rounded inline-flex items-center font-mono">
                  user_prompt
                </span>
              </div>
            </div>
            <select
              value={selectedTone}
              onChange={(e) => setSelectedTone(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 focus:bg-white focus:border-gray-200 focus:outline-none transition-colors"
            >
              {toneOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              {toneEmpty && <option value="">（后台未配置语调预设）</option>}
            </select>
            <div className="mt-1.5 text-[11px] text-gray-400">
              ✦ 来自运营后台「语调预设」，选中后作为素材的一部分传给模型。
            </div>
          </div>

          {/* 补充要求（可选） */}
          <div className="mb-4">
            <div className="text-[12px] text-gray-500 mb-1.5">补充要求（可选）</div>
            <textarea
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
              rows={2}
              placeholder="例如：本周主推满199-30，语气轻松有网感，加入互动提问和限时优惠信息。"
              className="w-full p-3 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-gray-200 focus:outline-none resize-none transition-colors"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={cozeLoading}
            className="mt-1 w-full h-11 rounded-xl text-white text-[14px] font-medium btn-brand disabled:opacity-60 disabled:transform-none flex items-center justify-center gap-2"
          >
            {cozeLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 正在按风格调用 Coze 生成中…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> 生成候选文案
              </>
            )}
          </button>
          <p className="mt-1.5 text-[11px] text-gray-400 text-center">
            将按运营后台配置的 {styleCount || "N"} 个创作风格，各生成 1 个候选版本
          </p>

          {/* 已生成候选版本 */}
          {copyCandidates.length > 0 && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12.5px] text-gray-500">
                  已生成 · 版本 {Math.min(selectedCopyIndex + 1, copyCandidates.length)}/{copyCandidates.length}（按创作风格）
                </h3>
                <button
                  onClick={handleGenerate}
                  disabled={cozeLoading}
                  className="text-[12px] text-brand-600 hover:text-brand-700 flex items-center justify-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${cozeLoading ? "animate-spin" : ""}`} /> 重新生成
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-3.5 text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                {currentCopy}
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {copyCandidates.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedCopyIndex(i)}
                      className={`px-2 h-6 rounded text-[11px] font-medium ${
                        i === selectedCopyIndex
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {c.style}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span>{currentCopy.length} 字</span>
                  <span>·</span>
                  <span>#{(currentCopy.match(/#[^#\s]+/g) || []).length} 话题</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setSelectedCopyIndex(selectedCopyIndex)}
                  className="flex-1 h-9 rounded-lg bg-brand-50 text-brand-700 text-[12.5px] font-medium hover:bg-brand-100 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> 当前版本
                </button>
                <button
                  onClick={() => handleCopy(currentCopy)}
                  className="flex-1 h-9 rounded-lg bg-gray-100 text-gray-700 text-[12.5px] font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> 复制
                </button>
                <button
                  onClick={handleRework}
                  disabled={reworking || !currentCopy}
                  className="flex-1 h-9 rounded-lg bg-amber-50 text-amber-700 text-[12.5px] font-medium hover:bg-amber-100 flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {reworking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} 一键修正
                </button>
              </div>
              {reworkInfo && (
                <div className="mt-2 p-2.5 bg-amber-50/60 border border-amber-100 rounded-lg text-[11.5px] text-amber-800 leading-relaxed">
                  <div>自动返工：{reworkInfo.improved ? "分数已提升 ✅" : reworkInfo.keptOriginal ? "越改越差，已保留原版" : "无变化"}（{reworkInfo.rounds.length} 轮）</div>
                  {reworkInfo.rounds.map((rt) => (
                    <div key={rt.round} className="mt-0.5">
                      第{rt.round}轮 {rt.beforeScore}→{rt.afterScore}：修好[{rt.fixed.join("、") || "—"}]
                      {rt.remaining.length > 0 ? " 剩[" + rt.remaining.join("、") + "]" : ""}
                      {rt.keptPrevious ? "（保留上版）" : ""}
                    </div>
                  ))}
                  {reworkInfo.issuesRemaining.length === 0 && <div className="mt-0.5 text-green-700">✓ 全部可修复问题已解决</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧：真微博预览卡 */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">微博效果预览</h2>
            <span className="text-[11px] text-gray-400">内容将以此处样式发布</span>
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
                  {currentCopy || (
                    <span className="text-gray-400">点左侧「生成候选文案」后，预览会显示在这里…</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-around text-[12px] text-gray-500">
              <button className="flex items-center gap-1.5 hover:text-brand-600 transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> 12
              </button>
              <button className="flex items-center gap-1.5 hover:text-brand-600 transition-colors">
                <Repeat className="w-3.5 h-3.5" /> 3
              </button>
              <button className="flex items-center gap-1.5 hover:text-rose-500 transition-colors">
                <Heart className="w-3.5 h-3.5" /> 8
              </button>
              <button className="flex items-center gap-1.5 hover:text-brand-600 transition-colors">
                <Share2 className="w-3.5 h-3.5" /> 分享
              </button>
            </div>
          </div>

          <div className="mt-4 p-3.5 bg-gray-50 rounded-xl text-[12px] text-gray-500 leading-relaxed">
            ✦ 预览会实时同步当前选中的候选版本（按创作风格切换）。
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <div className="text-[12.5px] text-gray-500">
          {copyCandidates.length > 0
            ? <>已生成 <span className="text-gray-900 font-medium">{copyCandidates.length}</span> 个候选版本（按创作风格）</>
            : "尚未生成文案"}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentStep(3)} className="h-11 px-5 rounded-xl text-[13px] text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> 上一步
          </button>
          <PrimaryActionButton onClick={() => setCurrentStep(5)} disabled={copyCandidates.length === 0}>
            下一步 · 审核并发送 <ArrowRight className="w-4 h-4" />
          </PrimaryActionButton>
        </div>
      </div>
    </div>
  );
}
