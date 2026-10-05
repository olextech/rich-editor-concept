import { useCallback, useEffect, useRef, useState } from "react";
import { TEMPLATES } from "../lib/templates";
import {
  DEFAULT_PAGE_SETTINGS,
  validatePageSettings,
} from "../lib/pageGeometry";
import { validateHtml } from "../lib/htmlSubset";
import { downloadPdf, templateApi } from "../lib/api";
import { printPdf } from "../lib/printPdf";

const STORAGE_KEY = "papercraft-drafts-v1";
const clone = (value) => structuredClone(value);
const snapshots = new WeakMap();
// The backend and CKEditor serialize attributes in different orders. Compare
// markup structurally so loading an unchanged saved template stays clean.
function normalizedHtml(html) {
  const fragment = document.createElement("template");
  fragment.innerHTML = html;
  for (const element of fragment.content.querySelectorAll("*")) {
    const attributes = [...element.attributes].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const attribute of attributes) element.removeAttribute(attribute.name);
    for (const attribute of attributes)
      element.setAttribute(attribute.name, attribute.value);
  }
  return fragment.innerHTML;
}
function snapshot(template) {
  // Template objects are updated immutably. Avoid parsing their HTML again
  // when only a status message, busy state, or dialog has changed.
  if (!snapshots.has(template)) {
    snapshots.set(
      template,
      JSON.stringify({
        name: template.label,
        html: normalizedHtml(template.html),
        pageSettings: template.pageSettings,
      }),
    );
  }
  return snapshots.get(template);
}
const payload = (template) => ({
  name: template.label,
  html: template.html,
  pageSettings: template.pageSettings,
});

function initialState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored?.templates) && stored.templates.length) {
      const ids = new Set();
      for (const item of stored.templates) {
        if (
          typeof item.id !== "string" ||
          typeof item.label !== "string" ||
          ids.has(item.id) ||
          (item.serverId != null && !Number.isInteger(item.serverId))
        )
          throw new Error("Invalid draft");
        ids.add(item.id);
        validateHtml(item.html);
        validatePageSettings(item.pageSettings);
        if (item.savedSnapshot) {
          const saved = JSON.parse(item.savedSnapshot);
          item.savedSnapshot = snapshot({
            label: saved.name,
            html: saved.html,
            pageSettings: saved.pageSettings,
          });
        }
      }
      return {
        templates: stored.templates,
        activeId: ids.has(stored.activeId)
          ? stored.activeId
          : stored.templates[0].id,
      };
    }
  } catch {
    /* A damaged cache must not prevent the editor from opening. */
  }
  return {
    templates: clone(TEMPLATES).map((t) => ({ ...t, savedSnapshot: null })),
    activeId: TEMPLATES[0].id,
  };
}

