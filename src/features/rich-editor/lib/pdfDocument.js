function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintOverrides(pageSettings) {
  return `
    @page {
      size: ${pageSettings.pageSize} ${pageSettings.orientation};
      margin:
        ${pageSettings.margins.top}mm
        ${pageSettings.margins.right}mm
        ${pageSettings.margins.bottom}mm
        ${pageSettings.margins.left}mm;
    }

    :root {
      color-scheme: light;
      background: white;
      color: #1d2736;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: white !important;
      color: #1d2736 !important;
    }

    body {
      min-width: 0;
    }

    .pdf-export-root {
      width: 100%;
      margin: 0;
      padding: 0;
      background: white;
    }

    .pdf-export-document {
      margin: 0;
      padding: 0;
      color: #1d2736;
      background: white;
    }

    .pdf-export-document.ck-content {
      min-height: auto !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      background: white !important;
      color: #1d2736 !important;
    }

    .pdf-export-document .page-break-marker,
    .pdf-export-document [data-page-break="true"] {
      display: block;
      width: 100%;
      height: 0;
      margin: 0;
      border: none !important;
      break-before: page;
      page-break-before: always;
    }

    .pdf-export-document .page-break-marker::before,
    .pdf-export-document [data-page-break="true"]::before {
      display: none !important;
      content: "";
    }

    .pdf-export-document table {
      break-inside: auto;
      page-break-inside: auto;
    }

    .pdf-export-document thead {
      display: table-header-group;
    }

    .pdf-export-document tr,
    .pdf-export-document img {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .pdf-export-document img {
      max-width: 100%;
      height: auto;
    }
  `;
}

function cloneHeadStyles(targetDocument) {
  const headNodes = document.head.querySelectorAll('style, link[rel="stylesheet"]');

  headNodes.forEach((node) => {
    targetDocument.head.appendChild(node.cloneNode(true));
  });
}

function buildPrintDocument({ html, title }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <main class="pdf-export-root">
      <article class="pdf-export-document ck-content">${html}</article>
    </main>
  </body>
</html>`;
}

export function openPdfPrintWindow({ html, pageSettings, title }) {
  const iframe = document.createElement("iframe");
  let didTriggerPrint = false;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 1000);
  };

  iframe.onload = () => {
    if (didTriggerPrint) {
      return;
    }

    const printWindow = iframe.contentWindow;
    const printDocument = iframe.contentDocument;

    if (!printWindow || !printDocument) {
      cleanup();
      return;
    }

    if (!printDocument.body || !printDocument.body.querySelector(".pdf-export-root")) {
      return;
    }

    didTriggerPrint = true;

    cloneHeadStyles(printDocument);

    const overrideStyle = printDocument.createElement("style");
    overrideStyle.textContent = buildPrintOverrides(pageSettings);
    printDocument.head.appendChild(overrideStyle);

    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 150);

    if ("onafterprint" in printWindow) {
      printWindow.onafterprint = cleanup;
    } else {
      cleanup();
    }
  };

  document.body.appendChild(iframe);

  const printDocument = iframe.contentDocument;

  if (!printDocument) {
    cleanup();
    return;
  }

  printDocument.open();
  printDocument.write(
    buildPrintDocument({
      html,
      title,
    }),
  );
  printDocument.close();
}
