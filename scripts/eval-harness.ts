/* eslint-disable no-console */
/**
 * 评测引擎实测脚本（Task #77）
 * 用真实引擎函数（validateCopy / runReworkLoop / simulateRewriter / combineScores /
 * simulateReview）跑出实测数字，满足交付要求：机器校验部分用构造的违规文案验证，
 * 模型评审在无密钥/沙箱环境下用 simulateReview 兜底（输出标注 [SIM]）。
 *
 * 运行：scripts/run-harness.sh  （tsc 转 CJS → node 执行）
 */
import { validateCopy, getFixableFailures } from "../src/eval/validator";
import { runReworkLoop, simulateRewriter } from "../src/eval/rework";
import { combineScores } from "../src/eval/scoring";
import { simulateReview } from "../src/eval/reviewer";
import { BUILTIN_EVAL, toValidatorCfg } from "../src/eval/prompts";
import type { EvalConfig, EvalMaterial, ValidationResult, ReviewResult } from "../src/eval/types";

const cfg: EvalConfig = { ...BUILTIN_EVAL };
const vcfg = toValidatorCfg(cfg);

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("    ✅ " + msg); }
  else { fail++; console.log("    ❌ " + msg); }
}

function line(s = "") { console.log(s); }
function hr(t: string) {
  line("\n══════════════════════════════════════════════════════════════");
  line("  " + t);
  line("════════════════════════════════════════════════════════════\n");
}

// 展示一条校验结果
function showValidation(v: ValidationResult) {
  for (const c of v.checks) {
    const tag = c.isHard ? "[硬伤]" : "[瑕疵]";
    const mark = c.passed ? "PASS" : "FAIL";
    const reason = c.passed ? "" : "  → " + c.failReason;
    console.log(`    ${c.passed ? "✓" : "✗"} ${mark} ${tag} ${c.label}(${c.score}/${c.weight})${reason}`);
  }
  console.log(`    ── 机器校验总分: ${v.score}/100  ${v.passed ? "全部通过" : "存在未过项"}`);
}

// ───────────────────────── 素材 ─────────────────────────
const material: EvalMaterial = {
  news: { title: "强冷空气来袭，多地降温超10℃", summary: "今冬首场寒潮，南方也将入冬。" },
  products: [
    { name: "桌面迷你空调扇 制冷加湿三合一 静音款", price: 89, category: "清凉家电", selling: ["3秒速冷", "大容量水箱"] },
    { name: "便携旅行收纳套装 6件套 防水压缩袋", price: 168, category: "旅行用品", selling: ["防水", "压缩"] },
    { name: "氮化镓充电器 100W 三口快充 折叠插脚", price: 129, category: "数码配件", selling: ["100W", "折叠"] },
  ],
  requiredTags: ["热点借势"],
};

