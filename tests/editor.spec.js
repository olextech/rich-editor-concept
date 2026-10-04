import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const runtimeErrors = new WeakMap();
const tableVariableData = JSON.parse(
  await readFile(
    new URL("../shared/table-variables.json", import.meta.url),
    "utf8",
  ),
);
const sampleVariableValues = JSON.parse(
  await readFile(
    new URL("../shared/variable-values.json", import.meta.url),
    "utf8",
  ),
);

async function source(page, html) {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("textbox", { name: "Document HTML" }).fill(html);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}
async function getHtml(page) {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const html = await page
    .getByRole("textbox", { name: "Document HTML" })
    .inputValue();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  return html;
}
async function choose(page, label, value) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
async function settled(page) {
  await expect(
    page.getByRole("button", { name: "Save template" }),
  ).toBeEnabled();
  await page.waitForTimeout(250);
}

async function setCaret(page, paragraph, offset) {
  await page
    .locator(".ck-content > p")
    .nth(paragraph)
    .evaluate((p, offset) => {
      p.closest(".ck-content").focus();
      const text = p.firstChild;
      const range = document.createRange();
      range.setStart(text, offset === "end" ? text.length : offset);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }, offset);
  await page.waitForTimeout(50);
}

async function caretParagraph(page) {
  return page.evaluate(() => {
    const node = window.getSelection().anchorNode;
    return (node?.nodeType === 1 ? node : node?.parentElement)?.closest("p")
      ?.textContent;
  });
}

async function pageBoundary(page) {
  return page.evaluate(() => {
    const nextPageTop = document
      .querySelectorAll(".page-sheet")[1]
      .getBoundingClientRect().top;
    const paragraphs = Array.from(document.querySelectorAll(".ck-content > p"));
    const after = paragraphs.findIndex(
      (p) => p.getBoundingClientRect().top >= nextPageTop,
    );
    return {
      before: after - 1,
      after,
      beforeText: paragraphs[after - 1].textContent,
      afterText: paragraphs[after].textContent,
    };
  });
}

async function flowingDocument(page) {
  await source(
    page,
    Array.from(
      { length: 50 },
      (_, i) => `<p>Line ${String(i).padStart(2, "0")} has document text.</p>`,
    ).join(""),
  );
  await choose(page, "Size", "A5");
  await settled(page);
  await expect(page.locator(".page-frame")).toHaveCount(3);
  await expect(
    page.locator(".document-editable-host > [contenteditable=true]"),
  ).toHaveCount(1);
  return pageBoundary(page);
}

test.beforeEach(async ({ page, request }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = await (await request.get("/api/templates")).json();
  for (const template of saved)
    await request.delete(`/api/templates/${template.id}`);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Source", exact: true }),
  ).toBeVisible();
  await settled(page);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test("switching templates restores the right document and draft", async ({
  page,
}) => {
  await source(page, "<p>Invoice draft unique</p>");
  await choose(page, "Template", "Estimate");
  await expect(page.locator(".ck-content")).toContainText("Project estimate");
  await choose(page, "Template", "Invoice");
  await expect(page.locator(".ck-content")).toContainText(
    "Invoice draft unique",
  );
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator(".ck-content")).toContainText(
    "Invoice draft unique",
  );
});

test("manual blank pages and image-only pages survive source round trips and undo", async ({
  page,
}) => {
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1kAAAAASUVORK5CYII=";
  await source(
    page,
    `<p>First</p><div data-page-break="true"></div><figure class="image"><img src="${image}"></figure><div data-page-break="true"></div><p></p>`,
  );
  await expect(page.locator(".page-frame")).toHaveCount(3);
  expect(await getHtml(page)).toContain(image);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page.locator(".page-frame")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".page-frame")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".page-frame")).toHaveCount(4);
});

test("invalid source is blocked and formatting preserves spaces and entities", async ({
  page,
}) => {
  await source(page, "<p>Before<script>alert(1)</script></p>");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported HTML element",
  );
  await page
    .getByRole("textbox", { name: "Document HTML" })
    .fill(
      "<p>First <strong>bold</strong> <em>second</em> &lt;tag&gt; &amp; last</p>",
    );
  await page.getByRole("button", { name: "Format", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".ck-content")).toHaveText(
    "First bold second <tag> & last",
  );
});

test("automatic pagination reflows without creating manual breaks or losing content", async ({
  page,
}) => {
  const html = Array.from(
    { length: 35 },
    (_, i) => `<p>Block ${i} ${"Words for pagination. ".repeat(9)}</p>`,
  ).join("");
  await source(page, html);
  await choose(page, "Size", "A5");
  await settled(page);
  const smaller = await page.locator(".page-frame").count();
  expect(smaller).toBeGreaterThan(1);
  expect(await getHtml(page)).not.toContain("data-page-break");
  await choose(page, "Size", "A4");
  await settled(page);
  await expect
    .poll(() => page.locator(".page-frame").count())
    .toBeLessThan(smaller);
  const text = (await page.locator(".ck-content").allTextContents()).join("");
  for (let i = 0; i < 35; i++) expect(text).toContain(`Block ${i} `);
  const dimensions = await page
    .locator(".page-sheet")
    .first()
    .evaluate((e) => ({
      width: e.getBoundingClientRect().width,
      height: e.getBoundingClientRect().height,
    }));
  expect(dimensions.width).toBeCloseTo((210 * 96) / 25.4, 0);
  expect(dimensions.height).toBeCloseTo((297 * 96) / 25.4, 0);
});

