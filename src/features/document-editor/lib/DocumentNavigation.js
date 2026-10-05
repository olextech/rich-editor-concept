/** Bridges the visual page gaps that native vertical caret movement can stop at. */
export class DocumentNavigation {
  constructor(editor, paginator) {
    this.editor = editor;
    this.paginator = paginator;
    this.column = null;
    editor.editing.view.document.on(
      "keydown",
      (event, data) => {
        if (data.altKey || data.ctrlKey || data.metaKey) {
          this.column = null;
          return;
        }
        const vertical = data.keyCode === 38 || data.keyCode === 40;
        if (!vertical) this.column = null;
        const handled = vertical
          ? this.move(data.keyCode === 40 ? 1 : -1, data.shiftKey)
          : [37, 39].includes(data.keyCode)
            ? this.moveHorizontal(data.keyCode === 39 ? 1 : -1, data.shiftKey)
            : [8, 46].includes(data.keyCode) && !data.shiftKey
              ? this.removeManualBreak(data.keyCode === 8 ? -1 : 1)
              : false;
        if (!handled) return;
        data.preventDefault();
        event.stop();
      },
      { priority: "highest" },
    );
    editor.editing.view.document.on("mousedown", () => {
      this.column = null;
    });
  }

  moveHorizontal(direction, extend) {
    const { model } = this.editor;
    const selection = model.document.selection;
    if (!selection.isCollapsed && !extend) return false;
    for (const boundary of this.paginator.pages.slice(1)) {
      if (boundary.parent !== model.document.getRoot()) continue;
      const before =
        boundary.nodeBefore?.name === "manualPageBreak"
          ? model.createPositionBefore(boundary.nodeBefore)
          : boundary;
      const left = model.schema.getNearestSelectionRange(before, "backward");
      const right = model.schema.getNearestSelectionRange(boundary, "forward");
      if (!left?.isCollapsed || !right?.isCollapsed) continue;
      const from = direction > 0 ? left.start : right.start;
      const to = direction > 0 ? right.start : left.start;
      if (!selection.focus.isEqual(from)) continue;
      this.setCaret(to, extend);
      return true;
    }
    return false;
  }

  removeManualBreak(direction) {
    if (this.editor.isReadOnly) return false;
    const { model } = this.editor;
    const selection = model.document.selection;
    if (!selection.isCollapsed) return false;
    const position = selection.focus;
    const block = position.parent;
    if (
      block.parent !== model.document.getRoot() ||
      position.offset !== (direction < 0 ? 0 : block.maxOffset)
    )
      return false;
    const marker = direction < 0 ? block.previousSibling : block.nextSibling;
    if (marker?.name !== "manualPageBreak") return false;
    model.change((writer) => writer.remove(marker));
    return true;
  }

  setCaret(position, extend) {
    this.editor.model.change((writer) => {
      if (extend) writer.setSelectionFocus(position);
      else writer.setSelection(position);
    });
    this.editor.editing.view.forceRender();
    this.editor.editing.view.focus();
    this.editor.editing.view.scrollToTheSelection();
  }

