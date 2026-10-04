import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Workspace } from "./components/Workspace";
import { PrintStyles } from "./components/PrintStyles";
import { SourceCodeDialog } from "./components/SourceCodeDialog";
import { TablePropertiesDialog } from "./components/TablePropertiesDialog";
import { ImagePreferencesDialog } from "./components/ImagePreferencesDialog";
import { VariablesPanel } from "./components/VariablesPanel";
import { usePagedEditor } from "./hooks/usePagedEditor";
import { DEFAULT_PAGE_SETTINGS } from "./lib/pageGeometry";
import { renderVariables } from "./lib/renderVariables";

const NO_VARIABLE_VALUES = Object.freeze({});

/** Reusable document-agnostic editor; the host owns saving and template selection. */
export function DocumentEditor({
  documentKey = "document",
  initialHtml = "<p></p>",
  pageSettings = DEFAULT_PAGE_SETTINGS,
  onChange,
  renderHeader,
  showVariables = false,
  variableValues = NO_VARIABLE_VALUES,
  variableRows,
  message,
}) {
  const editor = usePagedEditor({
    documentKey,
    initialHtml,
    pageSettings,
    onChange,
  });
  const printHtml = useMemo(
    () => renderVariables(editor.canonicalHtml, variableValues, variableRows),
    [editor.canonicalHtml, variableValues, variableRows],
  );
  const ua = navigator.userAgent;
  const browserWarning = /Firefox\//.test(ua)
    ? "Firefox editing is best effort. Use Chrome or Edge for supported page layout."
    : /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)
      ? "Safari editing is unsupported. Open this editor in Chrome or Edge."
      : "";
  return (
    <TooltipProvider>
      <PrintStyles pageSettings={pageSettings} />
      <div className="document-editor flex h-screen flex-col bg-background text-foreground">
        {renderHeader?.({ isReady: editor.isReady, error: editor.error })}
        {browserWarning ? (
          <div
            role="status"
            className="app-message border-b bg-amber-50 px-4 py-2 text-sm"
          >
            {browserWarning}
          </div>
        ) : null}
        {message}
        {editor.error ? (
          <div
            role="alert"
            className="app-message border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {editor.error}
          </div>
        ) : null}
        <div className="editor-body flex min-h-0 flex-1">
          <Workspace
            pageNames={editor.pageNames}
            pageSettings={pageSettings}
            toolbarHostRef={editor.toolbarHostRef}
            registerEditableHost={editor.registerEditableHost}
            onAddPage={editor.addPage}
            onDeletePage={editor.deletePage}
            disabled={!editor.isReady}
          />
          {showVariables ? (
            <VariablesPanel
              onInsertVariable={editor.insertVariable}
              variableValues={variableValues}
            />
          ) : null}
        </div>
        {!editor.isReady && !editor.error ? (
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full border bg-background px-4 py-1.5 text-xs"
          >
            Loading editor…
          </div>
        ) : null}
        <SourceCodeDialog
          isOpen={editor.sourceDialog.isOpen}
          value={editor.sourceDialog.value}
          error={editor.sourceDialog.error}
          onChange={editor.setSourceValue}
          onFormat={editor.formatSourceValue}
          onClose={editor.closeSourceDialog}
          onSave={editor.saveSourceDialog}
        />
        {editor.tablePropertiesDialog ? (
          <TablePropertiesDialog
            properties={editor.tablePropertiesDialog}
            onClose={editor.closeTablePropertiesDialog}
            onSave={editor.saveTablePropertiesDialog}
          />
        ) : null}
        {editor.imagePreferencesDialog ? (
          <ImagePreferencesDialog
            properties={editor.imagePreferencesDialog}
            onClose={editor.closeImagePreferencesDialog}
            onSave={editor.saveImagePreferencesDialog}
          />
        ) : null}
      </div>
      <div
        className="print-document browser-print-document"
        dangerouslySetInnerHTML={{ __html: printHtml }}
      />
    </TooltipProvider>
  );
}