test("margins cannot exceed page bounds", async ({ page }) => {
  await choose(page, "Size", "A5");
  await page.getByRole("button", { name: "Margins", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Left", exact: true }).fill("100");
  await page
    .getByRole("spinbutton", { name: "Right", exact: true })
    .fill("100");
  await expect(page.getByRole("alert")).toContainText(
    "Margins must leave room",
  );
  expect(
    await page
      .getByRole("spinbutton", { name: "Right", exact: true })
      .inputValue(),
  ).toBe("20");
});

test("save, reload, current draft PDF export, and delete work through backend", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "New template" }).click();
  await settled(page);
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Browser test");
  await source(page, "<h1>Saved content</h1>");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  let templates = await (await request.get("/api/templates")).json();
  expect(templates).toHaveLength(1);
  const saved = await (
    await request.get(`/api/templates/${templates[0].id}`)
  ).json();
  expect(saved.html).toContain("Saved content");
  await page.reload();
  await expect(page.locator(".ck-content")).toContainText("Saved content");
  await source(
    page,
    '<h1>Unsaved export</h1><div data-page-break="true"></div><p>Second page</p>',
  );
  await expect(page.locator(".page-frame")).toHaveCount(2);
  const [response, download] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(download.suggestedFilename()).toBe("Browser test.pdf");
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  const unchanged = await (
    await request.get(`/api/templates/${templates[0].id}`)
  ).json();
  expect(unchanged.html).toContain("Saved content");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete template" }).click();
  await expect
    .poll(
      async () => (await (await request.get("/api/templates")).json()).length,
    )
    .toBe(0);
});

test("Company, Client and Invoice variables resolve in print and PDF while templates retain placeholders", async ({
  page,
  request,
}) => {
  const rows = Object.keys(sampleVariableValues)
    .filter(
      (token) =>
        ![
          "{Company Name}",
          "{Client Name}",
          "{Invoice Number}",
          "{Issue Date}",
          "{Due Date}",
        ].includes(token),
    )
    .map((token) => `<tr><td>${token}</td></tr>`)
    .join("");
  await source(
    page,
    `<h1>Variable fixture</h1><p>Company: </p><p>Client: </p><p>Formatted: {Company <strong>Name}</strong> / {Client <em>Email}</em></p><p>Invoice: </p><p>Issued: </p><p>Due: </p><table><tbody>${rows}</tbody></table><div data-page-break="true"></div><p>Repeated: {Company Name} / {Client Name}</p><p>Reference: {Invoice Number}</p><p>{Legal Entity Name} {Unknown}</p>`,
  );
  const panel = page.getByRole("complementary", { name: "Template variables" });
  await setCaret(page, 0, "end");
  await panel
    .getByRole("button", { name: "{Company Name}", exact: true })
    .click();
  await expect(page.locator(".ck-content > p").first()).toHaveText(
    /Company:\s*\{Company Name\}/,
  );
  await panel.getByRole("button", { name: "Client", exact: true }).click();
  await setCaret(page, 1, "end");
  await panel
    .getByRole("button", { name: "{Client Name}", exact: true })
    .click();
  await expect(page.locator(".ck-content > p").nth(1)).toHaveText(
    /Client:\s*\{Client Name\}/,
  );
  await panel.getByRole("button", { name: "Invoice", exact: true }).click();
  for (const [index, token] of [
    "{Invoice Number}",
    "{Issue Date}",
    "{Due Date}",
  ].entries()) {
    await setCaret(page, index + 3, "end");
    await panel.getByRole("button", { name: token, exact: true }).click();
    await expect(page.locator(".ck-content > p").nth(index + 3)).toContainText(
      token,
    );
  }
  await settled(page);
  const original = await getHtml(page);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  const records = await (await request.get("/api/templates")).json();
  const saved = await (
    await request.get(`/api/templates/${records[0].id}`)
  ).json();
  for (const token of Object.keys(sampleVariableValues))
    expect(saved.html).toContain(token);

  const [response, download] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(response.status()).toBe(200);
  const { execFileSync } = await import("node:child_process");
  const inspect = (bytes) =>
    JSON.parse(
      execFileSync("backend/.venv/bin/python", ["tests/pdf_pages.py"], {
        input: bytes,
      }).toString(),
    );
  const exported = inspect(await readFile(await download.path()));
  await page.emulateMedia({ media: "print" });
  const printed = inspect(
    await page.pdf({ preferCSSPageSize: true, printBackground: true }),
  );
  for (const pages of [exported, printed]) {
    expect(pages).toHaveLength(2);
    const text = pages.join(" ").replace(/\s+/g, " ");
    for (const [token, value] of Object.entries(sampleVariableValues)) {
      expect(text).toContain(value);
      expect(text).not.toContain(token);
    }
    expect(text).toContain(
      "Formatted: Northwind Studio / accounts@aurora.example",
    );
    expect(text).toMatch(/Invoice:\s*INV-2026-0042/);
    expect(text).toMatch(/Issued:\s*2026-05-16/);
    expect(text).toMatch(/Due:\s*2026-05-30/);
    expect(pages[1]).toContain("Reference: INV-2026-0042");
    expect(pages[1]).toContain(
      "Repeated: Northwind Studio / Aurora Logistics LLC",
    );
    expect(text).toContain("{Legal Entity Name} {Unknown}");
  }
  await page.emulateMedia({ media: "screen" });
  expect(await getHtml(page)).toBe(original);
  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
});

