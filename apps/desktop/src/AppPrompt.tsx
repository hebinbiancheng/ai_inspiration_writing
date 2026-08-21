type Props = {
  open: boolean;
  title: string;
  hint?: string;
  value?: string;
  showInput?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AppPrompt({
  open,
  title,
  hint,
  value = "",
  showInput = true,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onChange,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <section className="modal app-prompt" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {hint ? <p className="modal-hint">{hint}</p> : null}
        {showInput ? (
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirm();
              if (event.key === "Escape") onCancel();
            }}
          />
        ) : null}
        <div className="modal-actions">
          <button className="button" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? "button danger" : "generate"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
