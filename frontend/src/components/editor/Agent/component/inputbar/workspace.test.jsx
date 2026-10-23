import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttachmentBundle } from './workspace'

const ITEMS = [
  { id: 'a1', type: 'image', name: '场景.jpg', url: 'blob:scene' },
  { id: 'a2', type: 'file', name: '章1.docx' },
  { id: 'a3', type: 'skill', name: '续写' },
]

/** chip 名称按「主体 + 后缀」拆成两层 span，取 chip 上的 title 断言完整名称 */
function chipTitles() {
  return [...document.querySelectorAll('.agent-ws__chip')].map((el) => el.title)
}

describe('AttachmentBundle', () => {
  it('默认折叠，只展示统一引用计数与展开按钮', () => {
    render(<AttachmentBundle items={ITEMS} selection="雨停之后" />)

    // 3 个 chip + 1 段选中文本 = 4 个引用
    expect(screen.getByText('4 个引用')).toBeVisible()
    const toggle = screen.getByRole('button', { name: /展开/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/「雨停之后」/)).not.toBeInTheDocument()
    expect(screen.queryByText('场景.jpg')).not.toBeInTheDocument()
  })

  it('展开后展示 chip 行与引用行，再点击收起', () => {
    render(<AttachmentBundle items={ITEMS} selection="雨停之后" />)

    fireEvent.click(screen.getByRole('button', { name: /展开/ }))

    const toggle = screen.getByRole('button', { name: /收起/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('4 个引用')).toBeVisible()
    expect(chipTitles()).toEqual(['场景.jpg', '续写', '章1.docx'])
    expect(screen.getByText('「雨停之后」')).toBeVisible()

    fireEvent.click(toggle)
    expect(chipTitles()).toEqual([])
  })

  it('计数包含 chip 与选中文本，只有一侧时按实际数量展示', () => {
    const onlyQuote = render(<AttachmentBundle items={[]} selection="雨停之后" />)
    expect(screen.getByText('1 个引用')).toBeVisible()
    onlyQuote.unmount()

    render(<AttachmentBundle items={ITEMS} selection={null} />)
    expect(screen.getByText('3 个引用')).toBeVisible()
  })

  it('没有任何附件与引用时不渲染', () => {
    const { container } = render(<AttachmentBundle items={[]} selection={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
