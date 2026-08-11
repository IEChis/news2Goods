/**
 * 商品库读取 —— 与运营后台 admin/ 共用同一份三级配置。
 *
 * 读取优先级（与 loadCopyConfig 一致）：本机浏览器(localStorage) → 服务端 → 内置默认。
 * 商品库是「运营可维护的单一数据源」：运营在后台新增 / 编辑的商品，经三级配置落到
 * 工作台后，Step3 手动匹配即可搜到，本地匹配算法（getMatchScores）也能把它推荐出来。
 *
 * 注意：未来 matchGoods 可能不再走 Coze，而是由外接大模型基于本地商品库实现；
 * 届时本地商品库就是匹配算法的唯一数据来源，这里就是那条链路的入口。
 */
import { mockProducts } from "../data/mock";
import type { Product } from "../types";

const LS_KEY = "hg_admin_config_v1";

interface RawProduct {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  category: string;
  selling: string[];
  icon?: string;
  gradient?: string;
}

// 卖点 + 品类作为本地匹配算法的「匹配词」（未来本地 matchGoods 也复用同一套语义）
function deriveMatchKeywords(p: RawProduct): string[] {
  return [p.category || "", ...(p.selling || [])]
    .map((s) => (s || "").trim())
    .filter(Boolean);
}

function mapToProduct(p: RawProduct): Product {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    originalPrice: p.originalPrice,
    image: "", // 渐变/图标由 icon+gradient 驱动，image 仅作 Coze 兜底字段保留
    selling: p.selling || [],
    category: p.category || "",
    matchKeywords: deriveMatchKeywords(p),
    icon: p.icon || "",
    gradient: p.gradient || "",
  };
}

/**
 * 读取当前生效的商品库：本机 → 服务端 → 内置默认(mockProducts)。
 * 返回工作台统一的 Product[]（带 icon/gradient/matchKeywords）。
 */
export async function loadProducts(): Promise<Product[]> {
  let src: { products?: RawProduct[] } | null = null;

  // ① 本机浏览器（运营保存的覆盖值，优先）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.products) && parsed.products.length) src = parsed;
    }
  } catch {
    /* localStorage 不可用 */
  }

  // ② 服务端
  if (!src) {
    try {
      const r = await fetch("/api/admin-config", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        if (d && d.config && Array.isArray(d.config.products) && d.config.products.length) {
          src = d.config as { products: RawProduct[] };
        }
      }
    } catch {
      /* 服务不可用，落到内置默认 */
    }
  }

  // ③ 内置默认（mockProducts 作为兜底，保证工作台永不空库）
  const list: RawProduct[] =
    src && Array.isArray(src.products) && src.products.length
      ? src.products
      : (mockProducts as unknown as RawProduct[]);

  return list.map(mapToProduct);
}
