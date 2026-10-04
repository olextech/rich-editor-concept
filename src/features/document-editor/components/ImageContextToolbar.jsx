import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function ImageContextToolbar({ editor }) {
  const commands = ["imagePreferences", "removeImage"];
  const pendingFocus = useRef(null);
  useEffect(() => () => cancelAnimationFrame(pendingFocus.current), []);
  useLayoutEffect(() => {
    editor.ui.update();
  }, [editor]);
  const subscribe = useCallback(
    (update) => {
      const commands = [
        editor.commands.get("imagePreferences"),
        editor.commands.get("removeImage"),
      ];
      for (const command of commands) command.on("change:isEnabled", update);
      return () => {
        for (const command of commands) command.off("change:isEnabled", update);
      };
    },
    [editor],
  );
  const snapshot = useCallback(
    () =>
      JSON.stringify([
        editor.commands.get("imagePreferences").isEnabled,
        editor.commands.get("removeImage").isEnabled,
      ]),
    [editor],
  );
  const enabled = JSON.parse(useSyncExternalStore(subscribe, snapshot));

  function navigate(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll("[data-image-tool]:not(:disabled)"),
    );
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next].focus();
  }

  return (
    <div
      className="flex max-w-[calc(100vw-32px)] items-center gap-1 rounded-lg bg-popover p-1.5 font-sans text-sm text-popover-foreground"
      onKeyDown={navigate}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-image-tool
        aria-label="Image preferences"
        disabled={!enabled[0]}
        onClick={() => editor.execute(commands[0])}
      >
        <Settings2 className="text-muted-foreground" />
        Preferences
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-image-tool
        aria-label="Remove image"
        title="Remove image"
        disabled={!enabled[1]}
        className="hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          editor.execute(commands[1]);
          pendingFocus.current = requestAnimationFrame(() =>
            editor.editing.view.focus(),
          );
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
