import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyEffectiveBrandColor } from './lib/brand'

// 挂载前先把品牌色应用到 :root，避免初次渲染出现「紫色闪一下」
applyEffectiveBrandColor()

// 后台在另一标签页改色后，工作台能自动跟上
window.addEventListener('storage', (e) => {
  if (e.key === 'hg_admin_config_v1') applyEffectiveBrandColor()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
