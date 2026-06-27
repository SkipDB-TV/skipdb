"use client";

export function ConfirmDialog({
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm space-y-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-slate-300">{message}</p>
        <div className="flex justify-end gap-3">
          <button className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
