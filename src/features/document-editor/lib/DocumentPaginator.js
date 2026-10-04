import { PAGE_GAP_PX, PAGE_RULER_OFFSET_PX } from "./pageGeometry";

/**
 * Page gaps are CKEditor UI elements, invisible to the model and data pipeline.
 * The browser retains one contenteditable for native navigation and selection.
 */
export class DocumentPaginator {
  constructor(editor) {
    this.editor = editor;
    this.gaps = [];
    this.manualBreaks = [];
    this.pages = [];
  }

  layout(metrics) {
    this.metrics = metrics;
    this.page = 0;
    this.pitch = metrics.pageHeightPx + PAGE_RULER_OFFSET_PX + PAGE_GAP_PX;
    const { editing, model } = this.editor;
    editing.view.change((writer) => {
      for (const gap of this.gaps) {
        if (gap.parent) writer.remove(gap);
      }
      for (const marker of this.manualBreaks) {
        if (marker.parent) writer.removeStyle("height", marker);
      }
      this.syncSelection(writer);
    });
    this.gaps = [];
    this.manualBreaks = [];
    this.top = this.editor.ui.getEditableElement().getBoundingClientRect().top;
    const root = model.document.getRoot();
    this.pages = [model.createPositionAt(root, 0)];
    for (const block of root.getChildren()) {
      const view = editing.mapper.toViewElement(block);
      const dom = editing.view.domConverter.mapViewToDom(view);
      if (!dom) continue;
      if (block.name === "manualPageBreak") {
        const height = this.nextPageTop - this.bounds(dom).top;
        editing.view.change((writer) =>
          writer.setStyle("height", `${Math.max(0, height)}px`, view),
        );
        this.manualBreaks.push(view);
        this.page++;
        this.pages.push(model.createPositionAfter(block));
        continue;
      }
      const rect = this.bounds(dom);
      if (rect.height <= metrics.printableHeightPx + 0.5) {
        if (rect.bottom > this.pageBottom + 0.5) {
          this.insertGap(
            editing.mapper.toViewPosition(model.createPositionBefore(block)),
            () => this.bounds(dom).top,
          );
        }
      } else if (block.name === "table") {
        this.paginateTable(block);
      } else {
        this.paginateText(dom);
      }
    }
    this.editor.ui.update();
    return this.pages;
  }

  get pageBottom() {
    return this.page * this.pitch + this.metrics.printableHeightPx;
  }

  get nextPageTop() {
    return (this.page + 1) * this.pitch;
  }

  bounds(dom) {
    const rect = dom.getBoundingClientRect();
    return {
      top: rect.top - this.top,
      bottom: rect.bottom - this.top,
      height: rect.height,
    };
  }

  insertGap(position, measureTop, tag = "div", columns = 1) {
    const { editing } = this.editor;
    const modelPosition = editing.mapper.toModelPosition(position);
    let gap;
    editing.view.change((writer) => {
      gap = writer.createUIElement(
        tag,
        {
          class: "automatic-page-gap",
          "aria-hidden": "true",
          style: "height:1px;",
        },
        tag === "tr"
          ? function (document) {
              const row = this.toDomElement(document);
              const cell = document.createElement("td");
              cell.colSpan = columns;
              cell.style.height = this.getStyle("height");
              row.append(cell);
              return row;
            }
          : undefined,
      );
      writer.insert(position, gap);
      this.syncSelection(writer);
    });
    this.gaps.push(gap);
    const height = Math.max(1, this.nextPageTop - measureTop(gap) + 1);
    editing.view.change((writer) =>
      writer.setStyle("height", `${height}px`, gap),
    );
    this.page++;
    this.pages.push(modelPosition);
  }

  syncSelection(writer) {
    // Removing an inline gap merges view text nodes. Restore from the stable
    // model positions before rendering so selection cannot reference a removed node.
    const selection = this.editor.model.document.selection;
    writer.setSelection(
      Array.from(selection.getRanges(), (range) =>
        this.editor.editing.mapper.toViewRange(range),
      ),
      { backward: selection.isBackward },
    );
  }

  paginateText(dom) {
    // Work at rendered line boundaries without splitting canonical paragraphs.
    for (let attempts = 0; attempts < 500; attempts++) {
      const overflow = this.findOverflow(dom);
      if (!overflow) return;
      const { node, offset, inset } = overflow;
      const position = this.editor.editing.view.domConverter.domPositionToView(
        node,
        offset,
      );
      const modelPosition =
        this.editor.editing.mapper.toModelPosition(position);
      if (
        modelPosition.offset === 0 &&
        this.bounds(dom).top >= this.page * this.pitch
      ) {
        if (this.bounds(dom).top <= this.page * this.pitch + 0.5)
          throw new Error(
            "A line is taller than the printable page. Reduce its font size or increase the printable area.",
          );
      }
      this.insertGap(
        position,
        (gap) => {
          const gapDom =
            this.editor.editing.view.domConverter.mapViewToDom(gap);
          const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
          walker.currentNode = gapDom;
          const text = walker.nextNode();
          const range = document.createRange();
          range.setStart(text, 0);
          range.setEnd(text, 1);
          return range.getBoundingClientRect().top - this.top - inset;
        },
        "span",
      );
    }
    throw new Error("This document exceeds the supported page count.");
  }

  findOverflow(dom) {
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.length || node.parentElement.closest(".automatic-page-gap"))
        continue;
      const lineHeight = parseFloat(
        getComputedStyle(node.parentElement).lineHeight,
      );
      const fontSize = parseFloat(
        getComputedStyle(node.parentElement).fontSize,
      );
      const inset = Math.max(0, (lineHeight - fontSize) / 2);
      const range = document.createRange();
      const overflowing = (offset) => {
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        return rect.top - this.top - inset + lineHeight > this.pageBottom + 0.5;
      };
      if (!overflowing(node.length - 1)) continue;
      let low = 0,
        high = node.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (overflowing(middle)) high = middle;
        else low = middle + 1;
      }
      return { node, offset: low, inset };
    }
    return null;
  }

  paginateTable(table) {
    const { editing, model } = this.editor;
    const columns = this.editor.plugins.get("TableUtils").getColumns(table);
    const rows = Array.from(table.getChildren()).filter(
      (row) => row.name === "tableRow",
    );
    for (let index = 0; index < rows.length;) {
      // An inserted UI row must never consume one of a cell's rowspan slots.
      // Keep all overlapping vertical merges together on the same sheet.
      let end = index + 1;
      for (let current = index; current < end; current++) {
        for (const cell of rows[current].getChildren()) {
          end = Math.min(
            rows.length,
            Math.max(end, current + (cell.getAttribute("rowspan") ?? 1)),
          );
        }
      }
      const row = rows[index];
      const view = editing.mapper.toViewElement(row);
      const dom = editing.view.domConverter.mapViewToDom(view);
      const rect = this.bounds(dom);
      const lastDom = editing.view.domConverter.mapViewToDom(
        editing.mapper.toViewElement(rows[end - 1]),
      );
      const bottom = this.bounds(lastDom).bottom;
      if (bottom - rect.top > this.metrics.printableHeightPx + 0.5)
        throw new Error(
          "A table row or merged row group is taller than the printable page. Divide the row or increase the printable area.",
        );
      if (bottom > this.pageBottom + 0.5)
        this.insertGap(
          editing.mapper.toViewPosition(model.createPositionBefore(row)),
          () => this.bounds(dom).top,
          "tr",
          columns,
        );
      index = end;
    }
  }
}
