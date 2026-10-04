import { createRoot } from "react-dom/client";
import { Command, FocusTracker, ImageUtils, Plugin, View } from "ckeditor5";
import { ImageContextToolbar } from "../components/ImageContextToolbar";
import { selectedImage } from "./imageProperties";

class ImagePreferencesCommand extends Command {
  refresh() {
    const image = selectedImage(this.editor);
    this.isEnabled = Boolean(
      image?.getAttribute("src") && !image.hasAttribute("uploadId"),
    );
  }

  execute() {
    this.editor.fire("openImagePreferencesDialog");
  }
}

class RemoveImageCommand extends Command {
  refresh() {
    this.isEnabled = Boolean(selectedImage(this.editor));
  }

  execute() {
    const { editor } = this;
    const image = selectedImage(editor);
    if (!image) return;
    editor.model.change((writer) => {
      writer.setSelection(image, "on");
      editor.model.deleteContent(editor.model.document.selection);
    });
  }
}

class ImageContextView extends View {
  constructor(locale, editor) {
    super(locale);
    this.editor = editor;
    this.focusTracker = new FocusTracker();
    this.setTemplate({
      tag: "div",
      attributes: {
        class: ["app-image-tools", "ck-reset_all-excluded"],
        tabindex: -1,
      },
    });
  }

  render() {
    super.render();
    this.focusTracker.add(this.element);
    this.reactRoot = createRoot(this.element);
    this.reactRoot.render(<ImageContextToolbar editor={this.editor} />);
  }

  focus() {
    this.element.querySelector("[data-image-tool]:not(:disabled)")?.focus();
  }

  focusLast() {
    const buttons = this.element.querySelectorAll(
      "[data-image-tool]:not(:disabled)",
    );
    buttons[buttons.length - 1]?.focus();
  }

  destroy() {
    this.reactRoot?.unmount();
    this.focusTracker.destroy();
    return super.destroy();
  }
}

export class ImageContextTools extends Plugin {
  static get requires() {
    return [ImageUtils];
  }

  init() {
    const { editor } = this;
    editor.commands.add(
      "imagePreferences",
      new ImagePreferencesCommand(editor),
    );
    editor.commands.add("removeImage", new RemoveImageCommand(editor));
    editor.ui.componentFactory.add(
      "appImageTools",
      (locale) => new ImageContextView(locale, editor),
    );
  }
}
