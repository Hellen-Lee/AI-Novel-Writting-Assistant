import { useRef, useState } from 'react'
import {
  FileText,
  FileWarning,
  Image as ImageIcon,
  Star,
  TextQuote,
  X,
} from 'lucide-react'
import './workspace.css'

/**
 * 附件工作区（docs/Novel.pen 节点 M56WJ）。
 *
 * 两个入口组件：
 * - AttachmentWorkspace：输入框内工作区（图片/技能/附件文件第一行 + 选中文本第二行，均可移除）
 * - AttachmentBundle：用户消息气泡上方的附件摘要（同样两行，可折叠展示）
 *
 * 条目数据形状（大框架，解析逻辑 TODO）：
 * - item: { id, type: 'image' | 'skill' | 'file', name, url? }
 *   url 为图片缩略图地址（TODO: 上传解析后生成）
 * - selection: { text, ...anchor } 或纯字符串（选中文本）
 */

/** 第一行 chip 排列顺序：图片 → 技能 → 附件文件 */
const ROW_ORDER = { image: 0, skill: 1, file: 2 }

/** 识别文件名末尾的后缀（如 .docx / .xlsx），省略时保留 */
const EXT_RE = /(\.[A-Za-z0-9]{1,5})$/

const CHIP_ICONS = { image: ImageIcon, skill: Star, file: FileText }

/** 兼容 { text } 对象与纯字符串两种选区形态 */
function pickText(selection) {
  if (selection == null) return ''
  return typeof selection === 'string' ? selection : selection.text || ''
}

/** 按图片 → 技能 → 附件文件排序（稳定排序，不打乱同类型内部顺序） */
function sortRowItems(items) {
  return [...items].sort(
    (a, b) => (ROW_ORDER[a.type] ?? 9) - (ROW_ORDER[b.type] ?? 9),
  )
}

/** 拆分文件名为「主体 + 后缀」，主体超长省略、后缀完整保留 */
function splitName(name) {
  const str = String(name || '')
  const matched = str.match(EXT_RE)
  if (!matched) return { base: str, ext: '' }
  return { base: str.slice(0, str.length - matched[1].length), ext: matched[1] }
}

/** chip 名称：max-width 内单行展示，主体末尾省略号、后缀保留 */
function ChipName({ name }) {
  const { base, ext } = splitName(name)
  return (
    <span className="agent-ws__chip-name" title={name}>
      <span className="agent-ws__chip-base">{base}</span>
      {ext ? <span className="agent-ws__chip-ext">{ext}</span> : null}
    </span>
  )
}

/**
 * 第一行：图片 → 技能 → 附件文件，按容器宽度自动换行。
 * 图片 chip hover 时在行上方弹出缩略图；缩略图挂在滚动容器外的 wrap 上，
 * 避免被 overflow 裁剪。compact = 气泡上方的紧凑尺寸（高 24）。
 */
function ChipRow({ items, compact = false, onRemoveItem, extra = null }) {
  const wrapRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [missingIds, setMissingIds] = useState(() => new Set())

  const openPreview = (item, el) => {
    if (item.type !== 'image') return
    const wrap = wrapRef.current
    if (!wrap) return
    const wrapRect = wrap.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    setPreview({ item, left: rect.left - wrapRect.left + rect.width / 2 })
  }

  return (
    <div
      className="agent-ws__row-wrap"
      ref={wrapRef}
      onMouseLeave={() => setPreview(null)}
    >
      {preview ? (
        <span
          className="agent-ws__thumb"
          style={{ left: preview.left }}
          role="tooltip"
        >
          {preview.item.url && !missingIds.has(preview.item.id) ? (
            <img
              className="agent-ws__thumb-img"
              src={preview.item.url}
              alt={preview.item.name}
            />
          ) : (
            // TODO: 上传解析接入前没有缩略图 url，先用图标占位
            <ImageIcon size={22} aria-hidden />
          )}
        </span>
      ) : null}
      <div className={`agent-ws__row${compact ? ' agent-ws__row--sm' : ''}`}>
        {items.map((item) => {
          const missing = missingIds.has(item.id)
          const failed = item.status === 'failed' || missing
          const Icon = failed ? FileWarning : CHIP_ICONS[item.type] || FileText
          const statusTitle = item.status === 'failed'
            ? item.error || '附件解析失败'
            : missing
              ? '附件文件缺失'
              : item.parsed?.text_truncated
                ? '内容已截断'
                : item.name
          return (
            <span
              key={item.id}
              className={`agent-ws__chip agent-ws__chip--${item.type}${failed ? ' agent-ws__chip--failed' : ''}${compact ? ' agent-ws__chip--sm' : ''}`}
              title={statusTitle}
              onMouseEnter={(e) => openPreview(item, e.currentTarget)}
            >
              <span className="agent-ws__chip-icon" aria-hidden>
                <Icon size={compact ? 11 : 12} />
              </span>
              <ChipName name={item.name} />
              {item.type === 'image' && !failed && item.url ? (
                <img
                  src={item.url}
                  alt=""
                  hidden
                  onError={() =>
                    setMissingIds((current) => {
                      const next = new Set(current)
                      next.add(item.id)
                      return next
                    })
                  }
                />
              ) : null}
              {onRemoveItem ? (
                <button
                  type="button"
                  className="agent-ws__chip-remove"
                  aria-label={`移除 ${item.name}`}
                  title="移除"
                  onClick={() => onRemoveItem(item)}
                >
                  <X size={12} />
                </button>
              ) : null}
            </span>
          )
        })}
        {extra}
      </div>
    </div>
  )
}

