import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useWorkflow } from "../context/WorkflowContext";

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const TONES = {
  success: "text-emerald-600 border-emerald-100",
  error: "text-rose-600 border-rose-100",
  info: "text-brand-600 border-brand-100",
} as const;

export default function Toast() {
  const { toasts, dismissToast } = useWorkflow();

  useEffect(() => {
    if (toasts.length === 0) return;
    const last = toasts[toasts.length - 1];
    const t = setTimeout(() => dismissToast(last.id), 2400);
    return () => clearTimeout(t);
  }, [toasts, dismissToast]);

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((it) => {
        const Icon = ICONS[it.kind];
        return (
          <div
            key={it.id}
            className={`flex items-center gap-2.5 pl-3 pr-2 py-2.5 bg-white border rounded-xl shadow-[0_4px_20px_-8px_rgba(0,0,0,0.12)] ${TONES[it.kind]}`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[13px] text-gray-800">{it.text}</span>
            <button
              onClick={() => dismissToast(it.id)}
              className="ml-1 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
