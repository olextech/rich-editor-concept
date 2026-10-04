import { createRoot } from "react-dom/client";
import { FocusTracker, Plugin, View } from "ckeditor5";
import { TableContextToolbar } from "../components/TableContextToolbar";

// Keep CKEditor's table anchoring and keyboard entry while rendering app controls.
class TableContextView extends View {
  constructor(locale, editor) {
    super(locale);
    this.editor = editor;
    this.focusTracker = new FocusTracker();
    this.setTemplate({
      tag: "div",
      attributes: {
        class: ["app-table-tools", "ck-reset_all-excluded"],
        tabindex: -1,
      },
    });
  }

  render() {
    super.render();
    this.focusTracker.add(this.element);
    this.listenTo(
      this.element,
      "keydown",
      (_, event) => {
        // Radix handles Escape in document capture; stop CKEditor from also
        // treating that same key as a request to leave the entire toolbar.
        if (event.key === "Escape" && event.target.closest("[role=menu]")) {
          event.stopPropagation();
        }
      },
      { useCapture: true },
    );
    this.reactRoot = createRoot(this.element);
    this.reactRoot.render(
      <TableContextToolbar editor={this.editor} container={this.element} />,
    );
  }

  focus() {
    this.element.querySelector("[data-table-tool]:not(:disabled)")?.focus();
  }

  focusLast() {
    const buttons = this.element.querySelectorAll(
      "[data-table-tool]:not(:disabled)",
    );
    buttons[buttons.length - 1]?.focus();
  }

  destroy() {
    this.reactRoot?.unmount();
    this.focusTracker.destroy();
    return super.destroy();
  }
}

export class TableContextTools extends Plugin {
  init() {
    this.editor.ui.componentFactory.add(
      "appTableTools",
      (locale) => new TableContextView(locale, this.editor),
    );
  }
}
