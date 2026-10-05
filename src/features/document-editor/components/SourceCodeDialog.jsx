import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

export function SourceCodeDialog({
  isOpen,
  value,
  onChange,
  onFormat,
  onClose,
  onSave,
  error,
  readOnly = false,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousActiveElement = document.activeElement;
    dialogRef.current?.showModal();
    textareaRef.current?.focus();

    return () => {
      dialogRef.current?.close();
      previousActiveElement?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 m-auto flex h-[min(760px,calc(100vh-48px))] w-[min(980px,calc(100vw-48px))] flex-col rounded-lg border border-border bg-background shadow-2xl backdrop:bg-black/45"
      role="dialog"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">
          Source
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <textarea
        ref={textareaRef}
        aria-label="Document HTML"
        className="min-h-0 flex-1 resize-none border-0 bg-muted/30 p-4 font-mono text-sm leading-6 text-foreground outline-none"
        spellCheck="false"
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />

      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <Button variant="outline" onClick={onFormat} disabled={readOnly}>
          Format
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={readOnly}>
            Apply
          </Button>
        </div>
      </div>
    </dialog>
  );
}
