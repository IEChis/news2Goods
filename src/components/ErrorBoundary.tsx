import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; stepName?: string; }
interface State { error: Error | null; info: ErrorInfo | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.stepName ?? "root", error, info);
    this.setState({ error, info });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-[1280px] mx-auto">
          <div className="card p-6 mt-6 border-rose-200 bg-rose-50/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-rose-700">
                  {this.props.stepName ? `${this.props.stepName} 渲染出错` : "页面渲染出错"}
                </div>
                <div className="mt-1 text-[13px] text-rose-600/90 break-all">
                  {this.state.error.message}
                </div>
                {this.state.info?.componentStack && (
                  <pre className="mt-3 p-3 bg-white border border-rose-100 rounded-lg text-[11.5px] text-gray-700 overflow-auto max-h-48 whitespace-pre-wrap">
                    {this.state.info.componentStack}
                  </pre>
                )}
                <button
                  onClick={() => this.setState({ error: null, info: null })}
                  className="mt-3 h-9 px-4 rounded-lg bg-white border border-rose-200 text-rose-700 text-[13px] font-medium hover:bg-rose-50"
                >
                  清除错误重试
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
