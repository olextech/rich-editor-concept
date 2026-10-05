import { splitManualPages, EMPTY_PAGE_HTML } from "./pageHtml";
import { validateHtml } from "./htmlSubset";
import { DocumentPaginator } from "./DocumentPaginator";
import { DocumentNavigation } from "./DocumentNavigation";
import { readTableProperties, tablePropertyCommand } from "./tableProperties";
import { readImageProperties, selectedImage } from "./imageProperties";

const PORTAL_THEME_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "canvas",
  "paper",
  "ruler-bg",
  "ruler-tick",
  "ruler-margin",
  "margin-guide",
  "radius",
  "font-sans",
  "font-mono",
  "font-serif",
];

/** One editable model for the entire document; pagination only changes its view. */
export class PagedEditorController {
  constructor({
    html,
    metrics,
    onChange,
    onPages,
    onSource,
    onTableProperties,
    onImagePreferences,
    onError,
    onLayout,
    licenseKey,
    readOnly = false,
  }) {
    Object.assign(this, {
      html,
      metrics,
      onChange,
      onPages,
      onSource,
      onTableProperties,
      onImagePreferences,
      onError,
      onLayout,
      licenseKey,
      readOnly,
    });
    this.disposed = false;
    this.domEvents = new AbortController();
  }

