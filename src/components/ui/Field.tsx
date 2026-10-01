import {
  forwardRef,
  useId,
  useState,
  useEffect,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { centsToInput, maskPhone, parseMoney } from '@/lib/format';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {optional && <span className="optional">(opcional)</span>}
        </label>
      )}
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type Base = { label?: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; wrapClassName?: string };

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Base>(function TextInput(
  { label, hint, error, optional, wrapClassName, className, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapClassName}>
      {(p) => <input ref={ref} className={['input', className].filter(Boolean).join(' ')} {...p} {...rest} />}
    </Field>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Base>(
  function TextArea({ label, hint, error, optional, wrapClassName, className, ...rest }, ref) {
    return (
      <Field label={label} hint={hint} error={error} optional={optional} className={wrapClassName}>
        {(p) => <textarea ref={ref} className={['textarea', className].filter(Boolean).join(' ')} {...p} {...rest} />}
      </Field>
    );
  },
);

export function SelectInput({
  label,
  hint,
  error,
  optional,
  wrapClassName,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & Base) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapClassName}>
      {(p) => (
        <select className={['select', className].filter(Boolean).join(' ')} {...p} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

/** Campo de WhatsApp com máscara (xx) xxxxx-xxxx. */
export function PhoneInput({
  value,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & Base & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextInput
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="(11) 99999-9999"
      value={maskPhone(value)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
      {...rest}
    />
  );
}

/** Campo de valor em reais. Trabalha internamente em centavos. */
export function MoneyInput({
  cents,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & Base & {
  cents: number | null;
  onChange: (cents: number | null) => void;
}) {
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    // Sincroniza quando o valor muda por fora (ex.: trocar de serviço).
    if (parseMoney(text) !== cents) setText(centsToInput(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <TextInput
      inputMode="decimal"
      placeholder="0,00"
      value={text}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d,.]/g, '');
        setText(v);
        onChange(parseMoney(v));
      }}
      onBlur={() => setText(centsToInput(parseMoney(text)))}
      {...rest}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden />
      <span className="switch-text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