test("browser variable rendering preserves text safety and placeholder boundaries", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { renderVariables } =
      await import("/src/features/document-editor/lib/renderVariables.js");
    const html =
      '<p><strong>{Company </strong><em>Name}</em> / {Company Name}</p><p><a href="https://example.com/{Company Name}" title="{Client Note}">{Client Name}</a> {Unknown}</p><p>{Company <br>Name}</p><table><tbody><tr><td>{Client </td><td>Name}</td></tr></tbody></table>';
    const value = '<script>alert("x")</script> & Studio';
    const output = renderVariables(html, {
      "{Company Name}": value,
      "{Client Name}": "{Company Name}",
      "{Client Note}": "Changed",
    });
    const template = document.createElement("template");
    template.innerHTML = output;
    const link = template.content.querySelector("a");
    return {
      text: template.content.textContent,
      strong: template.content.querySelector("strong").textContent,
      scripts: template.content.querySelectorAll("script").length,
      href: link.getAttribute("href"),
      title: link.title,
      link: link.textContent,
      brokenLine: template.content.querySelectorAll("p")[2].textContent,
      cells: Array.from(
        template.content.querySelectorAll("td"),
        (cell) => cell.textContent,
      ),
    };
  });
  expect(result.scripts).toBe(0);
  expect(result.strong).toBe('<script>alert("x")</script> & Studio');
  expect(result.text).toContain(
    '<script>alert("x")</script> & Studio / <script>alert("x")</script> & Studio',
  );
  expect(result.href).toBe("https://example.com/{Company Name}");
  expect(result.title).toBe("{Client Note}");
  expect(result.link).toBe("{Company Name}");
  expect(result.brokenLine).toBe("{Company Name}");
  expect(result.cells).toEqual(["{Client ", "Name}"]);
  expect(result.text).toContain("{Unknown}");
  expect(result.text).toContain("{Company Name}");
  expect(result.text).toContain("{Client Name}");
});

test("table body and footer panel variables expand only in print and PDF", async ({
  page,
  request,
}) => {
  await source(
    page,
    '<h1>Item variable fixture</h1><figure class="table"><table><colgroup><col style="width:55%;"><col style="width:10%;"><col style="width:17.5%;"><col style="width:17.5%;"></colgroup><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td colspan="3">Subtotal</td><td></td></tr><tr><td colspan="3">VAT </td><td></td></tr><tr><td colspan="3">Total due</td><td></td></tr></tbody></table></figure>',
  );
  const panel = page.getByRole("complementary", { name: "Template variables" });
  await panel.getByRole("button", { name: "Table body", exact: true }).click();
  const bodyRows = page.locator(".ck-content tbody > tr");
  for (const [index, token] of tableVariableData.bodyVariables.entries()) {
    const cell = bodyRows.first().locator("td").nth(index);
    await cell.click();
    await page.waitForTimeout(50);
    await panel.getByRole("button", { name: token, exact: true }).click();
    await expect(cell).toContainText(token);
  }
  await panel
    .getByRole("button", { name: "Table footer", exact: true })
    .click();
  for (const [token, row, column] of [
    ["{Subtotal}", 1, 1],
    ["{Tax Rate}", 2, 0],
    ["{Tax Amount}", 2, 1],
    ["{Total}", 3, 1],
  ]) {
    const cell = bodyRows.nth(row).locator("td").nth(column);
    await cell.click();
    await page.keyboard.press("End");
    await page.waitForTimeout(50);
    await panel.getByRole("button", { name: token, exact: true }).click();
    await expect(cell).toContainText(token);
  }
  await settled(page);
  await expect(bodyRows).toHaveCount(4);
  const original = await getHtml(page);
  const output = page.locator(".browser-print-document");
  const printedRows = output.locator("tbody > tr");
  await expect(printedRows).toHaveCount(tableVariableData.rows.length + 3);
  for (const [index, item] of tableVariableData.rows.entries()) {
    expect(
      await printedRows.nth(index).locator("td").allTextContents(),
    ).toEqual(Object.values(item));
  }
  await expect(output.locator("thead > tr")).toHaveCount(1);
  await expect(output.locator("col").first()).toHaveAttribute(
    "style",
    /width:\s*55%/,
  );
  await expect(printedRows.first().locator("td").last()).toHaveAttribute(
    "style",
    /text-align:\s*right/,
  );
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  const records = await (await request.get("/api/templates")).json();
  const saved = await (
    await request.get(`/api/templates/${records[0].id}`)
  ).json();
  for (const token of [
    ...tableVariableData.bodyVariables,
    ...Object.keys(tableVariableData.footerValues),
  ])
    expect(saved.html).toContain(token);
  const [response, download] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(response.status()).toBe(200);
  const { execFileSync } = await import("node:child_process");
  const inspect = (bytes) =>
    JSON.parse(
      execFileSync("backend/.venv/bin/python", ["tests/pdf_pages.py"], {
        input: bytes,
      }).toString(),
    )
      .join(" ")
      .replace(/\s+/g, " ");
  const exported = inspect(await readFile(await download.path()));
  await page.emulateMedia({ media: "print" });
  const printed = inspect(
    await page.pdf({ preferCSSPageSize: true, printBackground: true }),
  );
  for (const text of [exported, printed]) {
    for (const item of tableVariableData.rows)
      expect(text.split(item["{Item Description}"])).toHaveLength(2);
    for (const value of Object.values(tableVariableData.footerValues))
      expect(text).toContain(value);
    expect(text.split("Subtotal")).toHaveLength(2);
    expect(text.split("Total due")).toHaveLength(2);
    expect(text).not.toContain("{Item");
    expect(text).not.toContain("{Subtotal}");
  }
  await page.emulateMedia({ media: "screen" });
  expect(await getHtml(page)).toBe(original);
  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
  await expect(page.locator(".ck-content tbody > tr")).toHaveCount(4);
});

