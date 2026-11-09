export interface FormFieldErrorProps {
  id?: string;
  error?: string;
  className?: string;
}

const DEFAULT_CLASSES = 'mt-1 text-sm text-red-700';

export function FormFieldError({ id, error, className }: FormFieldErrorProps) {
  if (!error) return null;

  return (
    <p id={id} role="alert" className={className ?? DEFAULT_CLASSES}>
      {error}
    </p>
  );
}
