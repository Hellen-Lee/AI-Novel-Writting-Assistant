import './Badge.css'

export function Badge({ children, className = '' }) {
  return <span className={`badge ${className}`.trim()}>{children}</span>
}
