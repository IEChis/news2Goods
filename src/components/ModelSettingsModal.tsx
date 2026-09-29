import { useEffect, useState } from "react";
import { X, Plug, Loader2, Check, AlertTriangle } from "lucide-react";
import { getLLMConfig, saveLLMConfig, type LLMConfig } from "../api/llmConfig";
import { testConnection } from "../api/llmService";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 工作台「模型设置」弹层：编辑统一的「大模型接入」配置（单一数据源 hg_admin_config_v1.llm）。
 * 与运营后台「模型接入」读写同一份配置；保存后通过 storage 事件跨标签页同步。
 */
export default function ModelSettingsModal({ open, onClose }: Props) {
  const [provider, setProvider] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  // 每次打开时从统一配置载入当前值
  useEffect(() => {
    if (!open) return;
    const c = getLLMConfig();
    setProvider(c.provider);
    setBaseURL(c.baseURL);
    setApiKey(c.apiKey);
    setModel(c.model);
    setTemperature(c.temperature);
    setTestResult(null);
    setSaved(false);
  }, [open]);

  if (!open) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await testConnection({ baseURL, apiKey, model });
    setTestResult(r);
    setTesting(false);
  };

  const handleSave = () => {
    const cfg: LLMConfig = {
      provider: provider.trim() || "OpenAI 兼容",
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      temperature:
        Number.isFinite(temperature) && temperature >= 0 && temperature <= 2 ? temperature : 0.7,
    };
    saveLLMConfig(cfg);
    setSaved(true);
    setTimeout(onClose, 350);
  };

  const missing = !baseURL.trim() || !apiKey.trim() || !model.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-[460px] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-brand-600" />
            <span className="text-[15px] font-semibold text-gray-900">模型设置</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
          <Field label="提供方（展示用，可选）">
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="OpenAI 兼容 / DeepSeek / 通义千问 …"
              className="w-full h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-brand-200 focus:outline-none"
            />
          </Field>

          <Field label="Base URL">
            <input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://…/v1"
              className="w-full h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-brand-200 focus:outline-none font-mono"
            />
          </Field>

          <Field label="API Key">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              className="w-full h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-brand-200 focus:outline-none font-mono"
            />
          </Field>

          <Field label="Model">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-v4-flash"
              className="w-full h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-brand-200 focus:outline-none font-mono"
            />
          </Field>

          <Field label="Temperature（可选，0–2）">
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-10 px-3 bg-gray-50 border border-transparent rounded-xl text-[13px] text-gray-800 focus:bg-white focus:border-brand-200 focus:outline-none"
            />
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={testing || missing}
              className="h-9 px-3.5 rounded-lg text-[12.5px] text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1.5"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
              测试连接
            </button>
            {testResult && (
              <span
                className={`inline-flex items-center gap-1 text-[12px] ${
                  testResult.ok ? "text-emerald-600" : "text-rose-500"
                }`}
              >
                {testResult.ok ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {testResult.message}
              </span>
            )}
          </div>

          {missing && (
            <div className="text-[11.5px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              请填写 Base URL、API Key、Model 后再保存；未配置时工作台将走离线兜底。
            </div>
          )}

          <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
            API Key 仅保存在本机浏览器（localStorage），不会写入服务端文件，也不会出现在控制台或错误提示中。
            工作台与运营后台共用同一份配置。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 h-16 border-t border-gray-100 bg-gray-50/50">
          {saved && (
            <span className="mr-auto text-[12px] text-emerald-600 inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> 已保存
            </span>
          )}
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-5 rounded-lg text-[13px] text-white btn-brand font-medium"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-gray-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
