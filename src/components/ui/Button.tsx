import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'danger-soft' | 'whatsapp';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

function classes({ variant = 'primary', size = 'md', block }: CommonProps, extra?: string) {
  return ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', extra]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, icon, iconRight, loading, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  iconRight,
  children,
  className,
  ...rest
}: LinkProps & CommonProps) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

export function ButtonAnchor({
  variant,
  size,
  block,
  icon,
  iconRight,
  children,
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & CommonProps) {
  return (
    <a className={classes({ variant, size, block }, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </a>
  );
}

export function IconButton({
  label,
  className,
  size,
  bordered,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm'; bordered?: boolean }) {
  return (
    <button
      type={type}
      className={['icon-btn', size, bordered && 'bordered', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
