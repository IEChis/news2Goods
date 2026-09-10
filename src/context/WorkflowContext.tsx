import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { WorkflowState, WorkflowAction, NewsItem, Product, CopyCandidate } from "../types";
import { mockNews, mockProducts } from "../data/mock";
import { runGetNews, runMatchByLLM, parseKeywords, searchProductsByKeywords } from "../api/coze";
import { runCreateCopyByLLM, type CopyLLM } from "../api/llm";
import { runFetchNews } from "../api/news";
import { loadCopyConfig, assembleUserPrompt, loadMatchConfig, type CreativeStyle, type CopyConfig, type MatchMode } from "../api/promptConfig";
import { loadProducts } from "../api/products";

const initialState: WorkflowState = {
  currentStep: 1,
  selectedNews: null,
  selectedProducts: [],
  copyList: [],
  copyCandidates: [],
  selectedCopyIndex: 0,
  reviewStatus: "pending",
  isGenerating: false,
};

// 工作台进度持久化（仅当前标签页会话内有效）：切到后台再切回 / 时自动恢复，
// 避免「同标签切换」因整页重载而丢失 React 状态。关闭标签页即清除，不留跨会话残留。
// 注意：不仅持久化 reducer 的 workflow 状态，还要持久化从 Coze 拉回的真实数据
// （cozeNews / cozeProducts / 接入标志），否则切回后新闻列表会退回 mock 数据。
const STORAGE_KEY = "hg_workflow_state_v1";

interface PersistSnapshot {
  workflow: WorkflowState;
  cozeNews: NewsItem[];
  cozeProducts: Product[];
  cozeLoaded: boolean;
  matchGoodsLoaded: boolean;
  matchMode: MatchMode;
  matchKeywords: string[];
}

function loadSnapshot(): PersistSnapshot {
  const fallback: PersistSnapshot = {
    workflow: initialState,
    cozeNews: [],
    cozeProducts: [],
    cozeLoaded: false,
    matchGoodsLoaded: false,
    matchMode: "coze",
    matchKeywords: [],
  };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const wf = parsed.workflow || {};
    const copyCandidates = Array.isArray(wf.copyCandidates) ? wf.copyCandidates : [];
    const copyList = Array.isArray(wf.copyList) ? wf.copyList : [];
    const maxIdx = Math.max(copyCandidates.length, copyList.length, 1) - 1;
    const selectedCopyIndex =
      typeof wf.selectedCopyIndex === "number"
        ? Math.max(0, Math.min(wf.selectedCopyIndex, maxIdx))
        : 0;
    const workflow: WorkflowState = {
      ...initialState,
      currentStep: typeof wf.currentStep === "number" ? wf.currentStep : 1,
      selectedNews: wf.selectedNews ?? null,
      selectedProducts: Array.isArray(wf.selectedProducts) ? wf.selectedProducts : [],
      copyList,
      copyCandidates,
      selectedCopyIndex,
      reviewStatus: wf.reviewStatus === "approved" || wf.reviewStatus === "rejected"
        ? wf.reviewStatus
        : "pending",
      isGenerating: false, // 永不恢复“生成中”这种瞬态
    };
    return {
      workflow,
      cozeNews: Array.isArray(parsed.cozeNews) ? parsed.cozeNews : [],
      cozeProducts: Array.isArray(parsed.cozeProducts) ? parsed.cozeProducts : [],
      cozeLoaded: !!parsed.cozeLoaded,
      matchGoodsLoaded: !!parsed.matchGoodsLoaded,
      matchMode: parsed.matchMode === "llm" ? "llm" : "coze",
      matchKeywords: Array.isArray(parsed.matchKeywords) ? parsed.matchKeywords : [],
    };
  } catch {
    return fallback;
  }
}

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, currentStep: action.payload };

    case "SELECT_NEWS": {
      if (state.selectedNews?.id === action.payload.id) {
        return { ...state, currentStep: 2 };
      }
      return {
        ...state,
        selectedNews: action.payload,
        selectedProducts: [],
        copyList: [],
        selectedCopyIndex: 0,
        reviewStatus: "pending",
        isGenerating: false,
        currentStep: 2,
      };
    }

    case "TOGGLE_PRODUCT": {
      const exists = state.selectedProducts.some((p) => p.id === action.payload.id);
      return {
        ...state,
        selectedProducts: exists
          ? state.selectedProducts.filter((p) => p.id !== action.payload.id)
          : [...state.selectedProducts, action.payload],
      };
    }

    case "SET_SELECTED_PRODUCTS":
      return { ...state, selectedProducts: action.payload };

    case "SET_COPY_LIST":
      return { ...state, copyList: action.payload, selectedCopyIndex: 0, reviewStatus: "pending" };

    case "SET_COPY_CANDIDATES": {
      const candidates = action.payload;
      // copyList 同步为候选正文（顺序与候选一致），供 Step5 审核 / 预览沿用
      return {
        ...state,
        copyCandidates: candidates,
        copyList: candidates.map((c) => c.text),
        selectedCopyIndex: 0,
        reviewStatus: "pending",
      };
    }

    case "SET_SELECTED_COPY_INDEX":
      return { ...state, selectedCopyIndex: action.payload };

    case "UPDATE_CANDIDATE_TEXT": {
      const { index, text } = action.payload;
      return {
        ...state,
        copyCandidates: state.copyCandidates.map((c, i) => (i === index ? { ...c, text } : c)),
        copyList: state.copyList.map((t, i) => (i === index ? text : t)),
      };
    }

    case "SET_REVIEW_STATUS":
      return { ...state, reviewStatus: action.payload };

    case "SET_GENERATING":
      return { ...state, isGenerating: action.payload };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

