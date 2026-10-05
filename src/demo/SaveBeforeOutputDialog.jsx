import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function SaveBeforeOutputDialog({ action, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    cancelRef.current.focus();
    return () => {
      dialog.close();
      previousFocus?.focus?.();
    };
  }, []);

  const printing = action === "print";
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="save-before-output-title"
      aria-describedby="save-before-output-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="fixed inset-0 m-auto w-[min(440px,calc(100vw-48px))] rounded-lg border border-border bg-background p-6 text-foreground shadow-2xl backdrop:bg-black/45"
    >
      <h2 id="save-before-output-title" className="text-base font-semibold">
        Save template before {printing ? "printing" : "downloading"}?
      </h2>
      <p
        id="save-before-output-description"
        className="mt-2 text-sm text-muted-foreground"
      >
        The template has unsaved changes. Save the template to continue.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button ref={cancelRef} variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>
          Save and {printing ? "print" : "download"}
        </Button>
      </div>
    </dialog>
  );
}
