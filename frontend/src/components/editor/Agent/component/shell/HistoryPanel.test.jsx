import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HistoryPanel } from './HistoryPanel'

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()

function makeSessions() {
  return [
    { id: 'a', title: '青灯人出场续写', updatedAt: now, messages: [] },
    { id: 'b', title: '润色第三章开场', updatedAt: now - 3 * DAY, messages: [] },
    { id: 'c', title: '人物关系梳理', updatedAt: now - 30 * DAY, messages: [] },
  ]
}

function renderPanel(overrides = {}) {
  const props = {
    sessions: makeSessions(),
    activeSessionId: 'a',
    onClose: vi.fn(),
    onSelectSession: vi.fn(),
    onNewChat: vi.fn(),
    onCollapse: vi.fn(),
    onRenameSession: vi.fn().mockResolvedValue(true),
    onDeleteSession: vi.fn().mockResolvedValue(true),
    onClearSessions: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  render(<HistoryPanel {...props} />)
  return props
}

describe('HistoryPanel', () => {
  it('按今天 / 近 7 天 / 更早分组渲染会话', () => {
    renderPanel()

    expect(screen.getByText('今天')).toBeInTheDocument()
    expect(screen.getByText('近 7 天')).toBeInTheDocument()
    expect(screen.getByText('更早')).toBeInTheDocument()
    expect(screen.getByText('青灯人出场续写')).toBeInTheDocument()
    expect(screen.getByText('共 3 条会话')).toBeInTheDocument()
  })

  it('搜索只过滤标题并保持分组结构', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText('搜索会话'), {
      target: { value: '润色' },
    })

    expect(screen.queryByText('青灯人出场续写')).not.toBeInTheDocument()
    expect(screen.getByText('润色第三章开场')).toBeInTheDocument()
    expect(screen.getByText('近 7 天')).toBeInTheDocument()
    expect(screen.queryByText('今天')).not.toBeInTheDocument()
    expect(screen.getByText('匹配 1 条 / 共 3 条会话')).toBeInTheDocument()
  })

  it('搜索无命中时提示空结果', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText('搜索会话'), {
      target: { value: '不存在' },
    })

    expect(screen.getByText('没有匹配「不存在」的会话')).toBeInTheDocument()
  })

  it('点会话名切换会话', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByText('人物关系梳理'))

    expect(props.onSelectSession).toHaveBeenCalledWith('c')
  })

  it('行内重命名：Enter 提交，Esc 取消', async () => {
    const props = renderPanel()

    fireEvent.click(screen.getAllByLabelText('会话操作')[0])
    fireEvent.click(screen.getByText('重命名'))

    const input = screen.getByLabelText('会话名称')
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(props.onRenameSession).toHaveBeenCalledWith('a', '新标题'),
    )

    // Esc 取消不触发提交
    fireEvent.click(screen.getAllByLabelText('会话操作')[0])
    fireEvent.click(screen.getByText('重命名'))
    const again = screen.getByLabelText('会话名称')
    fireEvent.change(again, { target: { value: '会被丢弃' } })
    fireEvent.keyDown(again, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByLabelText('会话名称')).toBeNull())
    expect(props.onRenameSession).toHaveBeenCalledTimes(1)
  })

  it('删除会话需要二次确认', async () => {
    const props = renderPanel()

    fireEvent.click(screen.getAllByLabelText('会话操作')[1])
    fireEvent.click(screen.getByText('删除会话'))

    expect(screen.getByRole('dialog', { name: '删除会话' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() =>
      expect(props.onDeleteSession).toHaveBeenCalledWith('b'),
    )
  })

  it('清空历史需要二次确认', async () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '清空历史' }))
    expect(screen.getByRole('dialog', { name: '清空历史' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清空' }))

    await waitFor(() => expect(props.onClearSessions).toHaveBeenCalled())
  })

  it('无会话时清空按钮禁用', () => {
    renderPanel({ sessions: [], activeSessionId: '' })

    expect(screen.getByText('暂无会话')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空历史' })).toBeDisabled()
  })
})