export type ToastKind = "success" | "error" | "info";
export interface ToastItem { id: number; kind: ToastKind; text: string }

interface WorkflowContextValue {
  // state
  state: WorkflowState;
  currentStep: WorkflowState["currentStep"];
  currentNews: NewsItem | null;
  selectedProducts: Product[];
  selectedProductIds: string[];
  copyList: string[];
  copyCandidates: CopyCandidate[];
  selectedCopyIndex: number;
  reviewStatus: WorkflowState["reviewStatus"];
  isGenerating: boolean;
  newsList: NewsItem[];

  // Coze 真实数据（按工作流拆）
  cozeNews: NewsItem[];              // 来自 getNews
  cozeProducts: Product[];           // 来自 matchGoods
  visibleCozeProducts: Product[];    // 过滤掉「已删除商品」后的推荐（验收 #3）
  cozeLoading: boolean;              // 任一工作流调用中
  cozeLoaded: boolean;               // 是否接过 Coze（任一）
  matchGoodsLoading: boolean;
  matchGoodsLoaded: boolean;
  // 大模型匹配（llm 模式）元信息
  matchMode: MatchMode;
  matchKeywords: string[];
  displayNewsList: NewsItem[];

  // 商品库（运营后台维护的单一数据源，三级配置读取；工作台匹配 / 搜索都从它取）
  productLibrary: Product[];

  // 三个独立工作流调用
  fetchGetNews: (q?: string) => Promise<void>;
  fetchMatchGoods: (news: NewsItem, q?: string) => Promise<void>;
  fetchCreateCopy: (news: NewsItem, products: Product[], userPrompt?: string) => Promise<void>;
  /** 按创作风格逐个跑 createCopy，每个风格产出 1 个候选版本 */
  fetchCreateCopyMulti: (
    news: NewsItem,
    products: Product[],
    tone: string,
    styles: CreativeStyle[],
    extra?: string
  ) => Promise<void>;

  // setters
  setCurrentStep: (s: WorkflowState["currentStep"]) => void;
  setCurrentNews: (n: NewsItem) => void;
  bindProduct: (id: string) => void;
  unbindProduct: (id: string) => void;
  toggleProduct: (id: string) => void;
  setSelectedProducts: (ids: string[]) => void;
  setCopyList: (list: string[]) => void;
  setSelectedCopyIndex: (i: number) => void;
  updateCurrentCopyText: (text: string) => void;
  setReviewStatus: (s: WorkflowState["reviewStatus"]) => void;
  setGenerating: (b: boolean) => void;
  refreshNews: () => void;
  refreshing: boolean;
  reset: () => void;

