import type { CSSProperties } from 'react';

export interface HoneypotFieldProps {
  value: string;
  onChange: (value: string) => void;
  fieldName?: string;
  labelText?: string;
  className?: string;
}

const OFF_SCREEN_STYLE: CSSProperties = {
  position: 'absolute',
  left: '-10000px',
  height: 0,
  width: 0,
  overflow: 'hidden',
};

export function HoneypotField({
  value,
  onChange,
  fieldName = 'website',
  labelText = 'Website',
  className,
}: HoneypotFieldProps) {
  const inputId = `hp-${fieldName}`;
  const wrapperClassName = className ?? undefined;

  return (
    <div aria-hidden="true" className={wrapperClassName} style={OFF_SCREEN_STYLE}>
      <label htmlFor={inputId}>{labelText}</label>
      <input
        id={inputId}
        type="text"
        name={fieldName}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        data-protonpass-ignore="true"
      />
    </div>
  );
}
