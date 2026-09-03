import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import './Markdown.css'

const PLUGINS = [remarkGfm, remarkBreaks]

const MD_COMPONENTS = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
}

/**
 * 保守渲染子集：标题/表格/代码块对小说正文无意义，映射为普通文本，
 * 减小“预览(markdown)”与“插入 textarea(原文)”之间的视觉落差。
 * 仅保留段落、换行、强调、列表、引用等 prose 语法。
 */
function conservativeComponents() {
  const flat = (block) =>
    function Flat(nodeProps) {
      const { node, ...rest } = nodeProps
      return block ? <p {...rest} /> : <span {...rest} />
    }
  return {
    ...MD_COMPONENTS,
    h1: flat(true),
    h2: flat(true),
    h3: flat(true),
    h4: flat(true),
    h5: flat(true),
    h6: flat(true),
    table: flat(true),
    pre: (p) => <span {...omitNode(p)} className="wb-md-plain" />,
    code: (p) => <span {...omitNode(p)} className="wb-md-plain-code" />,
  }
}

function omitNode({ node, ...rest }) {
  return rest
}

/**
 * Markdown 渲染（安全：react-markdown 构建元素树，从不 innerHTML；
 * 未引入 rehype-raw 时原文 HTML 会被转义）。
 * 气泡与编辑区草稿卡共用，靠外层 className 区分样式作用域。
 * @param {object} p
 * @param {string} p.text
 * @param {string} [p.className]
 * @param {boolean} [p.conservative] 保守子集（草稿卡用）
 */
export const Markdown = memo(function Markdown({
  text,
  className = '',
  conservative = false,
}) {
  const src = useMemo(() => closeFence(text || ''), [text])
  const components = useMemo(
    () => (conservative ? conservativeComponents() : MD_COMPONENTS),
    [conservative],
  )
  if (!src) return null
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={components}>
        {src}
      </ReactMarkdown>
    </div>
  )
})

/** 闭合流式过程中落单的 ``` 围栏，避免整段被吞成代码块 */
function closeFence(text) {
  const n = (text.match(/```/g) || []).length
  return n % 2 ? `${text}\n\`\`\`` : text
}
