import { useCallback, useEffect, useRef, useState } from "react";
import { PagedEditorController } from "../lib/PagedEditorController";
import { DEFAULT_PAGE_SETTINGS, getPageMetrics } from "../lib/pageGeometry";
import { formatHtmlSource } from "../lib/pageHtml";
import { cleanHtml } from "../lib/htmlSubset";

export function usePagedEditor({
  documentKey,
  initialHtml,
  pageSettings,
  onChange,
  licenseKey,
  readOnly,
  onStateChange,
}) {
  const controllerRef = useRef(null);
  const toolbarHostRef = useRef(null);
  const editableHost = useRef(null);
  const latest = useRef(null);
  latest.current = {
    initialHtml,
    onChange,
    pageSettings,
    readOnly,
    onStateChange,
  };
  const settingsError = useRef("");
  const [isReady, setIsReady] = useState(false);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [error, setError] = useState("");
  const [canonicalHtml, setCanonicalHtml] = useState(initialHtml);
  const [pageNames, setPageNames] = useState(["page-1"]);
  const [validPageSettings, setValidPageSettings] = useState(
    DEFAULT_PAGE_SETTINGS,
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
    setPageNames(["page-1"]);
    setSourceDialog({ isOpen: false, value: "", error: "" });
    setTablePropertiesDialog(null);
    setImagePreferencesDialog(null);
    let metrics;
    try {
      metrics = getPageMetrics(latest.current.pageSettings);
      setValidPageSettings(latest.current.pageSettings);
      settingsError.current = "";
    } catch (error) {
      settingsError.current = error.message;
      setError(error.message);
      metrics = getPageMetrics(DEFAULT_PAGE_SETTINGS);
      setValidPageSettings(DEFAULT_PAGE_SETTINGS);
    }
    const controller = new PagedEditorController({
      html: latest.current.initialHtml,
      metrics,
      licenseKey,
      readOnly: latest.current.readOnly,
      onChange: (html) => {
        if (controller.disposed) return;
        setCanonicalHtml(html);
        latest.current.onChange?.(html);
      },
      onPages: (names) =>
        setPageNames((previous) =>
          previous.join() === names.join() ? previous : names,
        ),
      onLayout: setIsLayoutReady,
      onError: (message) => setError(settingsError.current || message),
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
  }, [documentKey, licenseKey]);

  useEffect(() => {
    try {
      const metrics = getPageMetrics(pageSettings);
      setValidPageSettings(pageSettings);
      settingsError.current = "";
      controllerRef.current?.updateMetrics(metrics);
    } catch (error) {
      settingsError.current = error.message;
      setError(error.message);
    }
  }, [pageSettings]);

  useEffect(() => {
    controllerRef.current?.setReadOnly(readOnly);
    if (readOnly) {
      setTablePropertiesDialog(null);
      setImagePreferencesDialog(null);
    }
  }, [readOnly]);

  const ready = isReady && isLayoutReady;
  useEffect(() => {
    latest.current.onStateChange?.({
      isReady: ready,
      error,
      pageCount: pageNames.length,
    });
  }, [ready, error, pageNames.length]);

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
    (value) =>
      setSourceDialog((current) => ({
        ...current,
        value,
        error: "",
        status: "",
      })),
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
        status: "",
      })),
    [],
  );
  const cleanSourceValue = useCallback(() => {
    if (latest.current.readOnly) return;
    setSourceDialog((current) => {
      try {
        const value = cleanHtml(current.value);
        return {
          ...current,
          value,
          error: "",
          status:
            value === current.value
              ? "HTML already uses supported markup."
              : "HTML cleaned. Review the code, then apply it.",
        };
      } catch (error) {
        return { ...current, error: error.message, status: "" };
      }
    });
  }, []);
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
    pageSettings: validPageSettings,
    pageNames,
    canonicalHtml,
    toolbarHostRef,
    registerEditableHost,
    addPage,
    deletePage,
    insertVariable,
    isReady: ready,
    error,
    sourceDialog,
    setSourceValue,
    formatSourceValue,
    cleanSourceValue,
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
