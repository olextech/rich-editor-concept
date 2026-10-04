import { useCallback, useEffect, useRef, useState } from "react";
import { PagedEditorController } from "../lib/PagedEditorController";
import { getPageMetrics } from "../lib/pageGeometry";
import { splitManualPages, formatHtmlSource } from "../lib/pageHtml";

export function usePagedEditor({
  documentKey,
  initialHtml,
  pageSettings,
  onChange,
}) {
  const controllerRef = useRef(null);
  const toolbarHostRef = useRef(null);
  const editableHost = useRef(null);
  const latest = useRef({ initialHtml, onChange, pageSettings });
  latest.current = { initialHtml, onChange, pageSettings };
  const [isReady, setIsReady] = useState(false);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [error, setError] = useState("");
  const [canonicalHtml, setCanonicalHtml] = useState(initialHtml);
  const [pageNames, setPageNames] = useState(() =>
    splitManualPages(initialHtml).map((_, index) => `page-${index + 1}`),
  );
  const [sourceDialog, setSourceDialog] = useState({
    isOpen: false,
    value: "",
    error: "",
  });
  const [tablePropertiesDialog, setTablePropertiesDialog] = useState(null);
  const [imagePreferencesDialog, setImagePreferencesDialog] = useState(null);

  useEffect(() => {
    setIsReady(false);
    setIsLayoutReady(false);
    setError("");
    setCanonicalHtml(latest.current.initialHtml);
    setSourceDialog({ isOpen: false, value: "", error: "" });
    setTablePropertiesDialog(null);
    setImagePreferencesDialog(null);
    const controller = new PagedEditorController({
      html: latest.current.initialHtml,
      metrics: getPageMetrics(latest.current.pageSettings),
      onChange: (html) => {
        setCanonicalHtml(html);
        latest.current.onChange?.(html);
      },
      onPages: (names) =>
        setPageNames((previous) =>
          previous.join() === names.join() ? previous : names,
        ),
      onLayout: setIsLayoutReady,
      onError: setError,
      onSource: (html) =>
        setSourceDialog({
          isOpen: true,
          value: formatHtmlSource(html),
          error: "",
        }),
      onTableProperties: setTablePropertiesDialog,
      onImagePreferences: setImagePreferencesDialog,
    });
    controllerRef.current = controller;
    controller.registerHost(editableHost.current);
    controller
      .mount(toolbarHostRef.current)
      .then(() => {
        if (!controller.disposed) setIsReady(true);
      })
      .catch((error) => {
        if (!controller.disposed) setError(error.message);
      });
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      controller.destroy().catch(console.error);
    };
  }, [documentKey]);

  useEffect(() => {
    controllerRef.current?.updateMetrics(getPageMetrics(pageSettings));
  }, [pageSettings]);

  const registerEditableHost = useCallback((node) => {
    editableHost.current = node;
    controllerRef.current?.registerHost(node);
  }, []);
  const addPage = useCallback(() => controllerRef.current?.addPage(), []);
  const deletePage = useCallback(
    (name) => controllerRef.current?.deletePage(name),
    [],
  );
  const insertVariable = useCallback(
    (text) => controllerRef.current?.insertText(text),
    [],
  );
  const setSourceValue = useCallback(
    (value) => setSourceDialog((current) => ({ ...current, value, error: "" })),
    [],
  );
  const closeSourceDialog = useCallback(
    () => setSourceDialog((current) => ({ ...current, isOpen: false })),
    [],
  );
  const formatSourceValue = useCallback(
    () =>
      setSourceDialog((current) => ({
        ...current,
        value: formatHtmlSource(current.value),
        error: "",
      })),
    [],
  );
  const saveSourceDialog = useCallback(() => {
    try {
      controllerRef.current?.applyHtml(sourceDialog.value);
      setSourceDialog((current) => ({ ...current, isOpen: false, error: "" }));
    } catch (error) {
      setSourceDialog((current) => ({ ...current, error: error.message }));
    }
  }, [sourceDialog.value]);
  const closeTablePropertiesDialog = useCallback(() => {
    setTablePropertiesDialog(null);
    // Wait for the native modal to close before focusing the editor.
    requestAnimationFrame(() => controllerRef.current?.closeTableProperties());
  }, []);
  const saveTablePropertiesDialog = useCallback((kind, changes) => {
    controllerRef.current?.applyTableProperties(kind, changes);
    setTablePropertiesDialog(null);
    requestAnimationFrame(() =>
      controllerRef.current?.editor?.editing.view.focus(),
    );
  }, []);
  const closeImagePreferencesDialog = useCallback(() => {
    setImagePreferencesDialog(null);
    requestAnimationFrame(() => controllerRef.current?.closeImagePreferences());
  }, []);
  const saveImagePreferencesDialog = useCallback((changes) => {
    controllerRef.current?.applyImagePreferences(changes);
    setImagePreferencesDialog(null);
    requestAnimationFrame(() =>
      controllerRef.current?.editor?.editing.view.focus(),
    );
  }, []);
  return {
    pageNames,
    canonicalHtml,
    toolbarHostRef,
    registerEditableHost,
    addPage,
    deletePage,
    insertVariable,
    isReady: isReady && isLayoutReady,
    error,
    sourceDialog,
    setSourceValue,
    formatSourceValue,
    closeSourceDialog,
    saveSourceDialog,
    tablePropertiesDialog,
    closeTablePropertiesDialog,
    saveTablePropertiesDialog,
    imagePreferencesDialog,
    closeImagePreferencesDialog,
    saveImagePreferencesDialog,
    getHtml: () => controllerRef.current?.getHtml() ?? initialHtml,
  };
}