test("table row rendering preserves merged groups, headers, empty lists and text safety", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { renderVariables } =
      await import("/src/features/document-editor/lib/renderVariables.js");
    const html =
      '<table><thead><tr><th>{Item Description}</th><th>Amount</th></tr></thead><tbody><tr><td rowspan="2"><strong>{Item <em>Description}</em></strong></td><td>{Item Rate}</td></tr><tr><td>{Item Amount}</td></tr><tr><td colspan="2">{Total}</td></tr></tbody></table>';
    const items = [
      {
        "{Item Description}": "<script>x</script> & {Company Name}",
        "{Item Rate}": "$1.00",
        "{Item Amount}": "$2.00",
      },
      {
        "{Item Description}": "Second",
        "{Item Rate}": "$3.00",
        "{Item Amount}": "$4.00",
      },
    ];
    const template = document.createElement("template");
    template.innerHTML = renderVariables(
      html,
      { "{Total}": "$6.00", "{Company Name}": "Company" },
      items,
    );
    const rows = Array.from(template.content.querySelectorAll("tbody > tr"));
    const empty = document.createElement("template");
    empty.innerHTML = renderVariables(html, { "{Total}": "$0.00" }, []);
    const boundary = document.createElement("template");
    boundary.innerHTML = renderVariables(
      '<table><tbody><tr><td><a href="https://example.com/{Item Description}">Link</a></td></tr><tr><td>{Item </td><td>Description}</td></tr><tr><td>{Item Unknown}</td></tr></tbody></table>',
      {},
      items,
    );
    const footerFirst = document.createElement("template");
    footerFirst.innerHTML = renderVariables(
      "<table><tfoot><tr><td>Total</td></tr></tfoot><tbody><tr><td>Static item</td></tr></tbody></table>",
    );
    return {
      rows: rows.map((row) =>
        Array.from(row.cells, (cell) => cell.textContent),
      ),
      spans: rows
        .filter((_, i) => i === 0 || i === 2)
        .map((row) => row.cells[0].rowSpan),
      strong: template.content.querySelector("strong").textContent,
      header: template.content.querySelector("th").textContent,
      scripts: template.content.querySelectorAll("script").length,
      empty: Array.from(
        empty.content.querySelectorAll("tbody > tr"),
        (row) => row.textContent,
      ),
      emptyHeader: empty.content.querySelectorAll("thead > tr").length,
      boundaryRows: boundary.content.querySelectorAll("tbody > tr").length,
      href: boundary.content.querySelector("a").getAttribute("href"),
      footerOrder: Array.from(
        footerFirst.content.querySelector("table").children,
        (child) => child.localName,
      ),
    };
  });
  expect(result.rows).toEqual([
    ["<script>x</script> & {Company Name}", "$1.00"],
    ["$2.00"],
    ["Second", "$3.00"],
    ["$4.00"],
    ["$6.00"],
  ]);
  expect(result.spans).toEqual([2, 2]);
  expect(result.strong).toBe("<script>x</script> & {Company Name}");
  expect(result.header).toBe("{Item Description}");
  expect(result.scripts).toBe(0);
  expect(result.empty).toEqual(["$0.00"]);
  expect(result.emptyHeader).toBe(1);
  expect(result.boundaryRows).toBe(3);
  expect(result.href).toBe("https://example.com/{Item Description}");
  expect(result.footerOrder).toEqual(["tbody", "tfoot"]);
});