  // toast
  toasts: ToastItem[];
  showToast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export type Step = 1 | 2 | 3 | 4 | 5;

export function WorkflowProvider({ children }: { children: ReactNode }) {
  // 一次性从 sessionStorage 恢复：reducer 状态 + Coze 真实数据
  const [snapshot] = useState(loadSnapshot);
  const [state, dispatch] = useReducer(workflowReducer, snapshot.workflow);
  const [newsList, setNewsList] = useState<NewsItem[]>(mockNews);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useState(() => ({ current: 0 }))[0];

  // Coze 数据
  const [cozeNews, setCozeNews] = useState<NewsItem[]>(snapshot.cozeNews);
  const [cozeProducts, setCozeProducts] = useState<Product[]>(snapshot.cozeProducts);
  const [cozeLoading, setCozeLoading] = useState(false);
  const [cozeLoaded, setCozeLoaded] = useState<boolean>(snapshot.cozeLoaded);
  const [matchGoodsLoading, setMatchGoodsLoading] = useState(false);
  const [matchGoodsLoaded, setMatchGoodsLoaded] = useState<boolean>(snapshot.matchGoodsLoaded);
  // 大模型匹配（llm 模式）的元信息：当前匹配方式与 LLM 生成的关键词
  const [matchMode, setMatchMode] = useState<MatchMode>(snapshot.matchMode);
  const [matchKeywords, setMatchKeywords] = useState<string[]>(snapshot.matchKeywords);
  // 最近一次 matchGoods 时「商品库」的 id 快照：用于判断一条推荐商品是否来自本地商品库。
  // 若来自本地库、但当前商品库已删掉它 → 是「已删除商品的残留推荐」，UI 上应过滤掉（验收 #3）。
  const [cozeLibraryIds, setCozeLibraryIds] = useState<Set<string>>(new Set());

  // 商品库：运营后台维护的单一数据源（三级配置读取）；加载失败时回退 mockProducts
  const [productLibrary, setProductLibrary] = useState<Product[]>([]);
  useEffect(() => {
    let alive = true;
    loadProducts()
      .then((list) => { if (alive) setProductLibrary(list.length ? list : mockProducts); })
      .catch(() => { if (alive) setProductLibrary(mockProducts); });
    return () => { alive = false; };
  }, []);

  // 推荐商品可见性：来自本地商品库、但已被删除的残留推荐要过滤掉（验收 #3）。
  // 规则：coze 推荐商品若 id 在「匹配时的商品库快照」里（说明它本属本地库），但当前商品库已无该 id → 过滤；
  // 其余（Coze 知识库独有商品，或本地库仍在的）保留。商品库未加载完前不过滤，避免误删。
  const visibleCozeProducts = useMemo(() => {
    if (!productLibrary.length) return cozeProducts;
    return cozeProducts.filter(
      (p) => !cozeLibraryIds.has(p.id) || productLibrary.some((lp) => lp.id === p.id)
    );
  }, [cozeProducts, cozeLibraryIds, productLibrary]);

  // 每次状态变化写回 sessionStorage（切后台/刷新页面后自动恢复进度）
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ workflow: state, cozeNews, cozeProducts, cozeLoaded, matchGoodsLoaded, matchMode, matchKeywords })
      );
    } catch {
      /* 忽略隐私模式 / 配额异常 */
    }
  }, [state, cozeNews, cozeProducts, cozeLoaded, matchGoodsLoaded, matchMode, matchKeywords]);

  const displayNewsList = useMemo(
    () => (cozeNews.length ? cozeNews : newsList),
    [cozeNews, newsList]
  );

  // 工具：显示 toast
  const showToast = useCallback((kind: ToastKind, text: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
  }, [toastIdRef]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- 工作流 1：新闻抓取（可配置来源，经 /api/news 真实抓取）----
  const fetchGetNews = useCallback(async (q = "") => {
    setCozeLoading(true);
    try {
      const news = await runFetchNews();
      setCozeNews(news);
      setCozeLoaded(true);
      showToast("success", `已抓取 ${news.length} 条热点（来自已启用来源）`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast("error", `抓取失败：${msg.slice(0, 80)}`);
      console.error("[fetchGetNews]", e);
    } finally {
      setCozeLoading(false);
    }
  }, [showToast]);

  // ---- 工作流 2：matchGoods（按用户选定的单条新闻）----
  // 支持两种模式：
  //   - coze：沿用既有 matchGoods 工作流（Coze 知识库返回商品）。
  //   - llm ：前端用大模型分析新闻 → 生成关键词 → 在本地商品库检索并推荐命中商品。
  const fetchMatchGoods = useCallback(async (news: NewsItem, q = "") => {
    setMatchGoodsLoading(true);
    setCozeLoading(true);
    try {
      const cfg = await loadMatchConfig();
      // 实时读取商品库，记录「匹配发生时」的 id 快照（用于删除后过滤残留推荐，验收 #3）
      const lib = await loadProducts();
      const pool = lib.length ? lib : mockProducts;
      setCozeLibraryIds(new Set(pool.map((p) => p.id)));
      // 商品匹配：统一走「接入的大模型」（不再使用 Coze 工作流）
      const useSim = cfg.llm.simulate || !cfg.llm.apiKey;
      let keywords: string[] = [];
      if (useSim) {
        // 本地兜底：无密钥 / 勾选模拟时，用新闻自带 keywords 作为检索词
        keywords = news.keywords && news.keywords.length ? news.keywords : [];
      } else {
        const raw = await runMatchByLLM(news, cfg.prompt, cfg.llm);
        keywords = parseKeywords(raw);
        if (!keywords.length) keywords = news.keywords || []; // LLM 说"没有对应内容"时回退新闻关键词
      }
      const found = searchProductsByKeywords(keywords, pool);
      setCozeProducts(found);
      setMatchKeywords(keywords);
      setMatchMode("llm");
      setMatchGoodsLoaded(true);
      setCozeLoaded(true);
      showToast(
        found.length ? "success" : "info",
        `大模型匹配：${keywords.join("、") || "—"} → 命中 ${found.length} 件`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast("error", `匹配失败：${msg.slice(0, 80)}`);
      console.error("[fetchMatchGoods]", e);
    } finally {
      setMatchGoodsLoading(false);
      setCozeLoading(false);
    }
  }, [showToast]);

  // ---- 工作流 3：createCopy（按选定新闻+商品 + 用户创作要求）----
  const fetchCreateCopy = useCallback(async (news: NewsItem, products: Product[], userPrompt = "") => {
    setCozeLoading(true);
    try {
      const mc = await loadMatchConfig();
      const llm: CopyLLM = { baseURL: mc.llm.baseURL, apiKey: mc.llm.apiKey, model: mc.llm.model };
      const cfg = await loadCopyConfig();
      const res = await runCreateCopyByLLM(
        { title: news.title, summary: news.summary, keywords: news.keywords },
        products,
        { tone: "", styleName: "", styleRequirement: "", extraRequirement: userPrompt, prompt: cfg.prompt },
        llm
      );
      if (res.length) {
        dispatch({ type: "SET_COPY_LIST", payload: res });
        setCozeLoaded(true);
        showToast("success", `大模型生成 ${res.length} 条文案`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast("error", `生成失败：${msg.slice(0, 80)}`);
      console.error("[fetchCreateCopy]", e);
    } finally {
      setCozeLoading(false);
    }
  }, [showToast]);

  // ---- 工作流 3（多风格版）：按创作风格逐个跑 createCopy，每个风格 → 1 个候选版本 ----
  const fetchCreateCopyMulti = useCallback(
    async (news: NewsItem, products: Product[], tone: string, styles: CreativeStyle[], extra = "") => {
      if (!styles || styles.length === 0) {
        showToast("error", "尚未配置任何创作风格（至少需保留 1 个）");
        return;
      }
      setCozeLoading(true);
      try {
        // 配置只加载一次（prompt / 风格 / 语调都在同一份配置里）
        let cfg: CopyConfig;
        try {
          cfg = await loadCopyConfig();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          showToast("error", `读取后台模板失败：${msg.slice(0, 60)}`);
          return;
        }

        const mc = await loadMatchConfig();
        const llm: CopyLLM = { baseURL: mc.llm.baseURL, apiKey: mc.llm.apiKey, model: mc.llm.model };
        const candidates: CopyCandidate[] = [];
        for (let i = 0; i < styles.length; i++) {
          const st = styles[i];
          // 每个风格独立调用一次「接入的大模型」；模型按“单版本”指令产出 1 条，取首段作为该风格候选
          const res = await runCreateCopyByLLM(
            { title: news.title, summary: news.summary, keywords: news.keywords },
            products,
            { tone, styleName: st.name, styleRequirement: st.requirement, extraRequirement: extra, prompt: cfg.prompt },
            llm
          );
          const text = (res && res[0] && res[0].trim()) ? res[0].trim() : "";
          candidates.push({ style: st.name, text });
        }

        if (candidates.length) {
          dispatch({ type: "SET_COPY_CANDIDATES", payload: candidates });
          setCozeLoaded(true);
          showToast("success", `已按 ${candidates.length} 个创作风格调用大模型生成候选版本`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showToast("error", `生成失败：${msg.slice(0, 80)}`);
        console.error("[fetchCreateCopyMulti]", e);
      } finally {
        setCozeLoading(false);
      }
    },
    [showToast]
  );

  const refreshNews = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setNewsList((prev) => [...prev].sort((a, b) => b.heat - a.heat));
      setRefreshing(false);
    }, 800);
  }, []);

  const selectedProductIds = useMemo(
    () => state.selectedProducts.map((p) => p.id),
    [state.selectedProducts]
  );

  const value: WorkflowContextValue = {
    state,
    currentStep: state.currentStep,
    currentNews: state.selectedNews,
    selectedProducts: state.selectedProducts,
    selectedProductIds,
    copyList: state.copyList,
    copyCandidates: state.copyCandidates,
    selectedCopyIndex: state.selectedCopyIndex,
    reviewStatus: state.reviewStatus,
    isGenerating: state.isGenerating,
    newsList,

    cozeNews,
    cozeProducts,
    visibleCozeProducts,
    cozeLoading,
    cozeLoaded,
    matchGoodsLoading,
    matchGoodsLoaded,
    matchMode,
    matchKeywords,
    displayNewsList,
    productLibrary,

    fetchGetNews,
    fetchMatchGoods,
    fetchCreateCopy,
    fetchCreateCopyMulti,

    setCurrentStep: (s) => dispatch({ type: "SET_STEP", payload: s }),
    setCurrentNews: (n) => dispatch({ type: "SELECT_NEWS", payload: n }),
    bindProduct: (id) => {
      const all = [...(productLibrary.length ? productLibrary : mockProducts), ...cozeProducts];
      const p = all.find((x) => x.id === id);
      if (!p) return;
      if (!state.selectedProducts.some((sp) => sp.id === id)) {
        dispatch({ type: "SET_SELECTED_PRODUCTS", payload: [...state.selectedProducts, p] });
      }
    },
    unbindProduct: (id) => {
      dispatch({
        type: "SET_SELECTED_PRODUCTS",
        payload: state.selectedProducts.filter((p) => p.id !== id),
      });
    },
    toggleProduct: (id) => {
      const exists = state.selectedProducts.some((p) => p.id === id);
      if (exists) {
        dispatch({
          type: "SET_SELECTED_PRODUCTS",
          payload: state.selectedProducts.filter((p) => p.id !== id),
        });
      } else {
        const all = [...(productLibrary.length ? productLibrary : mockProducts), ...cozeProducts];
        const p = all.find((x) => x.id === id);
        if (p) dispatch({ type: "SET_SELECTED_PRODUCTS", payload: [...state.selectedProducts, p] });
      }
    },
    setSelectedProducts: (ids) => {
      const all = [...(productLibrary.length ? productLibrary : mockProducts), ...cozeProducts];
      const list = ids
        .map((id) => all.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));
      dispatch({ type: "SET_SELECTED_PRODUCTS", payload: list });
    },
    setCopyList: (list) => dispatch({ type: "SET_COPY_LIST", payload: list }),
    setSelectedCopyIndex: (i) => dispatch({ type: "SET_SELECTED_COPY_INDEX", payload: i }),
    updateCurrentCopyText: (text) =>
      dispatch({ type: "UPDATE_CANDIDATE_TEXT", payload: { index: state.selectedCopyIndex, text } }),
    setReviewStatus: (s) => dispatch({ type: "SET_REVIEW_STATUS", payload: s }),
    setGenerating: (b) => dispatch({ type: "SET_GENERATING", payload: b }),
    refreshNews,
    refreshing,
    reset: () => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setCozeNews([]);
      setCozeProducts([]);
      setCozeLoaded(false);
      setMatchGoodsLoaded(false);
      dispatch({ type: "RESET" });
    },
    toasts,
    showToast,
    dismissToast,
  };

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
}