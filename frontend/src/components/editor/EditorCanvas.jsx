import { useLayoutEffect, useMemo, useRef } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { Markdown } from '../ui/Markdown'
import { splitContentAt, splitParagraphs } from '../../utils/paragraphs'
import { AGENT_PHASE, REPLACE_SKILLS } from './Agent/utils/constants'
import './EditorCanvas.css'

/** 草稿卡的落点说明：有锚时说明可插入/替换到第几段，无锚时说明将追加到文末。 */
function draftAnchorNote(aiDraft) {
  const a = aiDraft?.anchor
  if (!a) return '将插入到正文末尾'
  const { startPara: s, endPara: e } = a
  if (s === e) {
    return `可插入到第 ${s} 段之后${REPLACE_SKILLS.has(aiDraft?.skill) ? '，或替换该段' : ''}`
  }
  return `作用于第 ${s}–${e} 段：可插入其后${REPLACE_SKILLS.has(aiDraft?.skill) ? '，或替换原段' : ''}`
}

/** 正文 textarea：随内容自动增高，滚动由外层 .editor-page__main 统一处理 */
function AutoGrowTextarea({ value, minHeight = 280, ...rest }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`
  }, [value, minHeight])

  return (
    <textarea
      ref={ref}
      className="editor-page__textarea"
      value={value}
      spellCheck={false}
      {...rest}
    />
  )
}

/** AI 草稿卡：流式预览 / 完成态 markdown + 插入/替换/改写/弃用 */
function AiDraftCard({
  aiDraft,
  onApplyDraft,
  onReplaceDraft,
  onRewriteDraft,
  onDiscardDraft,
}) {
  const streaming =
    aiDraft.status === 'streaming' && aiDraft.phase !== AGENT_PHASE.TOOL_CALL
  return (
    <div className="editor-page__ai-draft">
      <div className="editor-page__ai-draft-head">
        <Sparkles size={14} />
        <span>
          AI {aiDraft.skill || '续写'}
          {aiDraft.phase === AGENT_PHASE.TOOL_CALL
            ? ' · 读取上下文中'
            : aiDraft.stopped
              ? ' · 已终止（部分内容）'
              : streaming
                ? ' · 生成中'
                : ' · 待处理'}
        </span>
      </div>
      {streaming ? (
        <p className="editor-page__ai-draft-text editor-page__ai-draft-text--raw">
          {aiDraft.text}
        </p>
      ) : (
        <>
          <p className="editor-page__ai-draft-note">
            {draftAnchorNote(aiDraft)}
          </p>
          <Markdown
            text={aiDraft.text}
            className="editor-page__md"
            conservative
          />
        </>
      )}
      {streaming ? (
        <div className="editor-page__stream-tail">
          <i className="editor-page__cursor" />
          <span>流式输出中</span>
        </div>
      ) : null}
      <div className="editor-page__ai-draft-actions">
        <button
          type="button"
          className="editor-page__draft-btn editor-page__draft-btn--primary"
          disabled={aiDraft.status === 'streaming'}
          onClick={onApplyDraft}
        >
          插入
        </button>
        {REPLACE_SKILLS.has(aiDraft.skill) && aiDraft.anchor ? (
          <button
            type="button"
            className="editor-page__draft-btn"
            disabled={aiDraft.status === 'streaming'}
            onClick={onReplaceDraft}
          >
            替换
          </button>
        ) : null}
        <button
          type="button"
          className="editor-page__draft-btn"
          disabled={aiDraft.status === 'streaming'}
          onClick={onRewriteDraft}
        >
          改写
        </button>
        <button
          type="button"
          className="editor-page__draft-btn editor-page__draft-btn--ghost"
          onClick={onDiscardDraft}
        >
          弃用
        </button>
      </div>
    </div>
  )
}

/**
 * 正文画布：章节正文 + AI 草稿卡。
 * 草稿有段落锚且落点不在文末时，正文在锚点段后拆成上下两个 textarea，
 * 草稿卡渲染在两段之间（即"落在第 N 段之后"）；否则维持单 textarea + 末尾卡片。
 * head/tail 均为原文切片（不规整空白），编辑后经 sep 拼回完整 content。
 */
export function EditorCanvas({
  loadingChapter,
  content,
  onContentChange,
  onSelectText,
  aiDraft,
  onApplyDraft,
  onReplaceDraft,
  onRewriteDraft,
  onDiscardDraft,
}) {
  const paraCount = useMemo(() => splitParagraphs(content).length, [content])
  // 草稿落点：有锚取 endPara（clamp 到 [0, paraCount]），无锚 = 文末
  const cut = Math.max(
    0,
    Math.min(aiDraft?.anchor?.endPara ?? paraCount, paraCount),
  )
  const split = Boolean(aiDraft) && cut < paraCount

  const { head, tail, tailBase, sep } = useMemo(
    () =>
      split
        ? splitContentAt(content, cut)
        : { head: content, tail: '', tailBase: content.length, sep: '\n\n' },
    [split, content, cut],
  )

  if (loadingChapter) {
    return (
      <div className="editor-page__loading">
        <LoaderCircle size={18} className="editor-page__spin" />
        加载正文…
      </div>
    )
  }

  const draftCard = aiDraft ? (
    <AiDraftCard
      aiDraft={aiDraft}
      onApplyDraft={onApplyDraft}
      onReplaceDraft={onReplaceDraft}
      onRewriteDraft={onRewriteDraft}
      onDiscardDraft={onDiscardDraft}
    />
  ) : null

  if (!split) {
    return (
      <>
        <AutoGrowTextarea
          value={content}
          minHeight={280}
          onChange={(e) => onContentChange(e.target.value)}
          onSelect={(e) => onSelectText(e, 0)}
          placeholder="请输入内容…"
        />
        {draftCard}
      </>
    )
  }

  return (
    <>
      {head ? (
        <AutoGrowTextarea
          value={head}
          minHeight={96}
          onChange={(e) => onContentChange(e.target.value + sep + tail)}
          onSelect={(e) => onSelectText(e, 0)}
          aria-label="正文（锚点之前）"
        />
      ) : null}
      {draftCard}
      <AutoGrowTextarea
        value={tail}
        minHeight={280}
        onChange={(e) => onContentChange(head + sep + e.target.value)}
        onSelect={(e) => onSelectText(e, tailBase)}
        aria-label="正文（锚点之后）"
      />
    </>
  )
}