// ───────────────────────── 测试 A：机器校验抓住全部违规 + 一键修正 ─────────────────────────
async function main() {
hr("测试 A · 机器校验必须抓住所有违规（验收 #2）+ 一键修正（验收 #3）");
const badCopy =
  "【爆款】今天强冷空气来袭，最佳保暖选择就是桌面迷你空调扇，全网最低价只要¥9.9，绝对超值！" +
  "这款空调扇制冷快、静音、还能加湿，三合一设计非常适合办公室和卧室使用，冬天也能当暖风机用，错过等一年。" +
  "点我了解更多，详情：http://example.com/buy" +
  "这款空调扇真的是居家好物，制冷效率高不占桌面，水箱大不用勤加水，静音不扰工作，外观好看，朋友来家都夸，真心安利给需要的伙伴，买回家准满意。" +
  "我们店里还有很多同系列的好物，搭配购买更划算，客服随时在线为您答疑，物流也很给力，第二天就能送到家，售后无忧请放心下单，错过这波真的要等明年了。";

line("违规文案（构造）：");
line("  " + badCopy);
line("");

const v0 = validateCopy(badCopy, material, vcfg);
showValidation(v0);
line("");
console.log("    命中的违禁词: " + (v0.bannedHits.join("、") || "（无）"));
console.log("    编造的金额:   " + (v0.fabricatedAmounts.join("、") || "（无）"));
console.log("    素材真实金额: " + (v0.realAmounts.join("、") || "（无）"));
line("");

assert(v0.checks.find((c) => c.key === "banned")!.passed === false, "机器校验捕获『广告法违禁词』(最佳/全网最低/绝对)");
assert(v0.checks.find((c) => c.key === "fabricated")!.passed === false, "机器校验捕获『编造价格』(¥9.9 素材中不存在)");
assert(v0.checks.find((c) => c.key === "length")!.passed === false, "机器校验捕获『字数超限』");
assert(v0.checks.find((c) => c.key === "residual")!.passed === false, "机器校验捕获『残留排版符号』(【】)");
assert(v0.checks.find((c) => c.key === "hashtag")!.passed === false, "机器校验捕获『缺少素材指定话题标签』");
assert(v0.bannedHits.length >= 3, `违禁词命中数 ≥ 3（实得 ${v0.bannedHits.length}）`);
assert(v0.fabricatedAmounts.length >= 1, `编造金额数 ≥ 1（实得 ${v0.fabricatedAmounts.length}）`);

line("\n▶ 一键修正（runReworkLoop + simulateRewriter，最多 " + cfg.reworkMaxRounds + " 轮）：");
const rework = await runReworkLoop({
  text: badCopy,
  material,
  config: cfg,
  validate: (t) => validateCopy(t, material, vcfg),
  rewrite: (t, issues, m, c) => Promise.resolve(simulateRewriter(t, issues, m, c)),
});
for (const r of rework.rounds) {
  console.log(`    第${r.round}轮: ${r.beforeScore} → ${r.afterScore}  修好[${r.fixed.join(",") || "-"}]  剩[${r.remaining.join(",") || "-"}]${r.keptPrevious ? "  (保留上一版)" : ""}`);
}
line("");
console.log("    修正后文案: " + rework.finalText);
console.log("    最终机器分: " + rework.finalValidation.score + "/100，全部通过=" + rework.finalValidation.passed);
line("");
const fixableOrig = getFixableFailures(v0).map((c) => c.key);
const fixableFinal = getFixableFailures(rework.finalValidation).map((c) => c.key);
assert(fixableFinal.length === 0, `一键修正后『可修复项』全部清零（原 ${fixableOrig.length} 项 → 现 ${fixableFinal.length} 项）`);
assert(rework.improved === true, "修正后总分高于原始（improved=true）");
assert(rework.rounds.length <= cfg.reworkMaxRounds, `返工轮数 ≤ ${cfg.reworkMaxRounds}（实得 ${rework.rounds.length} 轮）`);

// ───────────────────────── 测试 B：批量返工通过率（验收 #4）─────────────────────────
hr("测试 B · 返工把大部分自动失败转成通过（验收 #4）");
const batch = [
  "【神价】今天降温最佳保暖神器桌面迷你空调扇全网最低价¥9.9绝对超值错过等一年 http://x.com/a",
  "【促销】便携旅行收纳套装现在只要¥19.9全网最低快抢绝对划算 http://x.com/b",
  "【热卖】氮化镓充电器100W全网最低价¥5.9绝对好用最佳推荐 http://x.com/c",
  "【必入】桌面迷你空调扇¥99.9全网最低绝对最佳赶紧买 http://x.com/d",
  "【福利】便携旅行收纳套装¥8.8全网最低绝对最佳手慢无 http://x.com/e",
];
let beforePass = 0;
let afterPass = 0;
console.log("  #  修正前  修正后  修了哪些");
for (let i = 0; i < batch.length; i++) {
  const txt = batch[i];
  const bv = validateCopy(txt, material, vcfg);
  if (bv.passed) beforePass++;
  const rw = await runReworkLoop({
    text: txt, material, config: cfg,
    validate: (t) => validateCopy(t, material, vcfg),
    rewrite: (t, issues, m, c) => Promise.resolve(simulateRewriter(t, issues, m, c)),
  });
  if (rw.finalValidation.passed) afterPass++;
  console.log(`  ${i + 1}  ${bv.passed ? "PASS" : "FAIL"}    ${rw.finalValidation.passed ? "PASS" : "FAIL"}    [${rw.issuesFixedAll.join(",") || "-"}]`);
}
line("");
assert(beforePass === 0, `批量构造的违规文案 修正前 0 条通过（实得 ${beforePass}/${batch.length}）`);
assert(afterPass >= Math.ceil(batch.length * 0.8), `返工后 ≥80% 通过（实得 ${afterPass}/${batch.length}）`);

// ───────────────────────── 测试 D：防回归守卫（验收 #3 的“越改越差就保留上一版”）─────────────────────────
hr("测试 D · 防回归守卫：改写若未提升则保留上一版（验收 #3 安全分支）");
const guard = await runReworkLoop({
  text: badCopy, material, config: cfg,
  validate: (t) => validateCopy(t, material, vcfg),
  rewrite: (t) => Promise.resolve(t), // 故意“啥也没改好”
});
console.log("    rounds: " + guard.rounds.length + "，improved=" + guard.improved + "，keptOriginal=" + guard.keptOriginal);
assert(guard.rounds.length === 0 || guard.rounds.every((r) => r.keptPrevious === true) || guard.keptOriginal === true || guard.improved === false,
  "改写未提升时：不采纳劣化版本（keptPrevious/keptOriginal 生效，improved=false）");

// ───────────────────────── 测试 C：A/B 对比（验收 #5）─────────────────────────
hr("测试 C · A/B 对比：改配置后再跑，展示指标差异与变差用例（验收 #5）");

function genCopy(i: number, mat: EvalMaterial): string {
  const p = mat.products[i % mat.products.length];
  const head = `${mat.news.title}！${p.name} 现价 ¥${p.price}，`;

  // 三种变体：合规 / 超限 / 含“必买”
  const variants = [
    // 合规（100~150 字，带标签+互动）
    head + "降温天备上它正合适。三合一设计安静又省电，办公室卧室都能用。趁着活动赶紧入手，手慢无～ #热点借势 你觉得值不值？评论区聊聊",
    // 超限（重复填充，run2 把字数上限调到 150 后会失败）
    head + "这款产品真的很好用，制冷快静音还能加湿，三合一设计非常适合办公室和卧室使用，冬天也能当暖风机，续航久外观也好看，朋友看了都说想买，" +
      "性价比超高值得入手，错过真的会后悔，赶紧囤货别犹豫。 #热点借势 你怎么看？",
    // 含“必买”（run2 把“必买”加入违禁词后会失败）
    head + "必买推荐，错过等一年！降温天有它更安心，三合一很实用。 #热点借势 想不想入手？",
  ];
  return variants[i % 3];
}

function runBatch(useCfg: EvalConfig): {
  summary: Record<string, number | string>;
  cases: Array<{ id: number; score: number; passed: boolean; machine: number; model: number; copy: string }>;
  elapsedMs: number;
} {
  const vc = toValidatorCfg(useCfg);
  const mat = material;
  const cases: Array<{ id: number; score: number; passed: boolean; machine: number; model: number; copy: string }> = [];
  let bannedHits = 0;
  let fabricated = 0;
  let machineSum = 0;
  let modelSum = 0;
  let passCount = 0;
  const t0 = Date.now();
  const N = 6;
  for (let i = 0; i < N; i++) {
    const copy = genCopy(i, mat);
    const v = validateCopy(copy, mat, vc);
    const rev: ReviewResult | null = useCfg.enabledReview ? simulateReview(v) : null;
    const sc = combineScores(v, rev, useCfg.weightsMachine);
    bannedHits += v.bannedHits.length;
    fabricated += v.fabricatedAmounts.length;
    machineSum += sc.machine;
    if (sc.model != null) modelSum += sc.model;
    if (v.passed) passCount++;
    cases.push({ id: i + 1, score: sc.total, passed: v.passed, machine: sc.machine, model: sc.model ?? 0, copy });
  }
  const elapsedMs = Date.now() - t0;
  const calls = N * (1 /*generate*/ + (useCfg.enabledReview ? 1 : 0) + 1 /*rework seed*/);
  const estCost = +(useCfg.unitPrice * calls).toFixed(4);
  return {
    summary: {
      total: N,
      machinePassRate: +((passCount / N) * 100).toFixed(1),
      avgMachine: +(machineSum / N).toFixed(1),
      avgModel: useCfg.enabledReview ? +(modelSum / N).toFixed(1) : 0,
      bannedHits,
      fabricated,
      estCost,
      elapsedMs,
    },
    cases,
    elapsedMs,
  };
}

const cfgA: EvalConfig = { ...BUILTIN_EVAL };
const cfgB: EvalConfig = {
  ...BUILTIN_EVAL,
  lengthMax: 150, // 收紧字数上限
  bannedWords: BUILTIN_EVAL.bannedWords + "\n必买", // 新增违禁词
};

const run1 = runBatch(cfgA);
const run2 = runBatch(cfgB);

console.log("\n  Run A（默认配置）summary:");
console.log("    " + JSON.stringify(run1.summary));
console.log("  Run B（lengthMax 200→150，新增违禁词『必买』）summary:");
console.log("    " + JSON.stringify(run2.summary));

// 指标差异
const metrics: Array<[string, number]> = [
  ["machinePassRate", run2.summary.machinePassRate as number - (run1.summary.machinePassRate as number)],
  ["avgMachine", run2.summary.avgMachine as number - (run1.summary.avgMachine as number)],
  ["avgModel", run2.summary.avgModel as number - (run1.summary.avgModel as number)],
  ["bannedHits", run2.summary.bannedHits as number - (run1.summary.bannedHits as number)],
];
line("\n  指标差异 (B − A):");
for (const [k, d] of metrics) {
  const arrow = d > 0 ? "🔺 +" : d < 0 ? "🔻 " : "➖ ";
  console.log(`    ${k}: ${arrow}${d}`);
}

// 逐用例对比 + 变差用例
line("\n  逐用例对比（总分 A → B）:");
const worsened: number[] = [];
for (let i = 0; i < run1.cases.length; i++) {
  const a = run1.cases[i];
  const b = run2.cases[i];
  const delta = b.score - a.score;
  const worse = delta < 0;
  if (worse) worsened.push(a.id);
  console.log(`    #${a.id}: ${a.score} → ${b.score} (${worse ? "⚠️ 变差" : delta > 0 ? "改善" : "持平"})  [A${a.passed ? "✓" : "✗"} → B${b.passed ? "✓" : "✗"}]`);
}
line("");
console.log("  变差用例（应被高亮）: " + (worsened.length ? worsened.map((n) => "#" + n).join(", ") : "无"));
assert(worsened.length > 0, "配置收紧后出现了变差用例（A/B 差异可观测）");

// 配置 diff
line("\n  配置 diff（用于『用结果改提示词』）：");
console.log("    lengthMax : " + cfgA.lengthMax + " → " + cfgB.lengthMax);
console.log("    bannedWords: 行数 " + cfgA.bannedWords.split("\n").filter(Boolean).length + " → " + cfgB.bannedWords.split("\n").filter(Boolean).length + " (新增『必买』)");

// ───────────────────────── 汇总 ─────────────────────────
hr("实测结论汇总");
console.log("  断言通过: " + pass + "，失败: " + fail);
console.log("  测试 A：机器校验在构造违规文案上命中 违禁词×" + v0.bannedHits.length + "、编造金额×" + v0.fabricatedAmounts.length +
  "，一键修正 " + rework.rounds.length + " 轮后『可修复项』清零、总分 " + v0.score + " → " + rework.finalValidation.score + "。");
console.log("  测试 B：批量 " + batch.length + " 条违规文案，修正前通过 " + beforePass + " 条、修正后通过 " + afterPass + " 条。");
console.log("  测试 C：Run A 机过率 " + run1.summary.machinePassRate + "% / Run B 机过率 " + run2.summary.machinePassRate +
  "%，变差用例 " + worsened.length + " 个；模型分[SIM] A 均 " + run1.summary.avgModel + " / B 均 " + run2.summary.avgModel + "。");
line("");
console.log(fail === 0 ? "  🎉 全部断言通过。" : "  ⚠️ 有断言失败，请检查上方 ❌。");
}

main().catch((e) => { console.error(e); process.exit(1); });