  move(direction, extend) {
    const { model } = this.editor;
    const native = window.getSelection();
    if (!native?.focusNode) return false;
    if (!native.isCollapsed && !extend) return false;
    // Native selection can move before CKEditor's selectionchange observer runs,
    // especially with repeated arrows. Read the current DOM caret for navigation.
    const viewFocus = this.editor.editing.view.domConverter.domPositionToView(
      native.focusNode,
      native.focusOffset,
    );
    if (!viewFocus) return false;
    const focus = this.editor.editing.mapper.toModelPosition(viewFocus);
    const range = document.createRange();
    range.setStart(native.focusNode, native.focusOffset);
    range.collapse(true);
    let caret = range.getBoundingClientRect();
    if (!caret.height) {
      const view = this.editor.editing.mapper.toViewElement(focus.parent);
      const dom = this.editor.editing.view.domConverter.mapViewToDom(view);
      if (!dom) return false;
      caret = dom.getBoundingClientRect();
    }
    this.column ??= caret.left;
    // Chromium can skip an empty paragraph next to a widget when moving up.
    const block = focus.parent;
    const adjacent = direction < 0 ? block.previousSibling : block.nextSibling;
    if (
      block.parent === model.document.getRoot() &&
      adjacent?.name === "paragraph" &&
      adjacent.isEmpty
    ) {
      const view = this.editor.editing.mapper.toViewElement(block);
      const bounds = this.editor.editing.view.domConverter
        .mapViewToDom(view)
        .getBoundingClientRect();
      const distance =
        direction < 0 ? caret.top - bounds.top : bounds.bottom - caret.bottom;
      if (Math.abs(distance) <= Math.max(2, caret.height / 2)) {
        this.setCaret(model.createPositionAt(adjacent, 0), extend);
        return true;
      }
    }
    const top = this.editor.ui.getEditableElement().getBoundingClientRect().top;
    const page = Math.max(
      0,
      Math.floor((caret.top - top + 0.5) / this.paginator.pitch),
    );
    const targetPage = page + direction;
    if (targetPage < 0 || targetPage >= this.paginator.pages.length)
      return false;
    const edge = this.findCaret(
      page,
      direction > 0 ? "last" : "first",
      this.column,
    );
    if (!edge || Math.abs(caret.top - edge.top) > Math.max(2, caret.height / 2))
      return false;
    const target = this.findCaret(
      targetPage,
      direction > 0 ? "first" : "last",
      this.column,
    );
    if (!target) return false;
    this.setCaret(target.position, extend);
    return true;
  }

  findCaret(page, edge, x) {
    const { editing } = this.editor;
    const editable = this.editor.ui.getEditableElement();
    const pageTop =
      editable.getBoundingClientRect().top + page * this.paginator.pitch;
    const pageBottom = pageTop + this.paginator.metrics.printableHeightPx;
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const lines = [];
    let node;
    while ((node = walker.nextNode())) {
      if (
        !node.length ||
        node.parentElement.closest(
          ".automatic-page-gap, .manual-page-break, .ck-widget__type-around, .ck-widget__selection-handle",
        )
      )
        continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (
          rect.height &&
          rect.top >= pageTop - 1 &&
          rect.bottom <= pageBottom + 1
        )
          lines.push({ node, top: rect.top });
      }
    }
    for (const dom of editable.querySelectorAll(
      "p, h1, h2, h3, h4, h5, h6, .ck-table-bogus-paragraph",
    )) {
      if (dom.textContent) continue;
      const rect = dom.getBoundingClientRect();
      if (
        rect.height &&
        rect.top >= pageTop - 1 &&
        rect.bottom <= pageBottom + 1
      )
        lines.push({ dom, top: rect.top });
    }
    if (!lines.length) {
      // Empty paragraphs contain CKEditor's filler rather than a text node.
      const boundary = this.paginator.pages[page];
      const position = this.editor.model.schema.getNearestSelectionRange(
        boundary,
        "forward",
      )?.start;
      return position ? { position, top: pageTop } : null;
    }
    const lineTop = Math[edge === "first" ? "min" : "max"](
      ...lines.map((line) => line.top),
    );
    let best;
    for (const line of lines.filter(
      (line) => Math.abs(line.top - lineTop) < 1,
    )) {
      if (line.dom) {
        const rect = line.dom.getBoundingClientRect();
        const distance = Math.abs(rect.left - x);
        const position = editing.mapper.toModelPosition(
          editing.view.domConverter.domPositionToView(line.dom, 0),
        );
        if (!best || distance < best.distance)
          best = { position, top: rect.top, distance };
        continue;
      }
      const text = line.node;
      // Binary search skips text on other lines, then compare caret positions on this line.
      const topAt = (offset) => {
        range.setStart(text, offset);
        range.setEnd(text, offset + 1);
        return range.getBoundingClientRect().top;
      };
      let low = 0,
        high = text.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (topAt(middle) < lineTop - 1) low = middle + 1;
        else high = middle;
      }
      for (let offset = low; offset <= text.length; offset++) {
        range.setStart(text, offset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        if (rect.top > lineTop + 1) break;
        if (Math.abs(rect.top - lineTop) > 1) continue;
        const distance = Math.abs(rect.left - x);
        if (!best || distance < best.distance) {
          const viewPosition = editing.view.domConverter.domPositionToView(
            text,
            offset,
          );
          best = {
            position: editing.mapper.toModelPosition(viewPosition),
            top: rect.top,
            distance,
          };
        }
      }
    }
    return best;
  }
}
