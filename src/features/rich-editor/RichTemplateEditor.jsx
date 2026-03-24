import { useEffect, useMemo, useRef, useState } from "react";
import EditorToolbar from "./components/EditorToolbar";
import PagedWorkspace from "./components/PagedWorkspace";
import PageSettingsBar from "./components/PageSettingsBar";
import { editorConfig, editorType } from "./lib/ckeditorConfig";
import { getPageMetrics } from "./lib/pageGeometry";
import {
  buildRootDataFromHtml,
  createPageRootName,
  joinTopLevelHtml,
  normalizePageHtml,
  serializePagesToHtml,
  splitTopLevelHtml,
} from "./lib/pageRoots";

const EMPTY_PAGE_HTML = "<p></p>";

export default function RichTemplateEditor({
  value,
  pageSettings,
  onChange,
  onPageSettingsChange,
}) {
  const editorRef = useRef(null);
  const toolbarHostRef = useRef(null);
  const pageHostRefs = useRef(new Map());
  const pageRootsRef = useRef([]);
  const activeRootRef = useRef("page-1");
  const isApplyingDataRef = useRef(false);
  const rebalanceFrameRef = useRef(0);
  const lastCommittedValueRef = useRef(value);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [pageRoots, setPageRoots] = useState(() =>
    buildRootDataFromHtml(value).map((page) => page.name),
  );
  const metrics = useMemo(() => getPageMetrics(pageSettings), [pageSettings]);

  useEffect(() => {
    pageRootsRef.current = pageRoots;
  }, [pageRoots]);

  useEffect(() => {
    let isMounted = true;

    async function createEditor() {
      try {
        const rootData = buildRootDataFromHtml(value);
        const editor = await editorType.create(
          Object.fromEntries(rootData.map((page) => [page.name, page.html])),
          editorConfig,
        );

        if (!isMounted) {
          await editor.destroy();
          return;
        }

        editorRef.current = editor;
        pageRootsRef.current = rootData.map((page) => page.name);
        setPageRoots(rootData.map((page) => page.name));

        if (toolbarHostRef.current) {
          toolbarHostRef.current.innerHTML = "";
          toolbarHostRef.current.appendChild(editor.ui.view.toolbar.element);
        }

        editor.model.document.on("change:data", () => {
          if (isApplyingDataRef.current) {
            return;
          }

          const nextValue = getSerializedValue(editor, pageRootsRef.current);
          lastCommittedValueRef.current = nextValue;
          onChange(nextValue);
          scheduleRebalance();
        });

        editor.on("detachRoot", (_, root) => {
          const editable = editor.detachEditable(root);
          editable?.remove();
        });

        setIsReady(true);
        setError("");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Editor failed.");
        setIsReady(false);
      }
    }

    createEditor();

    return () => {
      isMounted = false;
      cancelAnimationFrame(rebalanceFrameRef.current);

      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || !isReady) {
      return;
    }

    pageRoots.forEach((rootName, index) => {
      const host = pageHostRefs.current.get(rootName);

      if (!host) {
        return;
      }

      let editable = editor.ui.getEditableElement(rootName);

      if (!editable) {
        editable = editor.createEditable(
          editor.model.document.getRoot(rootName),
          undefined,
          `Page ${index + 1}`,
        );
      }

      if (editable.parentElement !== host) {
        host.innerHTML = "";
        host.appendChild(editable);
      }

      editable.dataset.pageRoot = rootName;
      editable.onfocus = () => {
        activeRootRef.current = rootName;
      };
    });

    scheduleRebalance();
  }, [isReady, pageRoots]);

  useEffect(() => {
    if (!isReady || !editorRef.current) {
      return;
    }

    if (lastCommittedValueRef.current === value) {
      return;
    }

    applyPages(buildRootDataFromHtml(value).map((page) => page.html));
  }, [isReady, value]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    scheduleRebalance();
  }, [isReady, metrics]);

  function handleAddPage() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const currentData = editor.getFullData({ trim: "none" });
    const nextPages = pageRootsRef.current.map(
      (rootName) => currentData[rootName] ?? EMPTY_PAGE_HTML,
    );

    nextPages.push(EMPTY_PAGE_HTML);
    applyPages(nextPages);
  }

  function handleDeletePage(rootNameToDelete) {
    const editor = editorRef.current;

    if (!editor || pageRootsRef.current.length <= 1) {
      return;
    }

    const currentData = editor.getFullData({ trim: "none" });
    const deleteIndex = pageRootsRef.current.indexOf(rootNameToDelete);

    if (deleteIndex < 0) {
      return;
    }

    const nextPages = pageRootsRef.current
      .filter((rootName) => rootName !== rootNameToDelete)
      .map((rootName) => currentData[rootName] ?? EMPTY_PAGE_HTML);

    const nextActiveIndex = Math.max(0, deleteIndex - 1);
    activeRootRef.current = createPageRootName(nextActiveIndex);
    applyPages(nextPages);
  }

  function scheduleRebalance() {
    cancelAnimationFrame(rebalanceFrameRef.current);
    rebalanceFrameRef.current = requestAnimationFrame(() => {
      rebalancePages();
    });
  }

  function rebalancePages() {
    const editor = editorRef.current;

    if (!editor || isApplyingDataRef.current) {
      return;
    }

    const rootNames = [...pageRootsRef.current];
    const currentData = editor.getFullData({ trim: "none" });
    const pageHtmlList = rootNames.map((rootName) =>
      normalizePageHtml(currentData[rootName] ?? EMPTY_PAGE_HTML),
    );
    let didChange = false;

    for (let index = 0; index < rootNames.length; index += 1) {
      const rootName = rootNames[index];
      const editable = editor.ui.getEditableElement(rootName);

      if (!editable) {
        continue;
      }

      if (editable.scrollHeight > metrics.printableHeightPx + 2) {
        const currentBlocks = splitTopLevelHtml(pageHtmlList[index]);

        if (currentBlocks.length <= 1) {
          continue;
        }

        const movedBlock = currentBlocks.pop();

        if (index === rootNames.length - 1) {
          rootNames.push(createPageRootName(rootNames.length));
          pageHtmlList.push(EMPTY_PAGE_HTML);
        }

        const nextBlocks = splitTopLevelHtml(pageHtmlList[index + 1]);
        nextBlocks.unshift(movedBlock);
        pageHtmlList[index] = joinTopLevelHtml(currentBlocks);
        pageHtmlList[index + 1] = joinTopLevelHtml(nextBlocks);
        didChange = true;
        break;
      }

      if (index === rootNames.length - 1) {
        continue;
      }

      const nextEditable = editor.ui.getEditableElement(rootNames[index + 1]);
      const nextBlocks = splitTopLevelHtml(pageHtmlList[index + 1]);
      const firstBlock = nextEditable?.firstElementChild;

      if (
        nextBlocks.length > 1 &&
        firstBlock &&
        editable.scrollHeight + firstBlock.offsetHeight <=
          metrics.printableHeightPx + 2
      ) {
        const currentBlocks = splitTopLevelHtml(pageHtmlList[index]);
        currentBlocks.push(nextBlocks.shift());
        pageHtmlList[index] = joinTopLevelHtml(currentBlocks);
        pageHtmlList[index + 1] = joinTopLevelHtml(nextBlocks);
        didChange = true;
        break;
      }
    }

    if (didChange) {
      applyPages(pageHtmlList, rootNames);
    }
  }

  function applyPages(pageHtmlList, explicitRootNames) {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const nextPages = pageHtmlList.map((pageHtml) => normalizePageHtml(pageHtml));
    const nextRootNames =
      explicitRootNames ??
      nextPages.map((_, index) => createPageRootName(index));
    const currentRootNames = [...pageRootsRef.current];

    isApplyingDataRef.current = true;

    try {
      if (currentRootNames.length < nextRootNames.length) {
        for (
          let index = currentRootNames.length;
          index < nextRootNames.length;
          index += 1
        ) {
          editor.addRoot(nextRootNames[index], { data: EMPTY_PAGE_HTML });
        }
      } else if (currentRootNames.length > nextRootNames.length) {
        for (
          let index = currentRootNames.length - 1;
          index >= nextRootNames.length;
          index -= 1
        ) {
          editor.detachRoot(currentRootNames[index]);
        }
      }

      editor.data.set(
        Object.fromEntries(
          nextRootNames.map((rootName, index) => [rootName, nextPages[index]]),
        ),
      );

      pageRootsRef.current = nextRootNames;
      setPageRoots(nextRootNames);

      const nextValue = serializePagesToHtml(nextPages);
      lastCommittedValueRef.current = nextValue;
      onChange(nextValue);
    } finally {
      isApplyingDataRef.current = false;
      scheduleRebalance();
    }
  }

  return (
    <section className="editor-bootstrap">
      <EditorToolbar />
      <PageSettingsBar
        pageSettings={pageSettings}
        onChange={onPageSettingsChange}
      />
      {!isReady ? (
        <div className="editor-shell__status">Loading editor surface...</div>
      ) : null}
      {error ? <div className="editor-shell__error">{error}</div> : null}
      <div className="ck-toolbar-host" ref={toolbarHostRef} />
      <PagedWorkspace
        pageRoots={pageRoots}
        pageSettings={pageSettings}
        renderPageActions={(rootName, index) => (
          <div className="paged-workspace__actions">
            {pageRoots.length > 1 ? (
              <button
                type="button"
                className="paged-workspace__page-action paged-workspace__page-action--danger"
                onClick={() => {
                  handleDeletePage(rootName);
                }}
              >
                Delete page
              </button>
            ) : null}
            {index === pageRoots.length - 1 ? (
              <button
                type="button"
                className="paged-workspace__page-action"
                onClick={handleAddPage}
              >
                Add page
              </button>
            ) : null}
          </div>
        )}
        renderPageContent={(rootName) => (
          <div
            className="paged-workspace__editable-host"
            ref={(node) => {
              if (node) {
                pageHostRefs.current.set(rootName, node);
              } else {
                pageHostRefs.current.delete(rootName);
              }
            }}
          />
        )}
      />
    </section>
  );
}

function getSerializedValue(editor, rootNames) {
  const rootData = editor.getFullData({ trim: "none" });

  return serializePagesToHtml(
    rootNames.map((rootName) => rootData[rootName] ?? EMPTY_PAGE_HTML),
  );
}