for (const count of [13, 20, 30, 50, 125]) {
  test(`expanded ${count}-item tables use remaining page space in browser print and server PDF`, async ({
    page,
  }) => {
    const rendered = await page.evaluate(
      async ({ values, sample, count }) => {
        const { renderVariables } =
          await import("/src/features/document-editor/lib/renderVariables.js");
        const rows = Array.from({ length: count }, (_, i) => ({
          ...sample[i % sample.length],
          "{Item Description}": `Line${String(i).padStart(3, "0")}`,
          "{Item Amount}": `End${String(i).padStart(3, "0")}`,
        }));
        const intro = `<h1>Invoice introduction</h1><p>${Array(10).fill("Company details").join("<br>")}</p><p>${Array(6).fill("Client details").join("<br>")}</p>`;
        return renderVariables(
          intro +
            '<figure class="table"><table class="ck-table-resized"><colgroup><col style="width:55%;"><col style="width:10%;"><col style="width:17.5%;"><col style="width:17.5%;"></colgroup><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tfoot><tr><td colspan="3">Subtotal</td><td>{Subtotal}</td></tr><tr><td colspan="3">VAT ({Tax Rate})</td><td>{Tax Amount}</td></tr><tr><td colspan="3">Total due</td><td>{Total}</td></tr></tfoot><tbody><tr><td><strong>{Item Description}</strong><br>Continued description</td><td>{Item Qty}</td><td>{Item Rate}</td><td>{Item Amount}</td></tr></tbody></table></figure>',
          values,
          rows,
        );
      },
      {
        values: tableVariableData.footerValues,
        sample: tableVariableData.rows,
        count,
      },
    );
    await page.locator(".browser-print-document").evaluate((element, html) => {
      element.innerHTML = html;
    }, rendered);
    await page.emulateMedia({ media: "print" });
    const printed = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
    const response = await page.request.post("/api/pdf/render", {
      data: {
        name: "Expanded table",
        html: rendered,
        pageSettings: {
          pageSize: "A4",
          orientation: "portrait",
          margins: { top: 20, right: 20, bottom: 20, left: 20 },
        },
      },
    });
    expect(response.status()).toBe(200);
    const { execFileSync } = await import("node:child_process");
    const inspect = (bytes) =>
      JSON.parse(
        execFileSync("backend/.venv/bin/python", ["tests/pdf_pages.py"], {
          input: bytes,
        }).toString(),
      );
    const exported = inspect(await response.body());
    const browser = inspect(printed);
    expect(exported.length).toBeGreaterThan(1);
    expect(browser.map((text) => text.match(/Line\d+/g) ?? [])).toEqual(
      exported.map((text) => text.match(/Line\d+/g) ?? []),
    );
    for (const pages of [browser, exported]) {
      expect(pages[0]).toContain("Invoice introduction");
      expect(pages[0]).toContain("Line000");
      const text = pages.join(" ");
      for (let i = 0; i < count; i++) {
        const marker = String(i).padStart(3, "0");
        expect(text.split(`Line${marker}`)).toHaveLength(2);
        expect(text.split(`End${marker}`)).toHaveLength(2);
        expect(pages.findIndex((p) => p.includes(`Line${marker}`))).toBe(
          pages.findIndex((p) => p.includes(`End${marker}`)),
        );
      }
      for (const p of pages.filter((p) => /Line\d+/.test(p))) {
        for (const header of ["Description", "Qty", "Rate", "Amount"])
          expect(p.split(header)).toHaveLength(2);
      }
      expect(text.split("Subtotal")).toHaveLength(2);
      expect(text.split("VAT (20%)")).toHaveLength(2);
      expect(text.split("Total due")).toHaveLength(2);
      expect(
        text.indexOf(`End${String(count - 1).padStart(3, "0")}`),
      ).toBeLessThan(text.indexOf("Subtotal"));
      expect(pages.findIndex((p) => p.includes("Subtotal"))).toBe(
        pages.findIndex((p) => p.includes("Total due")),
      );
    }
  });
}

test("resized tables preserve column widths through save, reload and PDF export", async ({
  page,
  request,
}) => {
  // CKEditor adds ck-table-resized when importing or resizing table columns.
  await source(
    page,
    '<figure class="table"><table><colgroup><col style="width:30%;"><col style="width:70%;"></colgroup><tbody><tr><td>Narrow column</td><td>Wide column</td></tr></tbody></table></figure>',
  );
  await settled(page);
  const html = await getHtml(page);
  expect(html).toContain('class="ck-table-resized"');
  expect(html).toContain("width:30%");
  expect(html).toContain("width:70%");

  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  const templates = await (await request.get("/api/templates")).json();
  expect(templates).toHaveLength(1);
  const saved = await (
    await request.get(`/api/templates/${templates[0].id}`)
  ).json();
  expect(saved.html).toContain('class="ck-table-resized"');
  expect(saved.html).toContain("width:30%");
  expect(saved.html).toContain("width:70%");

  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toContain('class="ck-table-resized"');
  await expect(page.locator(".ck-content table")).toContainText("Wide column");
  const [response, download] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
});