export function useTemplates({ documentId }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [outputConfirmation, setOutputConfirmation] = useState(null);
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  stateRef.current = state;
  const activeTemplate =
    state.templates.find((t) => t.id === state.activeId) ?? state.templates[0];
  const isDirty = snapshot(activeTemplate) !== activeTemplate.savedSnapshot;

  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const summaries = await templateApi.list(abort.signal);
        const saved = await Promise.all(
          summaries.map((t) => templateApi.get(t.id, abort.signal)),
        );
        if (abort.signal.aborted) return;
        setState((current) => {
          // A server record supersedes an unchanged cache. Unsaved local edits
          // win so loading the list cannot overwrite typing or a restored draft.
          const templates = current.templates.map((local) => {
            const remote = saved.find((t) => t.id === local.serverId);
            if (!remote)
              return local.serverId
                ? { ...local, serverId: undefined, savedSnapshot: null }
                : local;
            if (snapshot(local) !== local.savedSnapshot) return local;
            const next = {
              ...local,
              label: remote.name,
              html: remote.html,
              pageSettings: remote.pageSettings,
            };
            return {
              ...next,
              savedSnapshot: snapshot(next),
              revision: (local.revision ?? 0) + 1,
            };
          });
          for (const remote of saved) {
            if (templates.some((t) => t.serverId === remote.id)) continue;
            const next = {
              id: `saved-${remote.id}`,
              serverId: remote.id,
              label: remote.name,
              html: remote.html,
              pageSettings: remote.pageSettings,
            };
            templates.push({ ...next, savedSnapshot: snapshot(next) });
          }
          return { ...current, templates };
        });
      } catch (error) {
        if (!abort.signal.aborted) setError(error.message);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        setError(
          "Browser draft storage is full or unavailable. Save your document to the backend.",
        );
      }
    }, 250);
    function flush() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
      } catch {
        /* Reported above. */
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [state]);

  useEffect(() => {
    function warn(event) {
      if (
        stateRef.current.templates.some((t) => snapshot(t) !== t.savedSnapshot)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const update = useCallback((id, transform) => {
    setStatus("");
    setState((current) => ({
      ...current,
      templates: current.templates.map((t) => (t.id === id ? transform(t) : t)),
    }));
  }, []);
  const setHtml = useCallback(
    (html) => update(activeTemplate.id, (t) => ({ ...t, html })),
    [activeTemplate.id, update],
  );
  const setName = useCallback(
    (label) => update(activeTemplate.id, (t) => ({ ...t, label })),
    [activeTemplate.id, update],
  );
  const setPageSettings = useCallback(
    (next) => {
      try {
        const settings =
          typeof next === "function" ? next(activeTemplate.pageSettings) : next;
        validatePageSettings(settings);
        update(activeTemplate.id, (t) => ({
          ...t,
          pageSettings: clone(settings),
        }));
        setError("");
      } catch (error) {
        setError(error.message);
      }
    },
    [activeTemplate, update],
  );
  const setActiveTemplateId = useCallback((id) => {
    setStatus("");
    setError("");
    setState((current) =>
      current.templates.some((t) => t.id === id)
        ? { ...current, activeId: id }
        : current,
    );
  }, []);
  const createTemplate = useCallback(() => {
    const template = {
      id: `draft-${crypto.randomUUID()}`,
      label: "Untitled document",
      html: "<p></p>",
      pageSettings: clone(DEFAULT_PAGE_SETTINGS),
      savedSnapshot: null,
    };
    setState((current) => ({
      templates: [...current.templates, template],
      activeId: template.id,
    }));
    setStatus("");
    setError("");
  }, []);

  async function run(action) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (error) {
      setError(error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function saveTemplate(template) {
    validateHtml(template.html);
    validatePageSettings(template.pageSettings);
    if (!template.label.trim())
      throw new Error("Enter a template name before saving.");
    const saved = await templateApi.save(template.serverId, payload(template));
    setState((current) => ({
      ...current,
      templates: current.templates.map((t) =>
        t.id === template.id
          ? { ...t, serverId: saved.id, savedSnapshot: snapshot(template) }
          : t,
      ),
    }));
    return saved.id;
  }
  const currentTemplate = () =>
    clone(
      stateRef.current.templates.find(
        (t) => t.id === stateRef.current.activeId,
      ),
    );
  const save = () =>
    run(async () => {
      await saveTemplate(currentTemplate());
      setStatus("Saved to backend");
    });
  const generateOutput = ({ action, template, documentId, needsSave }) =>
    run(async () => {
      const templateId = needsSave
        ? await saveTemplate(template)
        : template.serverId;
      setStatus(
        action === "print" ? "Preparing PDF for printing…" : "Preparing PDF…",
      );
      const pdf = await templateApi.render({ templateId, documentId });
      if (action === "print") {
        await printPdf(pdf);
        setStatus("Print dialog requested");
      } else {
        downloadPdf(pdf, template.label);
        setStatus("PDF exported");
      }
    });
  const requestOutput = (action) => {
    if (busyRef.current || outputConfirmation) return;
    const template = currentTemplate();
    const needsSave =
      !template.serverId || snapshot(template) !== template.savedSnapshot;
    const output = { action, template, documentId, needsSave };
    setError("");
    setStatus("");
    if (needsSave) setOutputConfirmation(output);
    else generateOutput(output);
  };
  const exportPdf = () => requestOutput("download");
  const print = () => requestOutput("print");
  const cancelOutput = () => setOutputConfirmation(null);
  const confirmOutput = () => {
    if (!outputConfirmation) return;
    const output = outputConfirmation;
    setOutputConfirmation(null);
    generateOutput(output);
  };
  const deleteTemplate = () =>
    run(async () => {
      const template = stateRef.current.templates.find(
        (t) => t.id === stateRef.current.activeId,
      );
      if (template.serverId) await templateApi.delete(template.serverId);
      setState((current) => {
        const templates = current.templates.filter((t) => t.id !== template.id);
        if (!templates.length)
          templates.push({
            id: `draft-${crypto.randomUUID()}`,
            label: "Untitled document",
            html: "<p></p>",
            pageSettings: clone(DEFAULT_PAGE_SETTINGS),
            savedSnapshot: null,
          });
        return {
          templates,
          activeId:
            current.activeId === template.id
              ? templates[0].id
              : current.activeId,
        };
      });
    });
  return {
    templates: state.templates,
    activeTemplate,
    activeTemplateId: activeTemplate.id,
    setActiveTemplateId,
    html: activeTemplate.html,
    pageSettings: activeTemplate.pageSettings,
    setHtml,
    setName,
    setPageSettings,
    createTemplate,
    deleteTemplate,
    save,
    exportPdf,
    print,
    outputConfirmation,
    cancelOutput,
    confirmOutput,
    isDirty,
    busy,
    loading,
    error,
    status,
  };
}
