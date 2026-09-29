/**
 * 统一「大模型接入」配置 —— 单一数据源。
 *
 * 工作台「模型设置」与运营后台「模型接入」都读写同一份配置：
 *   浏览器 localStorage 键 `hg_admin_config_v1` 下的 `.llm` 子对象。
 * 后台保存时还会把（已剥离 apiKey 的）镜像写入服务端，但「真源」始终是本机 localStorage。
 *
 * 设计要点（满足安全约束）：
 *   - API Key 属于敏感配置，只在「本数据访问层」内部出现；业务代码不持有、不传递 apiKey。
 *   - 业务代码如需判断是否已配置，调用 isConfigured()（只返回布尔），而不是读取 key 本身。
 *   - 所有真实的模型调用都走统一的 llmService（其统一出口为 /api/llm 代理 + 浏览器直连兜底）。
 *   - 本文件不把完整 API Key 写进 console.log / 异常 / 普通响应。
 */

const LS_KEY = "hg_admin_config_v1";

/** 统一的「大模型接入」配置结构（极简：Provider / Base URL / API Key / Model / Temperature） */
export interface LLMConfig {
  /** 仅用于展示的提供方标签，例如 "OpenAI 兼容" / "DeepSeek" / "通义千问" */
  provider: string;
  /** OpenAI 兼容端点的 Base URL（不含末尾 /chat/completions） */
  baseURL: string;
  /** 敏感：API Key。只在数据访问层内部使用，不外传、不打印全文 */
  apiKey: string;
  /** 模型名 */
  model: string;
  /** 采样温度，[0, 2] */
  temperature: number;
}

/** 内置默认（与 admin 的 BUILTIN_DEFAULTS.llm 保持一致）：全部留空，
 *  不预填任何地址 / 模型 / 密钥——由用户在「模型设置」自行填写（未配置时走离线兜底）。 */
export const BUILTIN_LLM_CONFIG: LLMConfig = {
  provider: "",
  baseURL: "",
  apiKey: "",
  model: "",
  temperature: 0.7,
};

function readRoot(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    }
  } catch {
    /* localStorage 不可用 / 解析失败 */
  }
  return {};
}

function writeRoot(root: Record<string, unknown>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(root));
  } catch {
    /* 隐私模式 / 配额异常 */
  }
}

/** 读取当前生效的「大模型接入」配置：本机 localStorage(.llm) → 内置默认 */
export function getLLMConfig(): LLMConfig {
  const root = readRoot();
  const l = (root.llm && typeof root.llm === "object" ? root.llm : {}) as Record<string, unknown>;
  const t = typeof l.temperature === "number" ? (l.temperature as number) : NaN;
  return {
    provider:
      typeof l.provider === "string" && l.provider.trim()
        ? l.provider
        : BUILTIN_LLM_CONFIG.provider,
    baseURL:
      typeof l.baseURL === "string" && l.baseURL.trim()
        ? l.baseURL
        : BUILTIN_LLM_CONFIG.baseURL,
    apiKey: typeof l.apiKey === "string" ? l.apiKey : BUILTIN_LLM_CONFIG.apiKey,
    model:
      typeof l.model === "string" && l.model.trim()
        ? l.model
        : BUILTIN_LLM_CONFIG.model,
    temperature:
      Number.isFinite(t) && t >= 0 && t <= 2 ? t : BUILTIN_LLM_CONFIG.temperature,
  };
}

/** 保存「大模型接入」配置（写入本机 localStorage 的 .llm；不落服务端文件） */
export function saveLLMConfig(cfg: LLMConfig): void {
  const root = readRoot();
  root.llm = {
    provider: cfg.provider,
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
  };
  writeRoot(root);
  // 同标签页内广播变更（storage 事件只跨标签页触发，这里补一个自定义事件做同标签页同步）
  try {
    window.dispatchEvent(new CustomEvent("hg-llm-config-change", { detail: cfg }));
  } catch {
    /* ignore */
  }
}

/** 清除「大模型接入」配置（恢复到内置默认：apiKey 清空） */
export function clearLLMConfig(): void {
  const root = readRoot();
  delete root.llm;
  writeRoot(root);
  try {
    window.dispatchEvent(new CustomEvent("hg-llm-config-change"));
  } catch {
    /* ignore */
  }
}

/**
 * 是否已配置可用的模型连接。只返回布尔，不暴露 key 本身，
 * 供业务代码分支（例如无密钥时走离线兜底），避免 apiKey 在业务层到处传递。
 */
export function isConfigured(): boolean {
  const c = getLLMConfig();
  return !!(c.baseURL && c.apiKey && c.model);
}

/** 订阅配置变更（跨标签页 storage 事件 + 同标签页自定义事件），返回取消订阅函数 */
export function onLLMConfigChange(cb: (cfg: LLMConfig) => void): () => void {
  const handler = (e: Event) => {
    if (e instanceof StorageEvent && e.key && e.key !== LS_KEY) return;
    cb(getLLMConfig());
  };
  window.addEventListener("storage", handler);
  window.addEventListener("hg-llm-config-change", handler as EventListener);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("hg-llm-config-change", handler as EventListener);
  };
}
