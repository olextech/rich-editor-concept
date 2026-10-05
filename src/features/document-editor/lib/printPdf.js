/** Print the backend PDF through the browser's native PDF viewer. */
export function printPdf(blob) {
  if (navigator.pdfViewerEnabled === false) {
    return Promise.reject(
      new Error(
        "This browser cannot print PDFs. Use PDF to download the document.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.title = "PDF for printing";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    // Keep the native viewer laid out. display:none can prevent it from loading.
    Object.assign(frame.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "1px",
      height: "1px",
      border: "0",
    });

    let loadTimeout;
    let cleanupTimeout;
    let printWindow;
    const cleanup = () => {
      clearTimeout(loadTimeout);
      clearTimeout(cleanupTimeout);
      printWindow?.removeEventListener("afterprint", cleanup);
      frame.remove();
      URL.revokeObjectURL(url);
    };
    const fail = (message) => {
      cleanup();
      reject(new Error(message));
    };
    frame.onerror = () =>
      fail("The PDF could not load. Try again or use PDF to download it.");
    frame.onload = () => {
      clearTimeout(loadTimeout);
      try {
        printWindow = frame.contentWindow;
        if (!printWindow) throw new Error("PDF viewer is unavailable.");
        printWindow.addEventListener("afterprint", cleanup);
        // Some native PDF viewers do not send afterprint to the iframe window.
        // Keep the Blob alive while the dialog is open, with a cleanup fallback.
        cleanupTimeout = setTimeout(cleanup, 5 * 60 * 1000);
        printWindow.focus();
        printWindow.print();
        resolve();
      } catch {
        fail(
          "The print dialog could not open. Use PDF to download the document.",
        );
      }
    };
    loadTimeout = setTimeout(
      () =>
        fail(
          "The PDF took too long to load. Try again or use PDF to download it.",
        ),
      30000,
    );
    frame.src = url;
    document.body.append(frame);
  });
}
