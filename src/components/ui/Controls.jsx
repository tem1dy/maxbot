import { forwardRef } from "react";

export const Button = forwardRef(function Button({ mode = "primary", size = "medium", iconBefore, iconAfter, className = "", children, ...props }, ref) {
  const classes = ["ui-button", `ui-button-${mode}`, `ui-button-${size}`, className].filter(Boolean).join(" ");
  return <button ref={ref} className={classes} {...props}>{iconBefore}<span>{children}</span>{iconAfter}</button>;
});

export const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`ui-input ${className}`.trim()} {...props} />;
});


export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  icon,
  busy = false,
  danger = true,
  children,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onCancel?.(); }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className={`confirm-dialog-icon ${danger ? "is-danger" : ""}`}>{icon}</div>
        <h2 id="confirm-dialog-title">{title}</h2>
        {description && <p>{description}</p>}
        {children}
        <div className="confirm-dialog-actions">
          <button type="button" className="ui-button ui-button-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`ui-button ${danger ? "ui-button-danger-solid" : "ui-button-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Подождите…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
