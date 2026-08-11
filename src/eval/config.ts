import type { EvalConfig } from "./types";
import { BUILTIN_EVAL } from "./prompts";

// 与运营后台 / 工作台共用同一把 localStorage 键
const LS_KEY = "hg_admin_config_v1";

function mergeEval(base?: unknown): EvalConfig {
  const b = base && typeof base === "object" ? (base as Record<string, unknown>) : {};
  return { ...BUILTIN_EVAL, ...b } as EvalConfig;
}

/**
 * 读取当前生效的评测配置：本机浏览器 → 服务端 → 内置默认。
 */
export async function loadEvalConfig(): Promise<EvalConfig> {
  // ① 本机浏览器（优先）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.eval) return mergeEval(p.eval);
    }
  } catch {
    /* ignore */
  }
  // ② 服务端
  try {
    const r = await fetch("/api/admin-config", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      if (d && d.config && d.config.eval) return mergeEval(d.config.eval);
    }
  } catch {
    /* ignore */
  }
  // ③ 内置默认
  return { ...BUILTIN_EVAL };
}

/**
 * 保存评测配置：写本机 + 同步服务端（保证后台也能看到）。
 * 服务端写入会触发备份（/api/admin-config 行为）。
 */
export async function saveEvalConfig(cfg: EvalConfig): Promise<{ target: string }> {
  let target = "local";
  // ① 本机
  try {
    let whole: any = {};
    const raw = localStorage.getItem(LS_KEY);
    if (raw) whole = JSON.parse(raw) || {};
    whole.eval = cfg;
    localStorage.setItem(LS_KEY, JSON.stringify(whole));
  } catch {
    /* ignore */
  }
  // ② 服务端
  try {
    const r = await fetch("/api/admin-config");
    let whole: any = {};
    if (r.ok) {
      const d = await r.json();
      if (d && d.config) whole = d.config;
    }
    whole.eval = cfg;
    const w = await fetch("/api/admin-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(whole),
    });
    if (w.ok) target = "server";
  } catch {
    /* ignore */
  }
  return { target };
}