test("table row heights match in the editor, browser print and PDF", async ({
  page,
  request,
}) => {
  await source(
    page,
    '<figure class="table"><table><colgroup><col style="width:55%;"><col style="width:45%;"></colgroup><thead><tr><th>Description</th><th>Value</th></tr></thead><tbody><tr><td>Single line</td><td>42</td></tr><tr><td>First line<br>Second line</td><td>84</td></tr><tr><td><p>First paragraph</p><p>Second paragraph</p></td><td>126</td></tr><tr><td>' +
      "Wrapped words with predictable spacing. ".repeat(8) +
      '</td><td>168</td></tr><tr><td><p style="text-align:right;"><span style="font-size:24px;">Large text</span></p></td><td>210</td></tr><tr><td></td><td></td></tr><tr><td style="padding:14px;">Custom padding</td><td>252</td></tr><tr><td><strong>Total due</strong></td><td><strong>882.00</strong></td></tr></tbody></table></figure>',
  );
  await settled(page);
  const measure = (selector) =>
    page
      .locator(selector)
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().height),
      );
  const editor = await measure(".ck-content tr:not(.automatic-page-gap)");
  expect(editor).toHaveLength(9);
  const response = await request.post("/api/pdf/render", {
    data: {
      name: "Table row spacing",
      html: await getHtml(page),
      pageSettings: {
        pageSize: "A4",
        orientation: "portrait",
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
      },
    },
  });
  expect(response.status()).toBe(200);
  await page.emulateMedia({ media: "print" });
  const printed = await measure(".browser-print-document tr");
  expect(printed).toHaveLength(editor.length);
  printed.forEach((height, i) =>
    expect(Math.abs(height - editor[i])).toBeLessThan(0.1),
  );
  const { execFileSync } = await import("node:child_process");
  const inspect = (bytes) =>
    JSON.parse(
      execFileSync("backend/.venv/bin/python", ["tests/pdf_table_rows.py"], {
        input: bytes,
      }).toString(),
    );
  for (const bytes of [
    await response.body(),
    await page.pdf({ preferCSSPageSize: true, printBackground: true }),
  ]) {
    const heights = inspect(bytes);
    expect(heights).toHaveLength(editor.length);
    // Chromium snaps PDF borders to pixels; allow that rounding only.
    heights.forEach((height, i) =>
      expect(Math.abs(height - editor[i])).toBeLessThan(1.2),
    );
  }
});

test("oversized paragraphs and tables flow without clipping and preserve all content", async ({
  page,
}) => {
  const words = "long text sample ".repeat(700);
  await source(page, `<p>${words}</p>`);
  await settled(page);
  await expect
    .poll(() => page.locator(".page-frame").count())
    .toBeGreaterThan(1);
  expect(
    (await page.locator(".ck-content").allTextContents())
      .join("")
      .replace(/\u00a0/g, " "),
  ).toBe(words.trimEnd());
  expect((await getHtml(page)).match(/<p>/g)).toHaveLength(1);
  const rows = Array.from(
    { length: 60 },
    (_, i) => `<tr><td>Row ${i}</td><td>Value ${i}</td></tr>`,
  ).join("");
  await source(page, `<table><tbody>${rows}</tbody></table>`);
  await settled(page);
  await expect
    .poll(() => page.locator(".page-frame").count())
    .toBeGreaterThan(1);
  expect(
    await page.locator(".ck-content tr:not(.automatic-page-gap)").count(),
  ).toBe(60);
  const independentlyScrollable = await page
    .locator(".ck-content")
    .evaluateAll(
      (elements) =>
        elements.filter((e) => /auto|scroll/.test(getComputedStyle(e).overflow))
          .length,
    );
  expect(independentlyScrollable).toBe(0);
  expect((await getHtml(page)).match(/<table/g)).toHaveLength(1);
});

test("visual page breaks, page deletion and undo preserve document content", async ({
  page,
}) => {
  await source(page, "<p>Alpha Beta</p>");
  await setCaret(page, 0, 6);
  await expect(
    page.getByRole("button", { name: "Page break", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("button", { name: "Page break", exact: true }).click();
  await expect(page.locator(".page-frame")).toHaveCount(2);
  await expect(page.locator(".ck-content > p").first()).toHaveText(
    /^Alpha\s*$/,
  );
  await expect(page.locator(".ck-content > p").last()).toHaveText("Beta");
  await expect(
    page.getByRole("button", { name: "Page break", exact: true }),
  ).toBeHidden();
  // The document has one editable; move into the paragraph after the break.
  await page.locator(".ck-content > p").last().click();
  await page.keyboard.type("Next page");
  expect(await getHtml(page)).toContain('data-page-break="true"');
  await page.getByRole("button", { name: "Page actions" }).last().click();
  await page.getByRole("menuitem", { name: "Delete page" }).click();
  await expect(page.locator(".page-frame")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".page-frame")).toHaveCount(2);
  await expect(page.locator(".ck-content").last()).toContainText("Next page");
});

test("PDF and browser print keep the same blocks on the same pages as the preview", async ({
  page,
  request,
}) => {
  const paragraphs = Array.from(
    { length: 28 },
    (_, i) =>
      `<p>Marker${i} ${"Layout text with predictable font metrics. ".repeat(7)}</p>`,
  ).join("");
  await source(page, `<h1>Layout fixture</h1>${paragraphs}`);
  await choose(page, "Size", "A5");
  await settled(page);
  const expected = await page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll(".page-sheet"));
    const paragraphs = Array.from(document.querySelectorAll(".ck-content > p"));
    return sheets.map((sheet) => {
      const bounds = sheet.getBoundingClientRect();
      return paragraphs
        .filter((p) => {
          const top = p.getBoundingClientRect().top;
          return top >= bounds.top && top < bounds.bottom;
        })
        .flatMap((p) => p.textContent.match(/Marker\d+/g) ?? []);
    });
  });
  const html = await getHtml(page);
  const response = await request.post("/api/pdf/render", {
    data: {
      name: "Layout fixture",
      html,
      pageSettings: {
        pageSize: "A5",
        orientation: "portrait",
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
      },
    },
  });
  expect(response.status()).toBe(200);
  const pdf = await response.body();
  const { execFileSync } = await import("node:child_process");
  const inspect = (bytes) =>
    JSON.parse(
      execFileSync("backend/.venv/bin/python", ["tests/pdf_pages.py"], {
        input: bytes,
        maxBuffer: 1000000,
      }).toString(),
    ).map((text) => text.match(/Marker\d+/g) ?? []);
  expect(inspect(pdf)).toEqual(expected);
  await page.emulateMedia({ media: "print" });
  const printed = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(inspect(printed)).toEqual(expected);
});

