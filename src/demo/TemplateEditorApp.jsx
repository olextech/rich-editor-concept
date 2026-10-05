import { DocumentEditor } from "../editor/index.js";
import { TopBar } from "./TopBar";
import { useTemplates } from "./useTemplates";
import { DEMO_VARIABLE_VALUES, VARIABLE_GROUPS } from "./variables";
import { SaveBeforeOutputDialog } from "./SaveBeforeOutputDialog";

export function TemplateEditorApp({ documentId = "demo-invoice" }) {
  const templates = useTemplates({ documentId });
  const message = templates.error ? (
    <div
      role="alert"
      className="app-message border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      {templates.error}
    </div>
  ) : templates.status ? (
    <div role="status" className="app-message border-b px-4 py-2 text-sm">
      {templates.status}
    </div>
  ) : null;
  return (
    <div className="papercraft-demo papercraft-editor">
      <DocumentEditor
        documentKey={`${templates.activeTemplate.id}:${templates.activeTemplate.revision ?? 0}`}
        initialHtml={templates.html}
        pageSettings={templates.pageSettings}
        onChange={templates.setHtml}
        licenseKey="GPL"
        variableGroups={VARIABLE_GROUPS}
        variableValues={DEMO_VARIABLE_VALUES}
        message={message}
        renderHeader={({ isReady, error }) => (
          <TopBar
            templates={templates.templates}
            activeTemplateId={templates.activeTemplateId}
            onTemplateChange={templates.setActiveTemplateId}
            name={templates.activeTemplate.label}
            onNameChange={templates.setName}
            pageSettings={templates.pageSettings}
            onPageSettingsChange={templates.setPageSettings}
            onCreate={templates.createTemplate}
            onDelete={() => {
              if (
                window.confirm(
                  `Delete “${templates.activeTemplate.label}” and its draft?`,
                )
              )
                templates.deleteTemplate();
            }}
            onSave={templates.save}
            onExport={templates.exportPdf}
            onPrint={templates.print}
            disabled={!isReady || templates.busy || Boolean(error)}
            busy={templates.busy}
            isDirty={templates.isDirty}
          />
        )}
      />
      {templates.outputConfirmation ? (
        <SaveBeforeOutputDialog
          action={templates.outputConfirmation.action}
          onCancel={templates.cancelOutput}
          onConfirm={templates.confirmOutput}
        />
      ) : null}
    </div>
  );
}
