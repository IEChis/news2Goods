/**
 * 品牌色应用 — 工作台侧
 *
 * 与 admin/app.js 的 applyBrandColor 互为镜像：
 *   - 后台 styles.css 用 var(--brand-600) 等
 *   - 工作台 Tailwind v4 用 var(--color-brand-600) 等
 * 这里同时覆盖两个命名空间，确保两端一致。
 *
 * 读取优先级与 loadCopyConfig / loadProducts 一致：
 *   ① 本机浏览器 (localStorage hg_admin_config_v1)
 *   ② 服务端 (/admin/server-config.json)
 *   ③ 内置默认 (#7c3aed)
 */

const LS_KEY = "hg_admin_config_v1";
const SERVER_URL = "/admin/server-config.json";
const DEFAULT_BRAND_COLOR = "#7c3aed";

export async function loadBrandColor(): Promise<string> {
  // ① 本机浏览器
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.brandColor === "string" && parsed.brandColor.trim()) {
        return parsed.brandColor.trim();
      }
    }
  } catch {
    /* localStorage 不可用 */
  }
  // ② 服务端
  try {
    const r = await fetch(SERVER_URL, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      if (data && typeof data.brandColor === "string" && data.brandColor.trim()) {
        return data.brandColor.trim();
      }
    }
  } catch {
    /* 服务不可用，落到默认 */
  }
  // ③ 内置默认
  return DEFAULT_BRAND_COLOR;
}

/** 把单个 brandColor 推算成 50-700 一整套色阶并写到 :root */
export function applyBrandColor(color: string): void {
  let def = typeof color === "string" && color.trim() ? color.trim() : DEFAULT_BRAND_COLOR;
  // 3 位 → 6 位
  const m3 = /^#?([0-9a-f]{3})$/i.exec(def);
  if (m3) def = "#" + m3[1].split("").map((c) => c + c).join("");
  const m6 = /^#?([0-9a-f]{6})$/i.exec(def);
  if (!m6) return;
  const h6 = m6[1];
  let r = parseInt(h6.slice(0, 2), 16) / 255;
  let g = parseInt(h6.slice(2, 4), 16) / 255;
  let b = parseInt(h6.slice(4, 6), 16) / 255;
  // RGB → HSL
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let H = 0, S = 0, L = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) H = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) H = (b - r) / d + 2;
    else H = (r - g) / d + 4;
    H /= 6;
  }
  H *= 360; S *= 100; L *= 100;
  const toHex = (rr: number, gg: number, bb: number) => {
    const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    return "#" + h(rr) + h(gg) + h(bb);
  };
  const setHsl = (hue: number, sat: number, lit: number): string => {
    const ss = Math.max(0, Math.min(100, sat)) / 100;
    const ll = Math.max(0, Math.min(100, lit)) / 100;
    if (ss === 0) return toHex(ll, ll, ll);
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return toHex(hue2rgb(H / 360 + 1 / 3), hue2rgb(H / 360), hue2rgb(H / 360 - 1 / 3));
  };
  const ramp: Record<string, string> = {
    "600": def,
    "700": setHsl(H, S, Math.max(20, L - 12)),
    "500": setHsl(H, S, Math.min(72, L + 6)),
    "400": setHsl(H, Math.max(0, S - 4),  Math.min(82, L + 14)),
    "300": setHsl(H, Math.max(0, S - 8),  Math.min(88, L + 22)),
    "200": setHsl(H, Math.max(0, S - 12), Math.min(93, L + 32)),
    "100": setHsl(H, Math.max(0, S - 20), Math.min(95, L + 40)),
    "50":  setHsl(H, Math.max(0, S - 30), Math.min(97, L + 46)),
  };
  const root = document.documentElement;
  Object.keys(ramp).forEach((k) => {
    root.style.setProperty("--color-brand-" + k, ramp[k]); // Tailwind v4 命名空间
    root.style.setProperty("--brand-" + k, ramp[k]);       // 后台 vanilla CSS 命名空间
  });
}

/** 一站式：读取 + 应用。挂载时调用一次即可。 */
export async function applyEffectiveBrandColor(): Promise<string> {
  const color = await loadBrandColor();
  applyBrandColor(color);
  return color;
}