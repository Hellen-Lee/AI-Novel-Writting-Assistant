import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AGENT_PHASE } from '../../utils/constants'
import { AgentTrace } from './AgentTrace'

const tools = [
  { name: 'read_recent_work', arguments: { n: 3 } },
  { name: 'get_outline', arguments: {} },
  { name: 'search_memory', arguments: { keyword: '鱼符' } },
]

describe('AgentTrace', () => {
  it('收起态只有一行静态汇总，把思考与工具合并在同一行', () => {
    render(
      <AgentTrace
        messageId="assistant_test"
        phase={AGENT_PHASE.DONE}
        thinking="先观察再承接"
        tools={tools}
      />,
    )

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('已深度思考 · 读取前文、读取大纲、检索设定')
    // 收起态不渲染正文与参数细节
    expect(screen.queryByText(/先观察再承接/)).not.toBeInTheDocument()
  })

  it('生成中自动展开，正文开流后收起且允许手动展开', async () => {
    const { rerender } = render(
      <AgentTrace
        messageId="assistant_test"
        phase={AGENT_PHASE.THINKING}
        thinking="第一段思考\n第二段思考"
      />,
    )

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/第一段思考/)).toBeVisible()

    rerender(
      <AgentTrace
        messageId="assistant_test"
        phase={AGENT_PHASE.STREAMING}
        thinking="第一段思考\n第二段思考"
      />,
    )
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/第二段思考/)).toBeVisible()
  })

  it('展开后逐条列出工具与参数摘要', () => {
    render(
      <AgentTrace
        messageId="assistant_test"
        phase={AGENT_PHASE.DONE}
        thinking=""
        tools={tools}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('读取前文')).toBeInTheDocument()
    expect(screen.getByText('最近 3 章')).toBeInTheDocument()
    expect(screen.getByText('检索设定')).toBeInTheDocument()
    expect(screen.getByText(/关键词「鱼符」/)).toBeInTheDocument()
  })

  it('只有工具时图标与文案都不含思考', () => {
    render(
      <AgentTrace
        messageId="assistant_test"
        phase={AGENT_PHASE.DONE}
        thinking=""
        tools={[{ name: 'read_chapter', arguments: { chapter_id: 'c1' } }]}
      />,
    )

    const toggle = screen.getByRole('button')
    expect(toggle).toHaveTextContent('读取章节')
    expect(toggle).not.toHaveTextContent('已深度思考')
  })

  it('思考与工具都为空时不渲染', () => {
    const { container } = render(
      <AgentTrace messageId="assistant_test" phase={AGENT_PHASE.DONE} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('过程容器不产生「进行中」动画类名（动效只留在顶部状态行）', () => {
    render(
      <AgentTrace
        messageId="assistant_test"
        phase={AGENT_PHASE.TOOL_CALL}
        thinking="思考中"
        tools={tools}
      />,
    )

    const toggle = screen.getByRole('button')
    expect(toggle.className).not.toMatch(/running/)
    expect(document.querySelector('[class*="running"]')).toBeNull()
  })
})
