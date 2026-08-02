import { Link } from 'react-router-dom'
import './Button.css'

const VARIANTS = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  ghost: 'btn btn--ghost',
}

export function Button({
  variant = 'primary',
  to,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = `${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()

  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  )
}
