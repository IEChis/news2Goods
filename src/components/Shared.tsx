import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

/** 页面主标题块：日期 + 大标题 + 副标题 + 右侧动作区 */
export function PageHeader({
  date,
  title,
  subtitle,
  actions,
}: {
  date?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        {date && <div className="text-meta mb-2">{date}</div>}
        <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13.5px] text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 右上角"刷新"按钮（参考图样式：白底圆角 + 紫字 + 紫色图标） */
export function RefreshButton({ onClick, loading, label = "刷新热点" }: { onClick?: () => void; loading?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 h-9 px-3.5 bg-white border border-gray-200 rounded-lg text-[13px] font-medium text-brand-600 hover:bg-brand-50 hover:border-brand-200 transition-colors"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.2} />
      {label}
    </button>
  );
}

/** 底部"进入下一步"主按钮（紫色渐变大按钮，参考图风格） */
export function PrimaryActionButton({
  children,
  onClick,
  disabled,
  loading,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-white text-[14px] font-medium btn-brand disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${className}`}
    >
      {children}
    </button>
  );
}

/** "当前选中"信息条（参考图里"今日首个高温橙色预警..."） */
export function SelectedContextBar({
  icon,
  label,
  children,
  onAction,
  actionLabel,
  highlight,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
  onAction?: () => void;
  actionLabel?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border ${highlight ? "border-brand-200 bg-brand-50" : "border-gray-100 bg-white"} px-4 py-3 flex items-center gap-3`}>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-meta">{label}</span>
        </div>
        <div className="mt-0.5 text-[13.5px] font-medium text-gray-900 truncate">{children}</div>
      </div>
      {onAction && actionLabel && (
        <button onClick={onAction} className="text-[12.5px] font-medium text-brand-600 hover:text-brand-700 shrink-0">
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

/** 细线条（分组用） */
export function Divider() {
  return <div className="h-px bg-gray-100 my-5" />;
}
