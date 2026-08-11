/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COZE_WF_GETNEWS?: string
  readonly VITE_COZE_WF_MATCHGOODS?: string
  readonly VITE_COZE_WF_CREATECOPY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
