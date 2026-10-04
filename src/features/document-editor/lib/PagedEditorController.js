import { splitManualPages, EMPTY_PAGE_HTML } from "./pageHtml";
import { validateHtml } from "./htmlSubset";
import { DocumentPaginator } from "./DocumentPaginator";
import { DocumentNavigation } from "./DocumentNavigation";

/** One editable model for the entire document; pagination only changes its view. */
export class PagedEditorController {
  constructor({
    html,
    metrics,
    onChange,
    onPages,
    onSource,
    onError,
    onLayout,
  }) {
    Object.assign(this, {
      html,
      metrics,
      onChange,
      onPages,
      onSource,
      onError,
      onLayout,
    });
    this.disposed = false;
    this.domEvents = new AbortController();
  }

  async mount(toolbar) {
    validateHtml(this.html);
    const { editorConfig, editorType } = await import("./ckeditorConfig");
    if (this.disposed) return;
    const editor = await editorType.create(
      normalizeHtml(this.html),
      editorConfig,
    );
    if (this.disposed) {
      await editor.destroy();
      return;
    }
    this.editor = editor;
    this.paginator = new DocumentPaginator(editor);
    this.navigation = new DocumentNavigation(editor, this.paginator);
    editor.editing.view.document.on("compositionend", () => this.schedule(), {
      priority: "lowest",
    });
    editor.on("openSourceDialog", () => this.onSource(this.getHtml()));
    editor.model.document.on("change:data", () => {
      if (this.disposed) return;
      this.commit();
      this.schedule();
    });
    toolbar?.replaceChildren(editor.ui.view.toolbar.element);
    this.attach();
    this.commit();
    this.schedule();
    document.fonts?.ready.then(() => {
      if (!this.disposed) this.schedule();
    });
  }

  attach() {
    const editable = this.editor?.ui.getEditableElement();
    if (this.host && editable && editable.parentElement !== this.host) {
      this.host.replaceChildren(editable);
      editable.setAttribute("aria-label", "Document content");
      editable.addEventListener("load", () => this.schedule(), {
        capture: true,
        signal: this.domEvents.signal,
      });
    }
  }

  registerHost(host) {
    this.host = host;
    this.attach();
    if (host) this.schedule();
  }

  getHtml() {
    return this.editor
      ? this.editor.getData({ skipListItemIds: true }) || EMPTY_PAGE_HTML
      : this.html || EMPTY_PAGE_HTML;
  }

  commit() {
    const next = this.getHtml();
    if (next !== this.html) {
      this.html = next;
      this.onChange(next);
    }
  }

  updateMetrics(metrics) {
    this.metrics = metrics;
    this.schedule();
  }

  schedule() {
    if (this.disposed) return;
    this.onLayout(false);
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.editor?.ui.getEditableElement()?.isConnected) return;
      // Rebuilding view text nodes must wait until native IME composition ends.
      if (this.editor.editing.view.document.isComposing) return;
      try {
        const pages = this.paginator.layout(this.metrics);
        this.onPages(pages.map((_, index) => `page-${index + 1}`));
        this.onError("");
      } catch (error) {
        this.onError(error.message);
      }
      this.onLayout(true);
    });
  }

  applyHtml(html) {
    validateHtml(html);
    const { model } = this.editor;
    model.change((writer) => {
      const root = model.document.getRoot();
      writer.remove(writer.createRangeIn(root));
      writer.insert(this.editor.data.parse(normalizeHtml(html)), root, 0);
      writer.setSelection(root, 0);
    });
  }

  addPage() {
    this.editor.model.change((writer) => {
      const root = this.editor.model.document.getRoot();
      writer.insertElement("manualPageBreak", root, "end");
      const paragraph = writer.createElement("paragraph");
      writer.append(paragraph, root);
      writer.setSelection(paragraph, 0);
    });
    this.editor.editing.view.focus();
  }

  deletePage(name) {
    const index = Number(name.replace("page-", "")) - 1;
    const pages = this.paginator.pages;
    if (pages.length <= 1 || !pages[index]) return;
    this.editor.model.change((writer) => {
      let start = pages[index];
      const end =
        pages[index + 1] ??
        writer.createPositionAt(this.editor.model.document.getRoot(), "end");
      if (start.nodeBefore?.name === "manualPageBreak")
        start = writer.createPositionBefore(start.nodeBefore);
      const selection = writer.createSelection(writer.createRange(start, end));
      this.editor.model.deleteContent(selection);
      writer.setSelection(selection);
    });
    this.editor.editing.view.focus();
  }

  insertText(text) {
    if (!this.editor) return;
    this.editor.model.change((writer) =>
      this.editor.model.insertContent(writer.createText(text)),
    );
    this.editor.editing.view.focus();
  }

  async destroy() {
    this.disposed = true;
    this.domEvents.abort();
    cancelAnimationFrame(this.frame);
    const editable = this.editor?.ui.getEditableElement();
    const toolbar = this.editor?.ui.view.toolbar.element;
    await this.editor?.destroy();
    editable?.remove();
    toolbar?.remove();
  }
}

function normalizeHtml(html) {
  // Also normalize legacy page-break spans before CKEditor upcasts the document.
  return splitManualPages(html).join("");
}
