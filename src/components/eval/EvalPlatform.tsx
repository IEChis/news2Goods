import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import { loadCopyConfig, type CreativeStyle } from "../../api/promptConfig";
import { mockProducts } from "../../data/mock";
import type { EvalConfig } from "../../eval/types";
import { loadEvalConfig, saveEvalConfig } from "../../eval/config";
import {
  loadCases,
  saveCases,
  loadRuns,
  saveRun,
  type CaseResult,
  type EvalRun,
  type TestCase,
} from "../../eval/store";
import { runEval, diffRuns } from "../../eval/run";
import { scoreColor } from "../../eval/scoring";
import type { CheckResult } from "../../eval/types";

type Tab = "cases" | "run" | "history";

function SummaryBoard({ s }: { s: EvalRun["summary"] | null }) {
  if (!s) return null;
  const cards: Array<{ label: string; value: string; color?: string }> = [
    { label: "用例数", value: String(s.total) },
    { label: "机器校验通过率", value: s.machinePassRate + "%", color: scoreColor(s.machinePassRate) },
    { label: "机器校验均分", value: String(s.avgMachine), color: scoreColor(s.avgMachine) },
    {
      label: "模型评审均分",
      value: s.avgModel != null ? String(s.avgModel) : "—",
      color: s.avgModel != null ? scoreColor(s.avgModel) : undefined,
    },
    { label: "违禁词命中", value: String(s.bannedHits), color: s.bannedHits ? "#dc2626" : "#16a34a" },
    { label: "编造价格数", value: String(s.fabricatedCount), color: s.fabricatedCount ? "#dc2626" : "#16a34a" },
    { label: "总耗时", value: (s.totalMs / 1000).toFixed(1) + "s" },
    { label: "总消耗", value: s.estCostLabel, color: "#7c3aed" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      {cards.map((c) => (
        <div key={c.label} className="card p-3">
          <div className="text-[11px] text-gray-400">{c.label}</div>
          <div className="text-[20px] font-semibold mt-1" style={{ color: c.color || "#111827" }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckRow({ c }: { c: CheckResult }) {
  return (
    <div className="flex items-start gap-2 text-[12px] py-1 border-b border-gray-50">
      <span
        className={`mt-0.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[10px] ${
          c.passed ? "bg-green-100 text-green-700" : c.isHard ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {c.passed ? "✓" : "✕"}
      </span>
      <div className="min-w-0">
        <div className="font-medium text-gray-800">
          {c.label}
          {c.isHard && <span className="ml-1 text-[10px] text-red-500">硬伤</span>}
          {!c.passed && !c.isHard && <span className="ml-1 text-[10px] text-amber-500">瑕疵</span>}
        </div>
        {!c.passed && c.failReason && <div className="text-gray-500">{c.failReason}</div>}
        {c.detail && <div className="text-gray-400 text-[11px]">{c.detail}</div>}
      </div>
    </div>
  );
}

export default function EvalPlatform() {
  const wf = useWorkflow();
  const [tab, setTab] = useState<Tab>("cases");

  // ---- 用例 ----
  const [cases, setCases] = useState<TestCase[]>([]);
  const [editing, setEditing] = useState<TestCase | null>(null);
  useEffect(() => {
    setCases(loadCases());
  }, []);

  // ---- 评测配置 ----
  const [cfg, setCfg] = useState<EvalConfig | null>(null);
  const [cfgMsg, setCfgMsg] = useState("");
  useEffect(() => {
    loadEvalConfig().then(setCfg);
  }, []);

  // ---- 运行配置 ----
  const [styles, setStyles] = useState<CreativeStyle[]>([]);
  const [selStyles, setSelStyles] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  useEffect(() => {
    loadCopyConfig().then((c) => {
      setStyles(c.creativeStyles || []);
      setSelStyles((c.creativeStyles || []).map((s) => s.name));
      setTone((c.tonePresets && c.tonePresets[0]) || "");
    });
  }, []);

  // ---- 运行态 ----
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [live, setLive] = useState<CaseResult[]>([]);
  const [runResult, setRunResult] = useState<EvalRun | null>(null);
  const stopRef = useRef(false);

  // ---- 历史 ----
  const [runs, setRuns] = useState<EvalRun[]>([]);
  useEffect(() => {
    setRuns(loadRuns());
  }, []);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");

  // 用例持久化
  function updateCases(next: TestCase[]) {
    setCases(next);
    saveCases(next);
  }

  function seedFromBusiness() {
    const newsList = (wf.displayNewsList && wf.displayNewsList.length ? wf.displayNewsList : wf.newsList).slice(0, 5);
    const lib = wf.productLibrary && wf.productLibrary.length ? wf.productLibrary : mockProducts;
    const picks: TestCase[] = newsList
      .map((n, i) => {
        const ps = lib.slice(i * 2, i * 2 + 2).map((p) => ({
          name: p.name,
          price: p.price,
          category: p.category,
          selling: p.selling,
        }));
        if (!ps.length) return null;
        return {
          id: "case-" + Date.now() + "-" + i,
          name: n.title.slice(0, 20) || "用例" + i,
          enabled: true,
          news: { title: n.title, summary: n.summary, keywords: n.keywords },
          products: ps,
          requiredTags: (n.keywords || []).slice(0, 2),
          tone: tone || undefined,
        };
      })
      .filter(Boolean) as TestCase[];
    updateCases([...cases, ...picks]);
    wf.showToast?.("success", `已生成 ${picks.length} 条种子用例`);
  }

  function handleRun() {
    if (!cfg) return;
    const chosen = styles.filter((s) => selStyles.includes(s.name));
    if (!chosen.length) return wf.showToast?.("error", "请至少选择 1 个创作风格");
    if (!cases.some((c) => c.enabled)) return wf.showToast?.("error", "请至少勾选 1 条用例");
    stopRef.current = false;
    setRunning(true);
    setLive([]);
    setProgress({ done: 0, total: 0, current: "" });
    setRunResult(null);
    runEval({
      cases,
      styles: chosen,
      tone,
      evalCfg: cfg,
      onProgress: (p) => setProgress({ done: p.done, total: p.total, current: p.current ?? "" }),
      onCase: (r) => setLive((prev) => [...prev, r]),
      shouldStop: () => stopRef.current,
    })
      .then((run) => {
        setRunResult(run);
        saveRun(run);
        setRuns(loadRuns());
        wf.showToast?.("success", `评测完成，已存入历史（${run.label}）`);
      })
      .catch((e) => wf.showToast?.("error", "评测出错：" + (e as Error).message.slice(0, 60)))
      .finally(() => setRunning(false));
  }

  const liveSummary = useMemo(() => {
    const list = runResult ? runResult.cases : live;
    if (!list.length) return null;
    const passed = list.filter((r) => r.validation.passed).length;
    const avgMachine = Math.round(list.reduce((s, r) => s + r.validation.score, 0) / list.length);
    const modelScores = list.filter((r) => r.review && r.review.ok).map((r) => (r.review!.scores.relevance + r.review!.scores.materialFidelity + r.review!.scores.appeal + r.review!.scores.naturalness) / 4 * 20);
    const avgModel = modelScores.length ? Math.round(modelScores.reduce((a, b) => a + b, 0) / modelScores.length) : null;
    const bannedHits = list.reduce((s, r) => s + r.validation.bannedHits.length, 0);
    const fabricatedCount = list.reduce((s, r) => s + r.validation.fabricatedAmounts.length, 0);
    return {
      total: list.length,
      machinePassRate: Math.round((passed / list.length) * 100),
      avgMachine,
      avgModel,
      bannedHits,
      fabricatedCount,
      totalCost: runResult ? runResult.summary.totalCost : 0,
      totalMs: runResult ? runResult.summary.totalMs : 0,
      estCostLabel: runResult ? runResult.summary.estCostLabel : "计算中…",
    };
  }, [live, runResult]);

  const estTasks = cases.filter((c) => c.enabled).length * Math.max(1, selStyles.length) * Math.max(1, cfg?.repeats || 1);

  // ---- 渲染 ----
  return (
    <div className="max-w-[1280px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">文案效果评测台</h1>
          <p className="text-[13px] text-gray-500 mt-1">用数据证明提示词改动「确实变好了」——机器校验 + 模型评审 + 自动返工，可追溯、可 A/B。</p>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-100">
        {([
          ["cases", "用例管理"],
          ["run", "跑评测"],
          ["history", "历史与对比"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px ${
              tab === k ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cases" && (
        <CasesView
          cases={cases}
          setCases={updateCases}
          editing={editing}
          setEditing={setEditing}
          onSeed={seedFromBusiness}
        />
      )}

      {tab === "run" && cfg && (
        <RunView
          cfg={cfg}
          setCfg={setCfg}
          onSaveCfg={async (c) => {
            await saveEvalConfig(c);
            setCfgMsg("已保存评测配置（本机 + 服务端）");
            setTimeout(() => setCfgMsg(""), 2000);
          }}
          cfgMsg={cfgMsg}
          styles={styles}
          selStyles={selStyles}
          setSelStyles={setSelStyles}
          tone={tone}
          setTone={setTone}
          caseCount={cases.filter((c) => c.enabled).length}
          estTasks={estTasks}
          running={running}
          progress={progress}
          live={live}
          runResult={runResult}
          liveSummary={liveSummary}
          onRun={handleRun}
          onStop={() => {
            stopRef.current = true;
          }}
        />
      )}

      {tab === "history" && (
        <HistoryView runs={runs} cmpA={cmpA} cmpB={cmpB} setCmpA={setCmpA} setCmpB={setCmpB} />
      )}
    </div>
  );
}

// ============================================================
// 用例管理
// ============================================================
function CasesView({
  cases,
  setCases,
  editing,
  setEditing,
  onSeed,
}: {
  cases: TestCase[];
  setCases: (c: TestCase[]) => void;
  editing: TestCase | null;
  setEditing: (c: TestCase | null) => void;
  onSeed: () => void;
}) {
  function toggle(id: string) {
    setCases(cases.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  }
  function del(id: string) {
    setCases(cases.filter((c) => c.id !== id));
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onSeed} className="h-9 px-3 rounded-lg btn-brand text-white text-[12.5px]">
          ＋ 从真实业务数据生成种子用例
        </button>
        <button onClick={() => setEditing({ id: "case-" + Date.now(), name: "", enabled: true, news: { title: "", summary: "", keywords: [] }, products: [], requiredTags: [] })} className="h-9 px-3 rounded-lg bg-gray-100 text-gray-700 text-[12.5px] hover:bg-gray-200">
          ＋ 新增用例
        </button>
        <span className="text-[12px] text-gray-400 ml-auto">共 {cases.length} 条，已勾选 {cases.filter((c) => c.enabled).length} 条参与本轮</span>
      </div>

      <div className="space-y-2">
        {cases.length === 0 && (
          <div className="card p-8 text-center text-[13px] text-gray-400">暂无用例，点上方按钮生成或新增。</div>
        )}
        {cases.map((c) => (
          <div key={c.id} className="card p-3 flex items-center gap-3">
            <input type="checkbox" checked={c.enabled} onChange={() => toggle(c.id)} className="w-4 h-4" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-gray-800 truncate">{c.name || "（未命名）"}</div>
              <div className="text-[11px] text-gray-400 truncate">热点：{c.news.title || "—"}</div>
            </div>
            <div className="text-[11px] text-gray-400 shrink-0">商品 {c.products.length} · 标签 {(c.requiredTags || []).length}</div>
            <button onClick={() => setEditing(c)} className="text-[12px] text-brand-600 hover:text-brand-700">编辑</button>
            <button onClick={() => del(c.id)} className="text-[12px] text-red-500 hover:text-red-600">删除</button>
          </div>
        ))}
      </div>

      {editing && (
        <CaseEditor cases={cases} setCases={setCases} editing={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CaseEditor({
  cases,
  setCases,
  editing,
  onClose,
}: {
  cases: TestCase[];
  setCases: (c: TestCase[]) => void;
  editing: TestCase;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing.name);
  const [newsTitle, setNewsTitle] = useState(editing.news.title);
  const [newsSummary, setNewsSummary] = useState(editing.news.summary || "");
  const [keywords, setKeywords] = useState((editing.news.keywords || []).join("、"));
  const [tags, setTags] = useState((editing.requiredTags || []).join("、"));
  const [prodText, setProdText] = useState(
    editing.products.map((p) => `${p.name}|${p.price}|${p.category || ""}|${(p.selling || []).join("/")}`).join("\n")
  );

  function save() {
    const products = prodText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [n, pr, cat, sell] = l.split("|");
        return { name: (n || "").trim(), price: Number((pr || "0").trim()) || 0, category: (cat || "").trim(), selling: (sell || "").split("/").map((s) => s.trim()).filter(Boolean) };
      })
      .filter((p) => p.name && p.price > 0);
    if (!name.trim()) return alert("请填写用例名称");
    if (!newsTitle.trim()) return alert("请填写热点标题");
    if (!products.length) return alert("请至少填写 1 条合法商品（名称|价格）");
    const next: TestCase = {
      id: editing.id,
      name: name.trim(),
      enabled: editing.enabled,
      news: { title: newsTitle.trim(), summary: newsSummary.trim(), keywords: keywords.split(/[，、,]/).map((s) => s.trim()).filter(Boolean) },
      products,
      requiredTags: tags.split(/[，、,#]/).map((s) => s.trim()).filter(Boolean),
    };
    const exists = cases.some((c) => c.id === editing.id);
    setCases(exists ? cases.map((c) => (c.id === editing.id ? next : c)) : [...cases, next]);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold mb-4">编辑用例</h3>
        <div className="space-y-3 text-[13px]">
          <div><label className="text-gray-500">用例名称</label><input className="w-full mt-1 p-2 border rounded-lg" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-gray-500">热点标题</label><input className="w-full mt-1 p-2 border rounded-lg" value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} /></div>
          <div><label className="text-gray-500">热点摘要</label><textarea className="w-full mt-1 p-2 border rounded-lg" rows={2} value={newsSummary} onChange={(e) => setNewsSummary(e.target.value)} /></div>
          <div><label className="text-gray-500">热点关键词（、分隔，作为话题标签来源）</label><input className="w-full mt-1 p-2 border rounded-lg" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
          <div><label className="text-gray-500">素材指定话题标签（、分隔）</label><input className="w-full mt-1 p-2 border rounded-lg" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
          <div>
            <label className="text-gray-500">商品（每行：名称|价格|分类|卖点/用斜杠）</label>
            <textarea className="w-full mt-1 p-2 border rounded-lg font-mono text-[12px]" rows={4} value={prodText} onChange={(e) => setProdText(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="h-9 px-4 rounded-lg bg-gray-100 text-gray-700 text-[13px]">取消</button>
          <button onClick={save} className="h-9 px-4 rounded-lg btn-brand text-white text-[13px]">保存用例</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 跑评测
// ============================================================
function RunView({
  cfg, setCfg, onSaveCfg, cfgMsg, styles, selStyles, setSelStyles, tone, setTone, caseCount, estTasks, running, progress, live, runResult, liveSummary, onRun, onStop,
}: {
  cfg: EvalConfig; setCfg: (c: EvalConfig) => void; onSaveCfg: (c: EvalConfig) => Promise<void>; cfgMsg: string;
  styles: CreativeStyle[]; selStyles: string[]; setSelStyles: (s: string[]) => void; tone: string; setTone: (t: string) => void;
  caseCount: number; estTasks: number; running: boolean; progress: { done: number; total: number; current: string };
  live: CaseResult[]; runResult: EvalRun | null; liveSummary: EvalRun["summary"] | null;
  onRun: () => void; onStop: () => void;
}) {
  const [adv, setAdv] = useState(false);
  function patch(p: Partial<EvalConfig>) {
    setCfg({ ...cfg, ...p });
  }
  const estCost = estTasks * (cfg.enabledReview ? 2 : 1) * cfg.unitPrice;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
      {/* 配置 */}
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="text-[14px] font-semibold mb-3">本轮配置</h3>
          <div className="text-[12px] text-gray-500 mb-2">参与创作风格（{selStyles.length}）</div>
          <div className="space-y-1">
            {styles.map((s) => (
              <label key={s.name} className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={selStyles.includes(s.name)} onChange={(e) => setSelStyles(e.target.checked ? [...selStyles, s.name] : selStyles.filter((x) => x !== s.name))} />
                {s.name}
              </label>
            ))}
          </div>
          <div className="mt-3 text-[12px] text-gray-500">主打语调</div>
          <input className="w-full mt-1 p-2 border rounded-lg text-[12.5px]" value={tone} onChange={(e) => setTone(e.target.value)} />

          <div className="grid grid-cols-2 gap-2 mt-3">
            <div><label className="text-[11px] text-gray-500">同时跑（并发）</label><input type="number" min={1} max={10} className="w-full mt-1 p-1.5 border rounded-lg text-[12.5px]" value={cfg.concurrency} onChange={(e) => patch({ concurrency: Number(e.target.value) || 1 })} /></div>
            <div><label className="text-[11px] text-gray-500">每条重复</label><input type="number" min={1} max={5} className="w-full mt-1 p-1.5 border rounded-lg text-[12.5px]" value={cfg.repeats} onChange={(e) => patch({ repeats: Number(e.target.value) || 1 })} /></div>
          </div>

          <label className="flex items-center gap-2 text-[12.5px] mt-3">
            <input type="checkbox" checked={cfg.enabledReview} onChange={(e) => patch({ enabledReview: e.target.checked })} /> 启用模型评审
          </label>
          <div className="text-[11px] text-gray-400 mt-1">权重：机器 {Math.round(cfg.weightsMachine * 100)}% / 模型 {Math.round((1 - cfg.weightsMachine) * 100)}%</div>
          <div className="flex items-center gap-2 mt-1">
            <input type="range" min={0} max={1} step={0.05} value={cfg.weightsMachine} onChange={(e) => patch({ weightsMachine: Number(e.target.value) })} className="flex-1" />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] mt-3">
            <input type="checkbox" checked={cfg.simulate} onChange={(e) => patch({ simulate: e.target.checked })} /> 模拟模式（离线/无密钥，用启发式代替真实模型）
          </label>
        </div>

        <div className="card p-4">
          <button onClick={() => setAdv(!adv)} className="text-[13px] font-medium text-brand-600 w-full text-left">
            {adv ? "▾" : "▸"} 高级：评测配置（违禁词 / 权重 / 提示词）
          </button>
          {adv && (
            <div className="mt-3 space-y-3 text-[12.5px]">
              <div><label className="text-gray-500">违禁词（每行一个）</label><textarea className="w-full mt-1 p-2 border rounded-lg font-mono text-[12px]" rows={4} value={cfg.bannedWords} onChange={(e) => patch({ bannedWords: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-gray-500">字数下限</label><input type="number" className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.lengthMin} onChange={(e) => patch({ lengthMin: Number(e.target.value) })} /></div>
                <div><label className="text-gray-500">字数上限</label><input type="number" className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.lengthMax} onChange={(e) => patch({ lengthMax: Number(e.target.value) })} /></div>
                <div><label className="text-gray-500">emoji 上限</label><input type="number" className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.emojiMax} onChange={(e) => patch({ emojiMax: Number(e.target.value) })} /></div>
                <div><label className="text-gray-500">标签数上限</label><input type="number" className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.hashtagCountMax} onChange={(e) => patch({ hashtagCountMax: Number(e.target.value) })} /></div>
              </div>
              <div><label className="text-gray-500">评审提示词</label><textarea className="w-full mt-1 p-2 border rounded-lg text-[12px]" rows={4} value={cfg.reviewPrompt} onChange={(e) => patch({ reviewPrompt: e.target.value })} /></div>
              <div><label className="text-gray-500">返工提示词</label><textarea className="w-full mt-1 p-2 border rounded-lg text-[12px]" rows={4} value={cfg.reworkPrompt} onChange={(e) => patch({ reworkPrompt: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-gray-500">单价（参考）</label><input type="number" step={0.001} className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.unitPrice} onChange={(e) => patch({ unitPrice: Number(e.target.value) })} /></div>
                <div><label className="text-gray-500">模型名（空=用接入默认）</label><input className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.model} onChange={(e) => patch({ model: e.target.value })} /></div>
              </div>
              <div><label className="text-gray-500">返工最多轮数</label><input type="number" min={1} max={5} className="w-full mt-1 p-1.5 border rounded-lg" value={cfg.reworkMaxRounds} onChange={(e) => patch({ reworkMaxRounds: Number(e.target.value) || 1 })} /></div>
              <button onClick={() => onSaveCfg(cfg)} className="h-9 w-full rounded-lg btn-brand text-white text-[12.5px]">保存评测配置</button>
              {cfgMsg && <div className="text-[11px] text-green-600">{cfgMsg}</div>}
            </div>
          )}
        </div>
      </div>

      {/* 运行区 */}
      <div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-gray-600">
              参与用例 <b>{caseCount}</b> · 风格 <b>{selStyles.length}</b> · 预计 <b>{estTasks}</b> 个任务 · 预计花费 <b>约 ¥{estCost.toFixed(2)}</b>
              <span className="text-[11px] text-gray-400">（参考价，以服务商官网为准，可自行修改）</span>
            </div>
            <div className="flex gap-2">
              {!running ? (
                <button onClick={onRun} className="h-9 px-4 rounded-lg btn-brand text-white text-[13px]">开始评测</button>
              ) : (
                <button onClick={onStop} className="h-9 px-4 rounded-lg bg-red-500 text-white text-[13px]">停止</button>
              )}
            </div>
          </div>
          {running && (
            <div className="mt-3">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 transition-all" style={{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + "%" }} />
              </div>
              <div className="text-[11px] text-gray-400 mt-1">{progress.done}/{progress.total} {progress.current && "· " + progress.current}</div>
            </div>
          )}
          <SummaryBoard s={liveSummary} />
        </div>

        <div className="card p-4 mt-4">
          <div className="text-[13px] font-semibold mb-2">明细（{live.length}）</div>
          <div className="space-y-2 max-h-[520px] overflow-auto">
            {live.length === 0 && <div className="text-[12px] text-gray-400">尚未开始。点「开始评测」后逐条填充。</div>}
            {live.map((r, i) => (
              <DetailRow key={i} r={r} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ r }: { r: CaseResult }) {
  const [open, setOpen] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(r.humanVote);
  const [note, setNote] = useState(r.humanNote);
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <span className="text-[12px] font-medium text-gray-800 w-40 truncate">{r.caseName}</span>
        <span className="text-[11px] text-gray-400">{r.styleName}</span>
        <span className="ml-auto text-[13px] font-semibold px-2 py-0.5 rounded" style={{ color: scoreColor(r.score.total), background: scoreColor(r.score.total) + "18" }}>
          {r.score.total}
        </span>
        {r.rework && r.rework.rounds.length > 0 && (
          <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 rounded">返工{r.rework.rounds.length}轮</span>
        )}
        <span className="text-[11px] text-gray-400">{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div className="mt-2 text-[12px]">
          <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-2 max-h-40 overflow-auto">{r.copy || "（无文案）"}</div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">机器校验（{r.validation.score} 分 · {r.validation.passed ? "通过" : "未过"}）</div>
              {r.validation.checks.map((c, k) => <CheckRow key={k} c={c} />)}
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">模型评审（{r.review ? (r.review.ok ? "成功" : "解析失败") : "未启用"}）</div>
              {r.review && r.review.ok ? (
                <div className="text-[12px] text-gray-700">
                  <div>热点关联 {r.review.scores.relevance} · 素材还原 {r.review.scores.materialFidelity}</div>
                  <div>传播吸引 {r.review.scores.appeal} · 语气自然 {r.review.scores.naturalness}</div>
                  <div className="text-gray-500 mt-1">“{r.review.comment}”</div>
                </div>
              ) : (
                <div className="text-gray-400">{r.review?.parseError || "—"}</div>
              )}
              {r.rework && r.rework.rounds.length > 0 && (
                <div className="mt-2 text-[11px]">
                  <div className="text-gray-400">返工追溯：{r.rework.improved ? "已提升" : r.rework.keptOriginal ? "保留原版" : "无变化"}</div>
                  {r.rework.rounds.map((rt) => (
                    <div key={rt.round} className="text-gray-500">
                      第{rt.round}轮 {rt.beforeScore}→{rt.afterScore}：修好[{rt.fixed.join(",") || "—"}]{rt.remaining.length ? " 剩[" + rt.remaining.join(",") + "]" : ""}{rt.keptPrevious ? "（保留上版）" : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => setVote("up")} className={`text-[12px] px-2 h-7 rounded ${vote === "up" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>👍 赞</button>
            <button onClick={() => setVote("down")} className={`text-[12px] px-2 h-7 rounded ${vote === "down" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>👎 踩</button>
            <input className="flex-1 p-1.5 border rounded-lg text-[12px]" placeholder="人工备注" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 历史与对比
// ============================================================
function HistoryView({
  runs, cmpA, cmpB, setCmpA, setCmpB,
}: {
  runs: EvalRun[]; cmpA: string; cmpB: string; setCmpA: (s: string) => void; setCmpB: (s: string) => void;
}) {
  const runA = runs.find((r) => r.id === cmpA) || null;
  const runB = runs.find((r) => r.id === cmpB) || null;
  const diff = runA && runB ? diffRuns(runA, runB) : null;

  function promptDiff(a: EvalRun, b: EvalRun): string {
    const parts: string[] = [];
    if (a.configSnapshot.copyPrompt.system !== b.configSnapshot.copyPrompt.system) parts.push("系统提示词已修改");
    if (a.configSnapshot.copyPrompt.template !== b.configSnapshot.copyPrompt.template) parts.push("素材模板已修改");
    if (a.configSnapshot.eval.reviewPrompt !== b.configSnapshot.eval.reviewPrompt) parts.push("评审提示词已修改");
    if (a.configSnapshot.eval.reworkPrompt !== b.configSnapshot.eval.reworkPrompt) parts.push("返工提示词已修改");
    if (a.weightsMachine !== b.weightsMachine) parts.push(`权重变化（机器 ${Math.round(a.weightsMachine * 100)}%→${Math.round(b.weightsMachine * 100)}%）`);
    if (a.configSnapshot.eval.bannedWords !== b.configSnapshot.eval.bannedWords) parts.push("违禁词清单已修改");
    return parts.length ? parts.join("；") : "两次运行的提示词配置一致";
  }

  return (
    <div>
      {runs.length === 0 && <div className="card p-8 text-center text-[13px] text-gray-400">暂无历史运行。去「跑评测」跑一轮并保存后会显示在这里。</div>}
      <div className="card p-4 mb-4">
        <div className="text-[13px] font-semibold mb-2">选择两次运行做 A/B 对比</div>
        <div className="flex gap-3 flex-wrap">
          <select className="p-2 border rounded-lg text-[12.5px]" value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
            <option value="">— 基准 A —</option>
            {runs.map((r) => <option key={r.id} value={r.id}>{r.label}（{new Date(r.createdAt).toLocaleString()}）</option>)}
          </select>
          <select className="p-2 border rounded-lg text-[12.5px]" value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
            <option value="">— 对比 B —</option>
            {runs.map((r) => <option key={r.id} value={r.id}>{r.label}（{new Date(r.createdAt).toLocaleString()}）</option>)}
          </select>
        </div>
        {runA && runB && diff && (
          <div className="mt-3">
            <div className="text-[12px] text-gray-500 mb-2">提示词差异：{promptDiff(runA, runB)}</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {diff.metrics.map((m) => {
                const up = (m.delta ?? 0) > 0;
                const down = (m.delta ?? 0) < 0;
                const good = m.better === true;
                const bad = m.better === false;
                const arrow = up ? "▲" : down ? "▼" : "—";
                const col = m.delta == null ? "#9ca3af" : good ? "#16a34a" : bad ? "#dc2626" : "#9ca3af";
                return (
                  <div key={m.key} className="border border-gray-100 rounded-lg p-2">
                    <div className="text-[11px] text-gray-400">{m.label}</div>
                    <div className="text-[15px] font-semibold" style={{ color: col }}>
                      {m.a ?? "—"} → {m.b ?? "—"} <span className="text-[11px]">{arrow}{m.delta != null ? m.delta : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-[12px] font-semibold">逐用例对比（变差的已高亮）</div>
            <div className="space-y-1 max-h-[360px] overflow-auto mt-1">
              {diff.cases.map((c, i) => (
                <div key={i} className={`flex items-center gap-3 text-[12px] p-2 rounded ${c.worse ? "bg-red-50" : ""}`}>
                  <span className="w-40 truncate text-gray-700">{c.caseName}</span>
                  <span className="text-gray-400 w-16">{c.styleName}</span>
                  <span className="text-gray-600">{c.aTotal} → {c.bTotal}</span>
                  <span style={{ color: c.delta > 0 ? "#16a34a" : c.delta < 0 ? "#dc2626" : "#9ca3af" }}>{c.delta > 0 ? "▲+" : c.delta < 0 ? "▼" : "—"}{c.delta}</span>
                  {c.worse && <span className="text-[10px] text-red-500">变差</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {runs.map((r) => (
          <div key={r.id} className={`card p-3 flex items-center gap-3 ${r.id === cmpA ? "ring-2 ring-blue-300" : r.id === cmpB ? "ring-2 ring-purple-300" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-gray-800">{r.label}</div>
              <div className="text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleString()} · 模型 {r.model || "默认"} · 权重 机器{Math.round(r.weightsMachine * 100)}%</div>
            </div>
            <div className="text-[11px] text-gray-500 text-right">
              <div>通过率 {r.summary.machinePassRate}%</div>
              <div>机器 {r.summary.avgMachine}{r.summary.avgModel != null ? " / 模型 " + r.summary.avgModel : ""}</div>
              <div className="text-red-400">违禁 {r.summary.bannedHits} · 编造 {r.summary.fabricatedCount}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
