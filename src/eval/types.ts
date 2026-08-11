// ============================================================
// 文案效果评测体系 —— 共享类型（与界面无关，主工作台与评测台共用）
// ============================================================

/** 单条校验的权重与性质 */
export interface CheckResult {
  key: string;            // 唯一键：length / hashtag / emoji / banned / fabricated / interaction / residual / product
  label: string;          // 中文名
  passed: boolean;        // 是否通过
  weight: number;         // 权重（用于加权总分，所有 check 的 weight 之和作为分母）
  isHard: boolean;        // 是否硬伤（违禁词 / 编造价格）
  score: number;          // 该项得分 0..weight（通过=weight，失败=0）
  failReason?: string;    // 失败原因（展示用）
  detail?: string;        // 细节（命中词、编造金额等）
}

/** 机器校验结果 */
export interface ValidationResult {
  length: number;             // 文案实际字数
  passed: boolean;            // 是否全部通过（硬性 + 瑕疵）
  score: number;              // 0..100 加权总分
  checks: CheckResult[];
  hardFailures: CheckResult[]; // 硬伤（违禁词 / 编造价格）
  flaws: CheckResult[];        // 瑕疵
  bannedHits: string[];        // 命中的违禁词
  fabricatedAmounts: string[]; // 编造的金额（文案里出现但素材里没有）
  realAmounts: string[];       // 素材里真实可用的金额
}

/** 模型评审结果（四维各 1..5 + 点评） */
export interface ReviewResult {
  ok: boolean;                          // 解析是否成功
  scores: { relevance: number; materialFidelity: number; appeal: number; naturalness: number };
  comment: string;
  raw: string;                          // 模型原始输出
  failed?: boolean;                     // 解析失败（标记本条评审失败，但不中断整轮）
  parseError?: string;
}

/** 机器校验分 + 模型评审分合成 */
export interface EvalScore {
  machine: number;        // 0..100
  model: number | null;   // 0..100 或 null（未启用 / 解析失败）
  total: number;          // 0..100
}

/** 评测素材（校验 / 评审 / 生成都基于它） */
export interface EvalMaterial {
  news: { title: string; summary?: string; keywords?: string[] };
  products: Array<{ name: string; price: number; category?: string; selling?: string[] }>;
  requiredTags?: string[]; // 文案应携带的话题标签（素材指定）
}

/** 返工：单轮记录 */
export interface ReworkRound {
  round: number;
  beforeScore: number;
  afterScore: number;
  fixed: string[];     // 本轮修好的问题 key
  remaining: string[]; // 本轮仍没解决（但之前失败）的问题 key
  text: string;        // 本轮改写后的文案
  keptPrevious?: boolean; // 本轮分数没涨，保留了上一版（未采纳）
}

/** 返工：完整结果 */
export interface ReworkResult {
  originalText: string;
  finalText: string;
  rounds: ReworkRound[];
  improved: boolean;       // 最终分是否高于原始
  keptOriginal: boolean;   // 最终是否回退到原始（越改越差）
  finalValidation: ValidationResult;
  issuesFixedAll: string[];
  issuesRemaining: string[];
}

/** 评测配置（三级读取：本机 → 服务端 → 内置默认） */
export interface EvalConfig {
  enabledReview: boolean;     // 是否启用模型评审
  weightsMachine: number;     // 机器校验权重 0..1（模型权重 = 1 - 此值）
  lengthMin: number;
  lengthMax: number;
  emojiMin: number;
  emojiMax: number;
  hashtagCountMax: number;
  bannedWords: string;        // 换行分隔的违禁词文本（存储用）
  reviewPrompt: string;
  reworkPrompt: string;
  reworkMaxRounds: number;
  concurrency: number;        // 同时进行的任务数
  repeats: number;            // 每条用例重复几次
  unitPrice: number;          // 单价（参考，以服务商官网为准）
  model: string;              // 评审 / 返工使用的模型
  reviewTemp: number;
  reworkTemp: number;
  simulate: boolean;          // 模拟模式（无密钥 / 离线时，用启发式代替真实模型）
}
