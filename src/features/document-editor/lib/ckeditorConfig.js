import {
  Alignment,
  Autoformat,
  Bold,
  Italic,
  Underline,
  BlockQuote,
  Plugin,
  Command,
  DecoupledEditor,
  Essentials,
  Heading,
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Link,
  List,
  Paragraph,
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
  ButtonView,
  Base64UploadAdapter,
  FontFamily,
  FontSize,
  FontColor,
  GeneralHtmlSupport,
  toWidget,
} from "ckeditor5";
import contract from "../../../../shared/html-contract.json";

export const editorType = DecoupledEditor;

class InsertPageBreakCommand extends Command {
  refresh() {
    const position = this.editor.model.document.selection.getFirstPosition();
    this.isEnabled = Boolean(
      position &&
      position.root.rootName !== "$graveyard" &&
      position.root.isAttached() &&
      (position.parent === position.root ||
        position.parent.parent === position.root),
    );
  }
  execute() {
    this.editor.model.change((writer) => {
      this.editor.model.insertObject(
        writer.createElement("manualPageBreak"),
        null,
        null,
        { setSelection: "after" },
      );
    });
  }
}

class DocumentTools extends Plugin {
  init() {
    const editor = this.editor;
    editor.model.schema.register("manualPageBreak", {
      inheritAllFrom: "$blockObject",
      allowIn: "$root",
    });
    editor.conversion.for("upcast").elementToElement({
      view: { name: "div", attributes: { "data-page-break": "true" } },
      model: "manualPageBreak",
      converterPriority: "high",
    });
    editor.conversion.for("dataDowncast").elementToElement({
      model: "manualPageBreak",
      view: (element, { writer }) =>
        writer.createContainerElement("div", { "data-page-break": "true" }),
    });
    editor.conversion.for("editingDowncast").elementToElement({
      model: "manualPageBreak",
      view: (element, { writer }) =>
        toWidget(
          writer.createContainerElement("div", {
            class: "manual-page-break",
            "data-page-break": "true",
          }),
          writer,
          { label: "Page break" },
        ),
    });
    editor.commands.add("insertPageBreak", new InsertPageBreakCommand(editor));
    for (const [name, label, execute] of [
      ["sourceEditing", "Source", () => editor.fire("openSourceDialog")],
      [
        "insertPageBreak",
        "Page break",
        () => editor.execute("insertPageBreak"),
      ],
    ]) {
      editor.ui.componentFactory.add(name, (locale) => {
        const button = new ButtonView(locale);
        button.set({ label, tooltip: true, withText: true });
        if (name === "insertPageBreak")
          button.bind("isEnabled").to(editor.commands.get(name), "isEnabled");
        this.listenTo(button, "execute", execute);
        return button;
      });
    }
  }
}

export const editorConfig = {
  licenseKey: "GPL",
  plugins: [
    Essentials,
    Paragraph,
    Heading,
    Autoformat,
    Bold,
    Italic,
    Underline,
    FontFamily,
    FontSize,
    FontColor,
    Link,
    List,
    Alignment,
    BlockQuote,
    DocumentTools,
    GeneralHtmlSupport,
    Table,
    TableToolbar,
    TableCaption,
    TableProperties,
    TableCellProperties,
    TableColumnResize,
    Image,
    ImageToolbar,
    ImageCaption,
    ImageStyle,
    ImageResize,
    ImageUpload,
    Base64UploadAdapter,
  ],
  toolbar: {
    items: [
      "heading",
      "fontFamily",
      "fontSize",
      "fontColor",
      "|",
      "bold",
      "italic",
      "underline",
      "alignment",
      "|",
      "bulletedList",
      "numberedList",
      "insertTable",
      "uploadImage",
      "|",
      {
        label: "Insert",
        icon: false,
        items: ["insertPageBreak"],
      },
      "sourceEditing",
      "undo",
      "redo",
    ],
    shouldNotGroupWhenFull: true,
  },
  heading: {
    options: [
      { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        model: `heading${n}`,
        view: `h${n}`,
        title: `Heading ${n}`,
        class: `ck-heading_heading${n}`,
      })),
    ],
  },
  fontFamily: {
    options: [
      "default",
      "Arial, sans-serif",
      "Georgia, serif",
      "Times New Roman, serif",
      "Courier New, monospace",
    ],
    supportAllValues: true,
  },
  fontSize: {
    options: [10, 12, 14, 16, 18, 22, 28, 32],
    supportAllValues: true,
  },
  htmlSupport: {
    allow: contract.tags
      .filter((name) => !["div", "span"].includes(name))
      .map((name) => ({
        name,
        styles: contract.styles,
        classes: contract.classes,
        attributes: contract.attributes[name] ?? [],
      })),
  },
  table: {
    contentToolbar: [
      "tableColumn",
      "tableRow",
      "mergeTableCells",
      "toggleTableCaption",
      "tableProperties",
      "tableCellProperties",
    ],
    tableProperties: { defaultProperties: { width: "100%" } },
  },
  image: {
    toolbar: [
      "imageTextAlternative",
      "toggleImageCaption",
      "|",
      "imageStyle:inline",
      "imageStyle:block",
      "imageStyle:side",
      "resizeImage",
    ],
    upload: { types: ["png", "jpeg", "gif", "webp"] },
  },
};
