import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AGENT_PHASE } from '../../utils/constants'
import { ThinkingBlock } from './ThinkingBlock'

describe('ThinkingBlock', () => {
  it('生成中自动展开，正文开始后收起且允许手动展开', async () => {
    const { rerender } = render(
      <ThinkingBlock
        messageId="assistant_test"
        phase={AGENT_PHASE.THINKING}
        text="第一段思考\n第二段思考"
      />,
    )

    const toggle = screen.getByRole('button', { name: /已深度思考/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/第一段思考/)).toBeVisible()

    rerender(
      <ThinkingBlock
        messageId="assistant_test"
        phase={AGENT_PHASE.STREAMING}
        text="第一段思考\n第二段思考"
      />,
    )
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByText(/第一段思考/)).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/第二段思考/)).toBeVisible()

    rerender(
      <ThinkingBlock
        messageId="assistant_test"
        phase={AGENT_PHASE.STREAMING}
        text="思考内容已更新"
      />,
    )
    expect(screen.getByText('思考内容已更新')).toBeVisible()
  })

  it('没有思考文本时不渲染思考块', () => {
    render(
      <ThinkingBlock
        messageId="assistant_test"
        phase={AGENT_PHASE.THINKING}
        text=""
      />,
    )

    expect(screen.queryByRole('button', { name: /已深度思考/ })).not.toBeInTheDocument()
  })
})