  async mount(toolbar) {
    if (typeof this.licenseKey !== "string" || !this.licenseKey.trim())
      throw new Error("Provide a CKEditor license key.");
    validateHtml(this.html);
    const { editorConfig, editorType } = await import("./ckeditorConfig");
    if (this.disposed) return;
    const editor = await editorType.create(normalizeHtml(this.html), {
      ...editorConfig,
      licenseKey: this.licenseKey,
    });
    if (this.disposed) {
      await editor.destroy();
      return;
    }
    this.editor = editor;
    // This is the instance-owned container. CKEditor shares its outer wrapper.
    editor.ui.view.body.bodyCollectionContainer.classList.add(
      "papercraft-editor-portal",
    );
    this.updatePortalTheme();
    this.setReadOnly(this.readOnly);
    this.paginator = new DocumentPaginator(editor);
    this.navigation = new DocumentNavigation(editor, this.paginator);
    editor.editing.view.document.on("compositionend", () => this.schedule(), {
      priority: "lowest",
    });
    editor.on("openSourceDialog", () => this.onSource(this.getHtml()));
    editor.on("openTablePropertiesDialog", (_, kind) => {
      if (this.readOnly) return;
      this.tablePropertiesSelection = editor.model.createSelection(
        editor.model.document.selection,
      );
      this.onTableProperties({ kind, ...readTableProperties(editor, kind) });
    });
    editor.on("openImagePreferencesDialog", () => {
      if (this.readOnly) return;
      const image = selectedImage(editor);
      if (!image) return;
      this.imagePreferencesSelection = editor.model.createSelection(
        editor.model.document.selection,
      );
      this.imagePreferencesTarget = image;
      const properties = readImageProperties(editor, image);
      this.onImagePreferences(properties);
    });
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
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.host = host;
    const root = host?.closest(".papercraft-editor");
    const viewport = host?.closest(".workspace-scroll");
    if (root && typeof MutationObserver !== "undefined") {
      this.themeObserver = new MutationObserver(() => this.updatePortalTheme());
      this.themeObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
    if (root && typeof ResizeObserver !== "undefined") {
      const dimensions = new WeakMap();
      this.resizeObserver = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
          if (dimensions.get(entry.target) !== size) {
            dimensions.set(entry.target, size);
            changed = true;
          }
        }
        if (changed) {
          this.updatePortalTheme();
          this.schedule();
        }
      });
      // Do not observe editable content: pagination changes its own dimensions.
      this.resizeObserver.observe(root);
      if (viewport && viewport !== root) this.resizeObserver.observe(viewport);
    }
    if (root && typeof IntersectionObserver !== "undefined") {
      this.visibilityObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.schedule();
      });
      this.visibilityObserver.observe(root);
    }
    this.attach();
    if (host) this.schedule();
  }

  updatePortalTheme() {
    const root = this.host?.closest(".papercraft-editor");
    const portal = this.editor?.ui.view.body.bodyCollectionContainer;
    if (!root || !portal) return;
    const theme = getComputedStyle(root);
    for (const token of PORTAL_THEME_TOKENS) {
      const value = theme.getPropertyValue(`--${token}`).trim();
      if (value) portal.style.setProperty(`--${token}`, value);
      else portal.style.removeProperty(`--${token}`);
    }
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

  setReadOnly(readOnly) {
    this.readOnly = Boolean(readOnly);
    if (!this.editor) return;
    if (this.readOnly) this.editor.enableReadOnlyMode("papercraft-host");
    else this.editor.disableReadOnlyMode("papercraft-host");
  }

  schedule() {
    if (this.disposed) return;
    this.onLayout(false);
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (!this.editor?.ui.getEditableElement()?.isConnected) return;
      if (!this.editor.ui.getEditableElement().getBoundingClientRect().width)
        return;
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
    if (this.readOnly || !this.editor) return;
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
    if (this.readOnly || !this.editor) return;
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
    if (this.readOnly || !this.editor) return;
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
    if (this.readOnly || !this.editor) return;
    this.editor.model.change((writer) =>
      this.editor.model.insertContent(writer.createText(text)),
    );
    this.editor.editing.view.focus();
  }

  closeTableProperties() {
    if (!this.editor || !this.tablePropertiesSelection) return;
    this.editor.model.change((writer) =>
      writer.setSelection(this.tablePropertiesSelection),
    );
    this.tablePropertiesSelection = null;
    this.editor.editing.view.focus();
  }

  applyTableProperties(kind, changes) {
    if (this.readOnly || !this.editor || !this.tablePropertiesSelection) return;
    this.editor.model.change((writer) => {
      writer.setSelection(this.tablePropertiesSelection);
      for (const [property, value] of Object.entries(changes)) {
        this.editor.execute(tablePropertyCommand(kind, property), {
          value: value.trim(),
          batch: writer.batch,
        });
      }
    });
    this.closeTableProperties();
  }

  async destroy() {
    this.disposed = true;
    this.domEvents.abort();
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.themeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
    const editable = this.editor?.ui.getEditableElement();
    const toolbar = this.editor?.ui.view.toolbar.element;
    await this.editor?.destroy();
    editable?.remove();
    toolbar?.remove();
  }

  closeImagePreferences() {
    if (!this.editor || !this.imagePreferencesSelection) return;
    this.editor.model.change((writer) =>
      writer.setSelection(this.imagePreferencesSelection),
    );
    this.imagePreferencesSelection = null;
    this.imagePreferencesTarget = null;
    this.editor.editing.view.focus();
  }

  applyImagePreferences(changes) {
    if (this.readOnly) return;
    const editor = this.editor;
    if (!editor || !this.imagePreferencesTarget) return;
    let image = this.imagePreferencesTarget;
    editor.model.change((writer) => {
      writer.setSelection(image, "on");
      if (Object.hasOwn(changes, "layout")) {
        editor.execute("imageStyle", {
          value: changes.layout,
          setImageSizes: false,
        });
        image = selectedImage(editor);
      }
      if (Object.hasOwn(changes, "width"))
        editor.execute("resizeImage", { width: changes.width || null });
      if (Object.hasOwn(changes, "alt"))
        editor.execute("imageTextAlternative", { newValue: changes.alt });
      writer.setSelection(image, "on");
    });
    // A layout change may replace the image model element. Keep the new
    // selection instead of restoring a selection around the removed image.
    this.imagePreferencesSelection = null;
    this.imagePreferencesTarget = null;
  }
}

function normalizeHtml(html) {
  // Also normalize legacy page-break spans before CKEditor upcasts the document.
  return splitManualPages(html).join("");
}