test("page size and orientation changes keep canonical oversized blocks intact", async ({
  page,
}) => {
  await source(
    page,
    `<p>${"Changing page dimensions without changing paragraphs. ".repeat(500)}</p>`,
  );
  await settled(page);
  const original = await getHtml(page);
  await choose(page, "Size", "A5");
  await choose(page, "Orientation", "Landscape");
  await settled(page);
  expect(await getHtml(page)).toBe(original);
  await choose(page, "Size", "A4");
  await choose(page, "Orientation", "Portrait");
  await settled(page);
  expect(await getHtml(page)).toBe(original);
});

test("intentional paragraph breaks inside paginated text remain separate and undoable", async ({
  page,
}) => {
  await source(
    page,
    `<p>${"Paragraph editing across pages. ".repeat(600)}</p>`,
  );
  await settled(page);
  await page.locator(".ck-content").first().click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await settled(page);
  expect((await getHtml(page)).match(/<p>/g)).toHaveLength(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect((await getHtml(page)).match(/<p>/g)).toHaveLength(1);
});

test("arrow keys and selection continue across automatic page boundaries", async ({
  page,
}) => {
  const boundary = await flowingDocument(page);
  const original = await getHtml(page);
  await setCaret(page, boundary.before, 5);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretParagraph(page)).toBe(boundary.afterText);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretParagraph(page)).toBe(boundary.beforeText);
  await setCaret(page, boundary.before, "end");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => caretParagraph(page)).toBe(boundary.afterText);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => caretParagraph(page)).toBe(boundary.beforeText);

  await setCaret(page, boundary.before, 5);
  await page.keyboard.press("Shift+ArrowDown");
  const selection = await page.evaluate(() => ({
    text: window.getSelection().toString(),
    start: window.getSelection().anchorNode.parentElement.closest("p")
      .textContent,
    end: window.getSelection().focusNode.parentElement.closest("p").textContent,
  }));
  expect(selection.start).toBe(boundary.beforeText);
  expect(selection.end).toBe(boundary.afterText);
  expect(selection.text).toContain("document text.");
  await page.keyboard.press("Backspace");
  await settled(page);
  expect((await getHtml(page)).match(/<p>/g)).toHaveLength(49);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
});

test("Backspace and Delete join paragraphs across pages and undo restores them", async ({
  page,
}) => {
  const boundary = await flowingDocument(page);
  const original = await getHtml(page);
  await setCaret(page, boundary.after, 0);
  await page.keyboard.press("Backspace");
  await settled(page);
  expect(await getHtml(page)).toContain(
    `<p>${boundary.beforeText}${boundary.afterText}</p>`,
  );
  const joined = page
    .locator(".ck-content > p")
    .filter({ hasText: `${boundary.beforeText}${boundary.afterText}` });
  const pageOne = await page.locator(".page-sheet").first().boundingBox();
  const joinedBounds = await joined.boundingBox();
  expect(joinedBounds.y + joinedBounds.height).toBeLessThan(
    pageOne.y + pageOne.height,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect(await getHtml(page)).toBe(original);

  await setCaret(page, boundary.before, "end");
  await page.keyboard.press("Delete");
  await settled(page);
  expect(await getHtml(page)).toContain(
    `<p>${boundary.beforeText}${boundary.afterText}</p>`,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
});

test("select all covers every page and replacing the document remains undoable", async ({
  page,
}) => {
  await flowingDocument(page);
  const original = await getHtml(page);
  await setCaret(page, 0, 0);
  await page.keyboard.press("ControlOrMeta+A");
  const selected = await page.evaluate(() => window.getSelection().toString());
  expect(selected).toContain("Line 00");
  expect(selected).toContain("Line 49");
  await page.keyboard.type("Replacement document");
  await settled(page);
  await expect(page.locator(".page-frame")).toHaveCount(1);
  expect(await getHtml(page)).toBe("<p>Replacement document</p>");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
});

test("manual page breaks allow navigation and Backspace removal in the shared document", async ({
  page,
}) => {
  await source(
    page,
    '<p>First page</p><div data-page-break="true"></div><p>Second page</p>',
  );
  await settled(page);
  await setCaret(page, 0, "end");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretParagraph(page)).toBe("Second page");
  await setCaret(page, 1, 0);
  await page.keyboard.press("Backspace");
  await settled(page);
  await expect(page.locator(".page-frame")).toHaveCount(1);
  expect(await getHtml(page)).not.toContain("data-page-break");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  await expect(page.locator(".page-frame")).toHaveCount(2);
});

test("a paragraph spanning pages keeps native editing and its text inside page margins", async ({
  page,
}) => {
  const text = "Continuous paragraph text across pages. ".repeat(500).trim();
  await source(page, `<p>${text}</p>`);
  await choose(page, "Size", "A5");
  await settled(page);
  const original = await getHtml(page);
  const geometry = await page.evaluate(() => {
    const editor = document.querySelector(".ck-content");
    const sheets = [...document.querySelectorAll(".page-sheet")].map((e) =>
      e.getBoundingClientRect(),
    );
    const margin = (20 * 96) / 25.4;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node;
    const outside = [];
    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (
          rect.width &&
          !sheets.some(
            (p) =>
              rect.top >= p.top + margin - 1 &&
              rect.bottom <= p.bottom - margin + 1 &&
              rect.left >= p.left + margin - 1 &&
              rect.right <= p.right - margin + 1,
          )
        )
          outside.push(rect.toJSON());
      }
    }
    return { outside };
  });
  expect(geometry.outside).toEqual([]);
  await page.locator(".ck-content").evaluate((e) => {
    e.focus();
    const gap = e.querySelector("span.automatic-page-gap");
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    walker.currentNode = gap;
    const node = walker.nextNode();
    const range = document.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForTimeout(50);
  await page.keyboard.press("Backspace");
  await settled(page);
  expect((await getHtml(page)).match(/<p>/g)).toHaveLength(1);
  expect((await page.locator(".ck-content").textContent()).length).toBe(
    text.length - 1,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
});

test("blank pages remain reachable with Up and Down", async ({ page }) => {
  await source(
    page,
    '<p>First page text</p><div data-page-break="true"></div><p></p><div data-page-break="true"></div><p>Third page text</p>',
  );
  await settled(page);
  await setCaret(page, 0, 5);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretParagraph(page)).toBe("");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretParagraph(page)).toBe("Third page text");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretParagraph(page)).toBe("");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretParagraph(page)).toBe("First page text");
});

