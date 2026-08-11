export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  time: string;
  heat: number;
  category: string;
  keywords: string[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  image: string;
  selling: string[];
  category: string;
  matchKeywords: string[];
  // 商品库维护字段（运营在后台编辑，作为工作台展示与未来本地 matchGoods 的数据源）
  icon?: string;       // 表情图标（emoji），优先于按品类推导的 Lucide 图标
  gradient?: string;   // 背景渐变（CSS），优先于按品类推导的配色
  // Coze matchGoods output 额外字段（来自知识库"详情/最近一个月"）
  month?: number;     // 最近一个月销量（Coze output.最近一个月）
  detail?: string;    // 详情文本（Coze output.详情）
}

export interface MatchedProduct {
  product: Product;
  score: number;
}

export type ReviewStatus = "pending" | "approved" | "sent";

export interface CopyCandidate {
  style: string;   // 创作风格名称（驱动该候选版本的风格）
  text: string;    // 文案正文
}

export interface WorkflowState {
  currentStep: number;
  selectedNews: NewsItem | null;
  selectedProducts: Product[];
  copyList: string[];
  copyCandidates: CopyCandidate[];
  selectedCopyIndex: number;
  reviewStatus: ReviewStatus;
  isGenerating: boolean;
}

export type WorkflowAction =
  | { type: "SET_STEP"; payload: number }
  | { type: "SELECT_NEWS"; payload: NewsItem }
  | { type: "TOGGLE_PRODUCT"; payload: Product }
  | { type: "SET_SELECTED_PRODUCTS"; payload: Product[] }
  | { type: "SET_COPY_LIST"; payload: string[] }
  | { type: "SET_COPY_CANDIDATES"; payload: CopyCandidate[] }
  | { type: "SET_SELECTED_COPY_INDEX"; payload: number }
  | { type: "UPDATE_CANDIDATE_TEXT"; payload: { index: number; text: string } }
  | { type: "SET_REVIEW_STATUS"; payload: ReviewStatus }
  | { type: "SET_GENERATING"; payload: boolean }
  | { type: "RESET" };
