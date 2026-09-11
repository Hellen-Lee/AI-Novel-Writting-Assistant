/**
 * 段落级工具：AI 草稿需"精确落在某段之后 / 替换某几段"，正文虽存为单个 markdown
 * 字符串，但可在此以逻辑段落为单位做切分、定位、拼接。
 *
 * 约定（splitByBreakRanges 与本文件内所有切分共用同一边界，保证 1:1 对齐）：
 * - 段落边界：一个及以上连续空行（`\n\n+`，中间允许空白）。
 * - 单个 `\n`（软换行）视为段内换行（诗歌/对白/列表续行/标题块），不切段——
 *   因此 markdown 标题/列表在无空行时会自然作为一个整段。
 * - 空内容返回 []。
 */

const PARAGRAPH_BREAK_RE = /\n[ \t]*\n+/

/**
 * 将一个 markdown 字符串拆成逻辑段落数组。
 * 规则：按连续空行切块，trim 后丢弃纯空块。
 */
export function splitParagraphs(content) {
  if (!content) return []
  return String(content)
    .split(PARAGRAPH_BREAK_RE)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 将段落数组序列化为单个 markdown 字符串（空行分隔）。 */
export function joinParagraphs(arr) {
  if (!Array.isArray(arr)) return ''
  return arr.filter((p) => p && p.trim()).map((p) => p.trim()).join('\n\n')
}

/**
 * 拆出每个段落在原文中的精确字符区间 [start,end)，供字符偏移 → 段号定位使用。
 * 与 splitParagraphs 的段一一对应（相同边界、跳过空块）。
 */
function splitByBreakRanges(text) {
  const out = []
  let last = 0
  let re = /\n[ \t]*\n+/g
  let m
  while ((m = re.exec(text)) !== null) {
    const body = text.slice(last, m.index)
    if (body.trim()) out.push({ start: last, end: m.index })
    last = m.index + m[0].length
  }
  const tail = text.slice(last)
  if (tail.trim()) out.push({ start: last, end: text.length })
  return out
}

/**
 * 根据 textarea 选区字符偏移，反查命中的段落区间（1-based，含首尾）。
 * - selStart === selEnd（仅光标，未选中）→ 返回光标所在段的单段区间。
 * - 内容为空或越界无法命中 → 返回 null。
 * @returns {{startPara:number,endPara:number}|null}
 */
export function locateSelection(content, selStart, selEnd) {
  if (content == null) return null
  const text = String(content)
  if (!text.trim()) return null
  const len = text.length
  const start = Math.max(0, Math.min(selStart ?? 0, len))
  const end = Math.max(start, Math.min(selEnd ?? start, len))

  const ranges = splitByBreakRanges(text)
  if (!ranges.length) return null

  // start 命中的段（start 在 [seg.start, seg.end) 内，或选区为空则就近）
  let startPara = null
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    // start 位于本段内（含段末字符 end，不含下一段开头）
    if (start >= r.start && start < r.end) {
      startPara = i + 1
      break
    }
  }
  // 光标恰好落在段间空行：归属前一段（end 计算同理）
  if (startPara == null) {
    // 遍历找"前一段的结束位置 <= start"的最近一段
    for (let i = ranges.length - 1; i >= 0; i--) {
      if (ranges[i].end <= start) {
        startPara = i + 1
        break
      }
    }
    if (startPara == null) startPara = 1
  }

  // end 命中的段（选区结束处）
  let endPara = startPara
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (end > r.start && end <= r.end) {
      endPara = i + 1
      break
    }
  }
  // end 落在段间空行：归属前一段
  if (endPara < startPara) endPara = startPara
  return { startPara, endPara }
}

/**
 * 在第 paraCount 段之后把正文切成 head/tail 两段显示文本（保原文，不规整空白），
 * 供编辑区"草稿卡落在第 N 段之后"的拆段渲染使用。
 * - paraCount >= 实际段数 → tail 为空（落点在文末，无需拆分）
 * - paraCount <= 0 → head 为空（落点在文首）
 * 返回 { head, tail, tailBase, sep }：
 * - head：第 1..paraCount 段的原文（从 0 到第 paraCount 段末，不含段后空行）
 * - tail：第 paraCount+1.. 段的显示文本（剥掉前导空行分隔符）
 * - tailBase：tail 显示文本在原文中的起始偏移（textarea 选区 → 全局偏移映射用）
 * - sep：被剥离的分隔空白；head/tail 编辑后拼回时用 `head + sep + tail`，
 *   保证用户未编辑分隔区时内容逐字节不变。
 */
export function splitContentAt(content, paraCount) {
  const text = String(content ?? '')
  const ranges = splitByBreakRanges(text)
  const total = ranges.length
  if (!total || paraCount >= total) {
    return { head: text, tail: '', tailBase: text.length, sep: '\n\n' }
  }
  if (paraCount <= 0) {
    const m = text.match(/^\s+/)
    const sepLen = m ? m[0].length : 0
    return {
      head: '',
      tail: text.slice(sepLen),
      tailBase: sepLen,
      sep: text.slice(0, sepLen),
    }
  }
  const cut = ranges[paraCount - 1].end
  const rawTail = text.slice(cut)
  const m = rawTail.match(/^\s+/)
  const sepLen = m ? m[0].length : 0
  return {
    head: text.slice(0, cut),
    tail: rawTail.slice(sepLen),
    tailBase: cut + sepLen,
    sep: rawTail.slice(0, sepLen) || '\n\n',
  }
}

/**
 * 解析模型回传的锚定哨兵行，形如：
 *   [[ANCHOR|insert_after|5]]
 *   [[ANCHOR|replace_range|1|5]]
 * 未命中返回 null。
 * @param {string} text
 */
export function parseAnchorSentinel(text) {
  if (!text) return null
  const m = String(text).match(
    /\[\[\s*ANCHOR\s*\|\s*(\w+)\s*\|\s*(\d+)(?:\s*\|\s*(\d+))?\s*\]\]/i,
  )
  if (!m) return null
  const mode =
    m[1].toLowerCase() === 'replace_range' ? 'replace_range' : 'insert_after'
  const startPara = parseInt(m[2], 10)
  const endPara = m[3] != null ? parseInt(m[3], 10) : startPara
  return { mode, startPara, endPara }
}

/** 从任意文本中剥离锚定哨兵（若存在），返回干净文本。 */
export function stripAnchorSentinel(text) {
  if (!text) return text
  return String(text)
    .replace(/\s*\[\[\s*ANCHOR\s*\|[^\]]*\]\]\s*$/i, '')
    .trimEnd()
}