test("wide text, tables and images do not create page scrollbars or leave the canvas", async ({
  page,
}) => {
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1kAAAAASUVORK5CYII=";
  await source(
    page,
    `<p style="width:2000px;">${"longword".repeat(300)}</p><figure class="table" style="width:2000px;"><table style="width:2000px;"><tbody><tr><td>Left cell</td><td>Right cell</td></tr></tbody></table></figure><figure class="image"><img src="${image}" width="2000" height="2000"></figure>`,
  );
  await choose(page, "Size", "A5");
  await settled(page);
  const overflow = await page.evaluate(() => {
    const editable = document.querySelector(
      ".document-editable-host > .ck-content",
    );
    const bounds = editable.getBoundingClientRect();
    return {
      scrollbars: [
        ...document.querySelectorAll(
          ".page-sheet, .document-editable-host, .document-editable-host > .ck-content",
        ),
      ].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflow)).length,
      wide: [...editable.querySelectorAll("p,table,img,figure")]
        .filter(
          (e) =>
            e.getBoundingClientRect().right > bounds.right + 1 ||
            e.getBoundingClientRect().left < bounds.left - 1,
        )
        .map((e) => e.tagName),
      text: editable.textContent,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(
        (e) => e.textContent,
      ),
    };
  });
  expect(overflow.scrollbars).toBe(0);
  expect(overflow.wide).toEqual([]);
  expect(overflow.alerts).toEqual([]);
  expect(overflow.text).toContain("Right cell");
});

test("cross-page arrows respect empty lines before other text", async ({
  page,
}) => {
  await source(
    page,
    '<p>Previous page</p><div data-page-break="true"></div><p></p><p>After the empty line</p>',
  );
  await settled(page);
  await setCaret(page, 0, 5);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretParagraph(page)).toBe("");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => caretParagraph(page)).toBe("After the empty line");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretParagraph(page)).toBe("");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => caretParagraph(page)).toBe("Previous page");
});

test("merged table rows remain together across page boundaries", async ({
  page,
}) => {
  const rows = Array.from(
    { length: 30 },
    (_, i) =>
      `<tr><td rowspan="2">Group ${i}</td><td>First ${i}</td></tr><tr><td>Second ${i}</td></tr>`,
  ).join("");
  await source(page, `<table><tbody>${rows}</tbody></table>`);
  await choose(page, "Size", "A5");
  await settled(page);
  const splitGroups = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll(".page-sheet")].map((e) =>
      e.getBoundingClientRect(),
    );
    const rows = [
      ...document.querySelectorAll(".ck-content tr:not(.automatic-page-gap)"),
    ];
    const margin = (20 * 96) / 25.4;
    const outside = [];
    for (let i = 0; i < rows.length; i += 2) {
      const first = rows[i].getBoundingClientRect(),
        last = rows[i + 1].getBoundingClientRect();
      if (
        !sheets.some(
          (p) =>
            first.top >= p.top + margin - 1 &&
            last.bottom <= p.bottom - margin + 1,
        )
      )
        outside.push(i);
    }
    return outside;
  });
  expect(splitGroups).toEqual([]);
  expect((await getHtml(page)).match(/rowspan="2"/g)).toHaveLength(30);
  expect((await getHtml(page)).match(/<table/g)).toHaveLength(1);

  const tallGroup =
    '<tr><td rowspan="25">Tall merged cell</td><td>First row</td></tr>' +
    Array.from(
      { length: 24 },
      (_, i) => `<tr><td>Extra row ${i}</td></tr>`,
    ).join("");
  await source(page, `<table><tbody>${tallGroup}</tbody></table>`);
  await expect(page.getByRole("alert")).toContainText(
    "merged row group is taller",
  );
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
});