/** 第二行：选中文本，超长末尾省略；onClear 存在时（工作区）可移除 */
function QuoteRow({ text, onClear, compact = false }) {
  return (
    <div className={`agent-ws__quote${compact ? ' agent-ws__quote--sm' : ''}`}>
      <span className="agent-ws__quote-icon" aria-hidden>
        <TextQuote size={compact ? 11 : 12} />
      </span>
      <span className="agent-ws__quote-text" title={text}>
        {`「${text}」`}
      </span>
      {onClear ? (
        <button
          type="button"
          className="agent-ws__quote-remove"
          aria-label="移除选中文本"
          title="移除"
          onClick={onClear}
        >
          <X size={10} />
        </button>
      ) : null}
    </div>
  )
}

/**
 * 输入框工作区：展示待随消息携带的图片 / 技能 / 附件文件 / 选中文本。
 * 无任何内容时返回 null，不占位。
 */
export function AttachmentWorkspace({
  items = [],
  selection = null,
  onRemoveItem,
  onClearSelection,
}) {
  const rowItems = sortRowItems(items)
  const text = pickText(selection)
  if (!rowItems.length && !text) return null

  return (
    <div className="agent-ws">
      {rowItems.length ? (
        <ChipRow items={rowItems} onRemoveItem={onRemoveItem} />
      ) : null}
      {text ? <QuoteRow text={text} onClear={onClearSelection} /> : null}
      <div className="agent-ws__divider" aria-hidden />
      {/* TODO: 发送时经 buildAttachmentPayload 把 items / selection 组装进消息（见文件底部占位实现） */}
    </div>
  )
}

/**
 * 用户消息气泡上方的附件摘要：与工作区同样的两行结构，完整展示并自动换行。
 */
export function AttachmentBundle({
  items = [],
  selection = null,
}) {
  const rowItems = sortRowItems(items)
  const text = pickText(selection)
  if (!rowItems.length && !text) return null

  const totalCount = rowItems.length + (text ? 1 : 0)

  return (
    <div className="agent-ws agent-ws--bubble">
      <div className="agent-ws__bundle-head">
        <span className="agent-ws__bundle-count">{totalCount} 个附件</span>
      </div>
      {rowItems.length ? <ChipRow items={rowItems} compact /> : null}
      {text ? <QuoteRow text={text} compact /> : null}
    </div>
  )
}

/* --------------- 上传解析与发送组装辅助 --------------- */

/** TODO: 解析用户选中的 File 列表 → 工作区条目 */
// eslint-disable-next-line react/only-export-components -- TODO 占位：接入上传入口后移到独立文件
export function parseUploadedFiles(fileList) {
  // TODO: 未实现。接入输入框 “+” 上传入口时补充：
  // 1. 图片 → URL.createObjectURL 生成缩略图 url，发送/上传后替换为服务端地址
  // 2. 文件 → 按扩展名分类，超限或格式不支持的给出提示
  // 3. 生成稳定 id，并对同名文件去重
  return Array.from(fileList || []).map((file, index) => ({
    id: `local_${file.name}_${file.lastModified}_${index}`,
    type: file.type.startsWith('image/') ? 'image' : 'file',
    name: file.name,
    file,
    status: 'uploading',
    url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }))
}

/** TODO: 发送时把工作区内容组装进消息 payload */
// eslint-disable-next-line react/only-export-components -- TODO 占位：接入发送链路后移到独立文件
export function buildAttachmentPayload(items, selection) {
  const list = Array.isArray(items) ? items : []
  const skill = [...list].reverse().find((item) => item.type === 'skill')
  return {
    attachments: list
      .filter((item) => item.type !== 'skill' && item.status !== 'failed')
      .map((item) => item.id),
    skill_name: skill?.skill_name || skill?.name || undefined,
    selected_text: pickText(selection),
    items: list.filter((item) => item.type !== 'skill' && item.status !== 'failed'),
  }
}
