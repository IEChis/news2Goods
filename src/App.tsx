import { WorkflowProvider, useWorkflow } from "./context/WorkflowContext";
import Toast from "./components/Toast";
import TopHeader from "./components/TopHeader";
import LeftSidebar from "./components/LeftSidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import Step1News from "./components/steps/Step1News";
import Step2Suggest from "./components/steps/Step2Suggest";
import Step3Match from "./components/steps/Step3Match";
import Step4Create from "./components/steps/Step4Create";
import Step5Review from "./components/steps/Step5Review";
import EvalPlatform from "./components/eval/EvalPlatform";

function Workspace() {
  const { currentStep } = useWorkflow();
  switch (currentStep) {
    case 1: return <ErrorBoundary stepName="Step1 抓取新闻"><Step1News /></ErrorBoundary>;
    case 2: return <ErrorBoundary stepName="Step2 建议匹配"><Step2Suggest /></ErrorBoundary>;
    case 3: return <ErrorBoundary stepName="Step3 匹配商品"><Step3Match /></ErrorBoundary>;
    case 4: return <ErrorBoundary stepName="Step4 创作文案"><Step4Create /></ErrorBoundary>;
    case 5: return <ErrorBoundary stepName="Step5 审核发送"><Step5Review /></ErrorBoundary>;
    case 6: return <ErrorBoundary stepName="评测台"><EvalPlatform /></ErrorBoundary>;
    default: return <ErrorBoundary stepName="Step1"><Step1News /></ErrorBoundary>;
  }
}

export default function App() {
  return (
    <WorkflowProvider>
      <div className="flex flex-col h-screen">
        <TopHeader />
        <div className="flex flex-1 overflow-hidden">
          <LeftSidebar />
          <main className="flex-1 overflow-auto">
            <div className="px-10 py-8">
              <Workspace />
            </div>
          </main>
        </div>
        <Toast />
      </div>
    </WorkflowProvider>
  );
}
