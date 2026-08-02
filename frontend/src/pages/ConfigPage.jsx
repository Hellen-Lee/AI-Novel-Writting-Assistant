import { Button } from '../components/ui/Button'
import './PlaceholderPage.css'

/** 模型配置页骨架 — 设计对照：Review/Screen/ModelConfig */
export default function ConfigPage() {
  return (
    <div className="placeholder-page">
      <div className="placeholder-page__card">
        <p className="placeholder-page__eyebrow">系统设置</p>
        <h1>大模型 API</h1>
        <p className="placeholder-page__desc">
          配置 OpenAI 兼容接口地址、密钥与生成参数。完整表单将在 4.6 实现。
        </p>
        <div className="placeholder-page__actions">
          <Button to="/" variant="ghost">
            返回首页
          </Button>
        </div>
      </div>
    </div>
  )
}
