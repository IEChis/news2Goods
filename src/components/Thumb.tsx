import {
  Gamepad2, Cpu, Thermometer, Film, ShoppingBag, Plane,
  Newspaper, Lightbulb, ShoppingCart, PenLine, CheckCircle, Sparkles,
  type LucideIcon,
} from "lucide-react";

type Variant = "rose" | "blue" | "amber" | "violet" | "emerald" | "indigo" | "slate";

const VARIANT_BG: Record<Variant, string> = {
  rose:    "bg-rose-500",
  blue:    "bg-blue-500",
  amber:   "bg-amber-500",
  violet:  "bg-violet-500",
  emerald: "bg-emerald-500",
  indigo:  "bg-indigo-500",
  slate:   "bg-slate-500",
};

// 新闻分类
export function categoryToVariant(category: string): { variant: Variant; icon: LucideIcon } {
  const c = category.toLowerCase();
  if (c.includes("游戏") || c.includes("game")) return { variant: "rose",    icon: Gamepad2 };
  if (c.includes("科技") || c.includes("tech")) return { variant: "blue",    icon: Cpu };
  if (c.includes("生活") || c.includes("life")) return { variant: "amber",   icon: Thermometer };
  if (c.includes("娱乐") || c.includes("ent"))  return { variant: "violet",  icon: Film };
  if (c.includes("消费") || c.includes("shop")) return { variant: "emerald", icon: ShoppingBag };
  if (c.includes("旅游") || c.includes("tra"))  return { variant: "indigo",  icon: Plane };
  if (c.includes("财经") || c.includes("fin"))  return { variant: "amber",   icon: Newspaper };
  return { variant: "slate", icon: Newspaper };
}

// 商品分类
export function productToVariant(category: string): { variant: Variant; icon: LucideIcon } {
  const c = category.toLowerCase();
  if (c.includes("家电") || c.includes("数码")) return { variant: "blue",    icon: Cpu };
  if (c.includes("服饰") || c.includes("穿戴")) return { variant: "violet",  icon: ShoppingBag };
  if (c.includes("食品") || c.includes("饮"))   return { variant: "amber",   icon: Thermometer };
  if (c.includes("户外") || c.includes("运动")) return { variant: "emerald", icon: Plane };
  if (c.includes("家居") || c.includes("生活")) return { variant: "rose",    icon: ShoppingCart };
  if (c.includes("美妆") || c.includes("护肤")) return { variant: "violet",  icon: Sparkles };
  return { variant: "indigo", icon: ShoppingBag };
}

interface ThumbProps {
  category: string;
  kind?: "news" | "product";
  size?: "sm" | "md" | "lg";
  // 商品库维护字段：优先于按品类推导的图标 / 配色（保证工作台卡与后台卡视觉一致）
  emoji?: string;
  gradient?: string;
}

export default function Thumb({ category, kind = "news", size = "md", emoji, gradient }: ThumbProps) {
  const sizeCls = size === "sm" ? "w-9 h-9" : size === "lg" ? "w-12 h-12" : "w-10 h-10";

  // 商品且有运营指定的 emoji → 用 emoji + 渐变背景（与后台商品卡一致）
  if (kind === "product" && emoji) {
    const fontCls = size === "sm" ? "text-[18px]" : size === "lg" ? "text-[28px]" : "text-[22px]";
    const bg = gradient || "linear-gradient(135deg,#ddd6fe,#a78bfa)";
    return (
      <div
        className={`${sizeCls} rounded-xl flex items-center justify-center shrink-0`}
        style={{ background: bg }}
      >
        <span className={fontCls} style={{ lineHeight: 1 }}>{emoji}</span>
      </div>
    );
  }

  const { variant, icon: Icon } =
    kind === "news" ? categoryToVariant(category) : productToVariant(category);
  const iconCls = size === "sm" ? "w-4 h-4"  : size === "lg" ? "w-5 h-5"  : "w-[18px] h-[18px]";
  return (
    <div className={`${sizeCls} ${VARIANT_BG[variant]} rounded-xl flex items-center justify-center text-white shrink-0`}>
      <Icon className={iconCls} strokeWidth={2.2} />
    </div>
  );
}
