export function PlaceholderPanel({ title, description }) {
  return (
    <div className="settings-page__content settings-page__content--placeholder">
      <section className="settings-card settings-card--placeholder">
        <h1>{title}</h1>
        <p>{description}</p>
        <p className="settings-card__soon">本栏功能将在后续迭代实现，当前仅作界面占位。</p>
      </section>
    </div>
  )
}
