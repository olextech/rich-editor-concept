import { Alignment } from "@ckeditor/ckeditor5-alignment/dist/index.js";
import { Autoformat } from "@ckeditor/ckeditor5-autoformat/dist/index.js";
import {
  Bold,
  Italic,
  Underline,
} from "@ckeditor/ckeditor5-basic-styles/dist/index.js";
import { BlockQuote } from "@ckeditor/ckeditor5-block-quote/dist/index.js";
import { MultiRootEditor } from "@ckeditor/ckeditor5-editor-multi-root/dist/index.js";
import { Essentials } from "@ckeditor/ckeditor5-essentials/dist/index.js";
import { Heading } from "@ckeditor/ckeditor5-heading/dist/index.js";
import {
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
} from "@ckeditor/ckeditor5-image/dist/index.js";
import { Link } from "@ckeditor/ckeditor5-link/dist/index.js";
import { List } from "@ckeditor/ckeditor5-list/dist/index.js";
import { Paragraph } from "@ckeditor/ckeditor5-paragraph/dist/index.js";
import {
  Table,
  TableCaption,
  TableCellProperties,
  TableColumnResize,
  TableProperties,
  TableToolbar,
} from "@ckeditor/ckeditor5-table/dist/index.js";
import { Base64UploadAdapter } from "@ckeditor/ckeditor5-upload/dist/index.js";

export const editorType = MultiRootEditor;

export const editorConfig = {
  licenseKey: "GPL",
  ui: {
    poweredBy: {
      label: null,
    },
  },
  plugins: [
    Essentials,
    Paragraph,
    Heading,
    Autoformat,
    Bold,
    Italic,
    Underline,
    Link,
    List,
    Alignment,
    BlockQuote,
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
  toolbar: [
    "heading",
    "|",
    "bold",
    "italic",
    "underline",
    "|",
    "alignment",
    "|",
    "bulletedList",
    "numberedList",
    "|",
    "insertTable",
    "uploadImage",
    "|",
    "undo",
    "redo",
  ],
  table: {
    contentToolbar: [
      "tableColumn",
      "tableRow",
      "mergeTableCells",
      "toggleTableCaption",
      "tableProperties",
      "tableCellProperties",
    ],
    tableProperties: {
      defaultProperties: {
        width: "100%",
      },
    },
  },
  image: {
    toolbar: [
      "imageTextAlternative",
      "|",
      "imageStyle:inline",
      "imageStyle:block",
      "imageStyle:side",
    ],
  },
};
