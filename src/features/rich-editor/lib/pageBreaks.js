export const PAGE_BREAK_HTML =
  '<p><span class="page-break-marker" data-page-break="true"></span></p>';

export function hasPageBreaks(html) {
  return html.includes('data-page-break="true"');
}

export function insertPageBreakAtCursor(editor, fallbackHtml) {
  const insertion = PAGE_BREAK_HTML;

  try {
    const dataProcessor = editor.data.processor;
    const viewFragment = dataProcessor.toView(insertion);
    const modelFragment = editor.data.toModel(viewFragment);

    editor.model.change(() => {
      editor.model.insertContent(
        modelFragment,
        editor.model.document.selection,
      );
    });

    return editor.getData();
  } catch {
    return `${fallbackHtml}${insertion}`;
  }
}
