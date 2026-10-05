import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const runtimeErrors = new WeakMap();
const WIDE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAAV0lEQVR4nOXOMQEAMAyAMIZ/z52L9iAK8oYWiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYrwPbPovGAU/teAiZAAAAAElFTkSuQmCC";
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
async function imagePreferences(page, index = 0) {
  await page.locator(".ck-content img").nth(index).click();
  await page
    .getByRole("button", { name: "Image preferences", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Image preferences", exact: true });
}
async function settled(page) {
  await expect(
    page.getByRole("button", { name: "Save template" }),
  ).toBeEnabled();
  await page.waitForTimeout(250);
}

async function renderSavedPdf(request, payload) {
  const saved = await request.post("/api/templates", { data: payload });
  expect(saved.status()).toBe(201);
  return request.post("/api/pdf/render", {
    data: { templateId: (await saved.json()).id, documentId: "demo-invoice" },
  });
}

async function captureNativePrint(page, { fail = false } = {}) {
  let backendPdf;
  await page.route("**/api/pdf/render", async (route) => {
    const response = await route.fetch();
    backendPdf = await response.body();
    await route.fulfill({ response });
  });
  await page.evaluate((fail) => {
    window.printedPdf = null;
    const createElement = document.createElement.bind(document);
    document.createElement = (...args) => {
      const element = createElement(...args);
      if (args[0] === "iframe") {
        element.addEventListener("load", () => {
          element.contentWindow.print = () => {
            if (fail) throw new Error("Native print is unavailable");
            window.printedPdf = { url: element.src, bytes: null };
            fetch(element.src)
              .then((response) => response.arrayBuffer())
              .then((bytes) => {
                window.printedPdf.bytes = Array.from(new Uint8Array(bytes));
                element.contentWindow.dispatchEvent(new Event("afterprint"));
              });
          };
        });
      }
      return element;
    };
  }, fail);
  return () => backendPdf;
}

async function printedPdf(page) {
  const backendPdf = await captureNativePrint(page);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.getByRole("button", { name: "Print document" }).click(),
  ]);
  expect(response.status()).toBe(200);
  await expect
    .poll(() => page.evaluate(() => window.printedPdf?.bytes ?? null))
    .not.toBeNull();
  const result = await page.evaluate(() => window.printedPdf);
  expect(result.url).toMatch(/^blob:/);
  const bytes = Buffer.from(result.bytes);
  expect(bytes.equals(backendPdf())).toBe(true);
  await expect(page.locator('iframe[title="PDF for printing"]')).toHaveCount(0);
  return bytes;
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

test("uploaded and resized images survive source edits, save, reload and PDF export", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New template" }).click();
  await settled(page);
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Upload image from computer", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "wide-image.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAAV0lEQVR4nOXOMQEAMAyAMIZ/z52L9iAK8oYWiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYiZEYrwPbPovGAU/teAiZAAAAAElFTkSuQmCC",
      "base64",
    ),
  });
  const image = page.locator(".ck-content img");
  await expect(image).toHaveAttribute("width", "80");
  await expect(image).toHaveAttribute("height", "40");
  await image.click();
  const preferences = await imagePreferences(page);
  await preferences.getByLabel("Width", { exact: true }).fill("50");
  await choose(page, "Width unit", "%");
  await preferences.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(image).toHaveCSS("aspect-ratio", "80 / 40");
  const resized = await getHtml(page);
  expect(resized).toContain("aspect-ratio:80/40");
  expect(resized).toContain("width:50%");
  await source(page, resized);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toBe(resized);
  const [response, download] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/api/pdf/render"),
    ),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
});

test("image preferences validate, cancel and apply all settings in one undo step", async ({
  page,
}) => {
  await source(
    page,
    `<p>Before</p><figure class="image"><img src="${WIDE_IMAGE}" width="80" height="40" alt="Existing description"><figcaption><strong>Original caption</strong></figcaption></figure><figure class="image"><img src="${WIDE_IMAGE}" width="80" height="40" alt="Other image"></figure><p>After</p>`,
  );
  const original = await getHtml(page);
  let dialog = await imagePreferences(page);
  await expect(
    dialog.getByLabel("Alternative text", { exact: true }),
  ).toHaveValue("Existing description");
  await dialog
    .getByLabel("Alternative text", { exact: true })
    .fill("Canceled change");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await getHtml(page)).toBe(original);

  dialog = await imagePreferences(page);
  await dialog.getByLabel("Width", { exact: true }).fill("-5");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("greater than zero");
  await expect(dialog.getByLabel("Width", { exact: true })).toBeFocused();
  await dialog.getByLabel("Width", { exact: true }).fill("120");
  await choose(page, "Width unit", "%");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("100% or less");
  await choose(page, "Width unit", "px");
  await choose(page, "Layout", "Wrap text");
  await dialog
    .getByLabel("Alternative text", { exact: true })
    .fill("Red rectangle");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ck-content")).toBeFocused();
  const first = page.locator(".ck-content figure.image").first();
  await expect(first).toHaveClass(/image-style-side/);
  await expect(first).toHaveCSS("width", "120px");
  await expect(first.locator("img")).toHaveAttribute("alt", "Red rectangle");
  await expect(first.locator("figcaption strong")).toHaveText(
    "Original caption",
  );
  await expect(page.locator(".ck-content img").nth(1)).toHaveAttribute(
    "alt",
    "Other image",
  );
  const applied = await getHtml(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await getHtml(page)).toBe(applied);
  dialog = await imagePreferences(page);
  await expect(dialog.getByLabel("Width", { exact: true })).toHaveValue("120");
  await dialog.getByLabel("Width", { exact: true }).fill("200");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await getHtml(page)).toBe(applied);
});

test("image preferences switch layouts and reset the width", async ({
  page,
}) => {
  await source(
    page,
    `<p>Before</p><figure class="image image_resized" style="width:50%;"><img src="${WIDE_IMAGE}" width="80" height="40"></figure><p>After</p>`,
  );
  const original = await getHtml(page);
  let dialog = await imagePreferences(page);
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
  dialog = await imagePreferences(page);
  await choose(page, "Layout", "Inline with text");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".ck-content .image-inline")).toHaveCount(1);
  await expect(page.locator(".ck-content figcaption")).toHaveCount(0);
  dialog = await imagePreferences(page);
  await choose(page, "Layout", "On its own line");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".ck-content figure.image")).toHaveCount(1);
  expect(await getHtml(page)).toContain("width:50%");
  dialog = await imagePreferences(page);
  await dialog.getByLabel("Width", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await getHtml(page)).not.toContain("width:50%");
});

test("image preferences preserve imported widths and layouts until edited", async ({
  page,
}) => {
  await source(
    page,
    `<figure class="image image_resized image-style-align-left" style="width:80mm;"><img src="${WIDE_IMAGE}" width="80" height="40" alt="Imported"><figcaption><strong>Rich caption</strong></figcaption></figure><p>After</p>`,
  );
  const original = await getHtml(page);
  expect(original).toContain("width:80mm");
  let dialog = await imagePreferences(page);
  await expect(
    dialog.getByRole("combobox", { name: "Layout", exact: true }),
  ).toHaveText("Current layout");
  await expect(
    dialog.getByRole("combobox", { name: "Width unit", exact: true }),
  ).toHaveText("px");
  expect(
    Number(await dialog.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
  dialog = await imagePreferences(page);
  await dialog
    .getByLabel("Alternative text", { exact: true })
    .fill("Updated description");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  const applied = await getHtml(page);
  expect(applied).toContain("width:80mm");
  expect(applied).toContain("image-style-align-left");
  expect(applied).toContain("<strong>Rich caption</strong>");
  expect(applied).toContain('alt="Updated description"');
});

test("image popover supports keyboard navigation, removal and compact screens", async ({
  page,
}) => {
  await source(
    page,
    `<p>Before</p><figure class="image"><img src="${WIDE_IMAGE}" width="80" height="40"></figure><p>After</p>`,
  );
  const original = await getHtml(page);
  await page.locator(".ck-content img").click();
  const toolbar = page.getByRole("toolbar", {
    name: "Image toolbar",
    exact: true,
  });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Resize image", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Alt+F10");
  await expect(
    toolbar.getByRole("button", { name: "Image preferences", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    toolbar.getByRole("button", { name: "Remove image", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ck-content")).toBeFocused();
  await page.locator(".ck-content > p").first().click();
  await page.locator(".ck-content img").click();
  await toolbar
    .getByRole("button", { name: "Remove image", exact: true })
    .click();
  await expect(page.locator(".ck-content img")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);

  await page.setViewportSize({ width: 360, height: 640 });
  const dialog = await imagePreferences(page);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  await expect(
    dialog.getByRole("switch", { name: "Show caption" }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Caption", { exact: true })).toHaveCount(0);
  await expect(dialog.locator("img")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Apply", exact: true }),
  ).toBeInViewport();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
});

test("Source Format indents nested HTML without changing content and is repeatable", async ({
  page,
}) => {
  const compact =
    '<blockquote><p>First <strong>bold</strong> <em>second</em> &lt;tag&gt; &amp; last</p></blockquote><figure class="table"><table><tbody><tr><td><p>Cell <a href="https://example.com" title="A > B">link</a></p></td><td>Other cell</td></tr></tbody></table></figure><ul><li>One <strong>two</strong> <em>three</em></li><li><p>Nested</p><ul><li>Item</li></ul></li></ul><div data-page-break="true"></div><p>After</p>';
  await source(page, compact);
  const original = await getHtml(page);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Document HTML" });
  await input.fill(compact);
  await page.getByRole("button", { name: "Format", exact: true }).click();
  const formatted = await input.inputValue();
  expect(formatted).toContain(
    '<figure class="table">\n  <table>\n    <tbody>\n      <tr>\n        <td>\n          <p>Cell <a href="https://example.com" title="A &gt; B">link</a></p>\n        </td>\n        <td>Other cell</td>\n      </tr>\n    </tbody>\n  </table>\n</figure>',
  );
  expect(formatted).toContain(
    "<blockquote>\n  <p>First <strong>bold</strong> <em>second</em> &lt;tag&gt; &amp; last</p>\n</blockquote>",
  );
  expect(formatted).toContain(
    "  <li>One <strong>two</strong> <em>three</em></li>",
  );
  expect(formatted).toContain(
    "  <li>\n    <p>Nested</p>\n    <ul>\n      <li>Item</li>\n    </ul>\n  </li>",
  );
  await page.getByRole("button", { name: "Format", exact: true }).click();
  await expect(input).toHaveValue(formatted);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await getHtml(page)).toBe(original);
  await expect(page.locator(".ck-content blockquote p")).toHaveText(
    "First bold second <tag> & last",
  );
});

test("Source Format preserves inline fragments, mixed content, and non-breaking spaces", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Document HTML" });
  const examples = [
    [
      '<strong>First</strong> <em>second</em>&nbsp;<a href="https://example.com">third</a>',
      '<strong>First</strong> <em>second</em>&nbsp;<a href="https://example.com">third</a>',
    ],
    [
      "<div><p>First</p>&nbsp;<p>Second</p></div>",
      "<div><p>First</p>&nbsp;<p>Second</p></div>",
    ],
    [
      "<ul><li>Parent <ul><li>Nested</li></ul> tail</li></ul>",
      "<ul>\n  <li>Parent <ul><li>Nested</li></ul> tail</li>\n</ul>",
    ],
    [
      "<p>Line<br> two<strong>three</strong> <em>four</em></p>",
      "<p>Line<br> two<strong>three</strong> <em>four</em></p>",
    ],
    [
      "<div><!--Section--><p>First &amp; second</p></div>",
      "<div>\n  <!--Section-->\n  <p>First &amp; second</p>\n</div>",
    ],
  ];
  for (const [compact, formatted] of examples) {
    await input.fill(compact);
    await page.getByRole("button", { name: "Format", exact: true }).click();
    await expect(input).toHaveValue(formatted);
    await page.getByRole("button", { name: "Format", exact: true }).click();
    await expect(input).toHaveValue(formatted);
  }
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
    .fill('<p style="aspect-ratio:1/0;">Invalid ratio</p>');
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported CSS property or value: aspect-ratio",
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

test("cleans legacy source for review before applying and preserves supported content", async ({
  page,
  request,
}) => {
  const before = await getHtml(page);
  const legacy = `<section><p id="old" class="legacy" onclick="window.legacyRan = true">First <font face="Arial"><strong>bold</strong></font> &lt;tag&gt; &amp; last</p></section>
<table border="1" cellpadding="4" cellspacing="0" class="table old-table" style="width:100%;border-collapse:collapse;position:absolute"><tbody><tr><td colspan="2" style="color:rgb(10, 20, 30);padding:4px;mso-padding-alt:0;">{Client Name}</td></tr></tbody></table>
<script>window.legacyRan = true</script><style>p { display:none }</style><iframe src="https://example.com">Hidden iframe</iframe><template><p>Hidden template</p></template><!-- old comment -->`;
  await source(page, legacy);
  const dialog = page.getByRole("dialog", { name: "Source", exact: true });
  const input = dialog.getByRole("textbox", { name: "Document HTML" });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Clean HTML", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveText(
    "HTML cleaned. Review the code, then apply it.",
  );
  const cleaned = await input.inputValue();
  expect(cleaned).toContain(
    "First <strong>bold</strong> &lt;tag&gt; &amp; last",
  );
  expect(cleaned).toContain('class="table"');
  expect(cleaned).toContain('style="width:100%;border-collapse:collapse"');
  expect(cleaned).toContain('colspan="2"');
  expect(cleaned).toContain('style="color:rgb(10, 20, 30);padding:4px"');
  expect(cleaned).toContain("{Client Name}");
  expect(cleaned).not.toMatch(
    /section|font|border=|cellpadding|cellspacing|old-table|position|mso-|onclick|id=|script|iframe|template|<!--/,
  );
  expect(await page.evaluate(() => window.legacyRan)).toBeUndefined();
  // Cleaning remains a source draft: Cancel must leave the document untouched.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await getHtml(page)).toBe(before);

  // Both the existing Apply path and the backend contract accept the result.
  const saved = await request.post("/api/templates", {
    data: {
      name: "Cleaned legacy HTML",
      html: cleaned,
      pageSettings: {
        pageSize: "A4",
        orientation: "portrait",
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
      },
    },
  });
  expect(saved.status()).toBe(201);
  await source(page, cleaned);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".ck-content strong")).toHaveText("bold");
  await expect(page.locator(".ck-content td")).toHaveText("{Client Name}");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(before);
});

test("HTML cleanup converts legacy borderless tables to supported CSS", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Document HTML" });
  await input.fill(`<table border="0"><thead><tr><th style="padding:4px;border:2px solid blue">Header</th></tr></thead><tbody><tr><td>No border</td></tr></tbody><tfoot><tr><td style="border-left:1px solid red;background-color:yellow">Footer</td></tr></tfoot></table>
<table style="width:100%;border:1px solid red;border-style:solid;position:absolute" border="0"><tbody><tr><td>Existing styles</td></tr></tbody></table>
<table border="1"><tbody><tr><td>Default border</td></tr></tbody></table>
<table style="border-style:none"><tbody><tr><td>Previously cleaned table</td></tr></tbody></table>`);
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  const cleaned = await input.inputValue();
  expect(cleaned).toContain('<table style="border-style:none">');
  expect(cleaned).toContain(
    '<table style="width:100%;border:1px solid red;border-style:none">',
  );
  expect(cleaned).toContain("<table><tbody><tr><td>Default border</td>");
  expect(cleaned).toContain(
    '<th style="padding:4px;border:2px solid blue;border-style:none">Header</th>',
  );
  expect(cleaned).toContain(
    '<td style="border-left:1px solid red;background-color:yellow;border-style:none">Footer</td>',
  );
  expect(cleaned).toContain(
    '<td style="border-style:none">Previously cleaned table</td>',
  );
  expect(cleaned).not.toMatch(/border=|border-style:solid|position/);
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  await expect(input).toHaveValue(cleaned);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".ck-content table").nth(0)).toHaveCSS(
    "border-top-style",
    "none",
  );
  await expect(page.locator(".ck-content table").nth(1)).toHaveCSS(
    "border-top-style",
    "none",
  );
  const cells = page.locator(".ck-content table").nth(0).locator("th, td");
  await expect(cells).toHaveCount(3);
  for (const cell of await cells.all()) {
    expect(await cell.evaluate((node) => node.style.borderStyle)).toBe("none");
  }
  await expect(cells.nth(0)).toHaveCSS("padding-top", "4px");
  await expect(cells.nth(2)).toHaveCSS("background-color", "rgb(255, 255, 0)");
  await expect(
    page.locator(".ck-content table").nth(2).locator("td"),
  ).toHaveCSS("border-top-style", "solid");
  // CKEditor draws dashed editing guides over borderless cells. Verify the
  // canonical HTML with the output stylesheet, where those guides do not apply.
  const outputBorders = await page.evaluate(
    (html) => {
      const output = document.createElement("div");
      output.className = "print-document";
      output.innerHTML = html;
      document.querySelector(".papercraft-editor").append(output);
      const borders = Array.from(output.querySelectorAll("table"), (table) =>
        Array.from(table.querySelectorAll("th, td"), (cell) => {
          const style = getComputedStyle(cell);
          return [
            style.borderTopStyle,
            style.borderRightStyle,
            style.borderBottomStyle,
            style.borderLeftStyle,
          ];
        }),
      );
      output.remove();
      return borders;
    },
    await getHtml(page),
  );
  expect(outputBorders).toEqual([
    Array(3).fill(["none", "none", "none", "none"]),
    [["none", "none", "none", "none"]],
    [["solid", "solid", "solid", "solid"]],
    [["none", "none", "none", "none"]],
  ]);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await settled(page);
  await expect(page.locator(".ck-content")).toContainText(
    "Previously cleaned table",
  );
  const reloadedCells = page
    .locator(".ck-content table")
    .nth(0)
    .locator("th, td");
  await expect(reloadedCells).toHaveCount(3);
  for (const cell of await reloadedCells.all()) {
    expect(await cell.evaluate((node) => node.style.borderStyle)).toBe("none");
  }
});

test("HTML cleanup removes table and cell border styles while keeping borderless tables", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Document HTML" });
  await input.fill(`<table style="width:100%;border-style:dashed;border-top-style:dotted;border-right-style:solid;border-bottom-style:double;border-left-style:groove;border-width:2px;border-color:red"><thead><tr><th style="BORDER-STYLE:solid;border-bottom-style:dotted;padding:4px">Header</th></tr></thead><tbody><tr><td style="border-style:dashed;border-top-style:solid;border-right-style:dotted;border-bottom-style:double;border-left-style:groove;background-color:yellow;border-left-width:2px;border-left-color:red">Body</td></tr></tbody></table>
<table border="0" style="border-style:solid;border-bottom-style:double"><tbody><tr><td style="border-style:dotted;border-top-style:solid">Borderless</td></tr></tbody></table>
<p style="border-style:dashed">Other content</p>`);
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  const cleaned = await input.inputValue();
  expect(cleaned).toContain(
    '<table style="width:100%;border-width:2px;border-color:red">',
  );
  expect(cleaned).toContain('<th style="padding:4px">Header</th>');
  expect(cleaned).toContain(
    '<td style="background-color:yellow;border-left-width:2px;border-left-color:red">Body</td>',
  );
  expect(cleaned).toContain(
    '<table style="border-style:none"><tbody><tr><td style="border-style:none">Borderless</td>',
  );
  expect(cleaned).toContain('<p style="border-style:dashed">Other content</p>');
  expect(cleaned).not.toMatch(
    /border-(top|right|bottom|left)-style|border=|border-style:(solid|dotted|double|groove)/,
  );
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  await expect(input).toHaveValue(cleaned);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await settled(page);
  await expect(page.locator(".ck-content table").nth(0)).toContainText("Body");
  expect(
    await page
      .locator(".ck-content table")
      .nth(1)
      .locator("td")
      .evaluate((cell) => cell.style.borderStyle),
  ).toBe("none");
});

test("HTML cleanup removes table and cell heights while preserving image dimensions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Document HTML" });
  await input.fill(`<figure class="table" style="width:80%;height:500px"><table border="0" height="400" style="width:100%;HEIGHT:400px;min-height:300px;max-height:600px"><thead style="height:100px"><tr style="height:100px"><th height="100" style="height:100px;padding:4px">Header</th></tr></thead><tbody style="height:200px"><tr height="200" style="height:200px"><td height="200" style="height:200px;background-color:yellow">Body</td></tr></tbody><tfoot style="height:100px"><tr style="height:100px"><td style="height:100px">Footer</td></tr></tfoot></table></figure>
<p style="height:20px">Other content</p><figure class="image" style="height:40px"><img src="${WIDE_IMAGE}" width="80" height="40" style="height:40px" alt="Uploaded"></figure>`);
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  const cleaned = await input.inputValue();
  const tableMarkup = cleaned.slice(0, cleaned.indexOf("</figure>") + 9);
  expect(tableMarkup).not.toMatch(/height/i);
  expect(tableMarkup).toContain('style="width:80%"');
  expect(tableMarkup).toContain('style="width:100%;border-style:none"');
  expect(tableMarkup).toContain('style="padding:4px;border-style:none"');
  expect(tableMarkup).toContain(
    'style="background-color:yellow;border-style:none"',
  );
  expect(cleaned).toContain('<p style="height:20px">Other content</p>');
  expect(cleaned).toContain('<figure class="image" style="height:40px">');
  expect(cleaned).toContain(
    `<img src="${WIDE_IMAGE}" width="80" height="40" style="height:40px" alt="Uploaded">`,
  );
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  await expect(input).toHaveValue(cleaned);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".ck-content table")).toContainText("Body");
  expect(
    await page
      .locator(".ck-content table")
      .evaluate((table) => table.offsetHeight),
  ).toBeLessThan(150);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await settled(page);
  const tableHeights = await page
    .locator(
      ".ck-content .table, .ck-content table, .ck-content th, .ck-content td",
    )
    .evaluateAll((nodes) => nodes.map((node) => node.style.height));
  expect(tableHeights.length).toBeGreaterThan(3);
  expect(tableHeights.every((height) => height === "")).toBe(true);
});

test("HTML cleanup removes invalid values while retaining links, images, and page breaks", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Document HTML" });
  await input.fill(`<p><a href="javascript:alert(1)" target="popup" rel="external">Bad link</a> <a href="https://example.com" target="_blank" rel="noopener">Good link</a></p>
<p style="color:red;background-color:url(https://example.com/bg);margin:-2px;aspect-ratio:1/0">Keep text</p>
<img src="https://example.com/image.png" onerror="alert(1)" width="bad" height="10001" alt="Remote"><img src="${WIDE_IMAGE}" width="80" height="40" alt="Uploaded">
<div data-page-break="true"></div><p><span data-page-break="true"></span></p><div data-page-break="true">Keep marker text</div><div><div data-page-break="true"></div></div>`);
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  const cleaned = await input.inputValue();
  expect(cleaned).toContain("<a>Bad link</a>");
  expect(cleaned).toContain(
    '<a href="https://example.com" target="_blank" rel="noopener">Good link</a>',
  );
  expect(cleaned).toContain('<p style="color:red">Keep text</p>');
  expect(cleaned).toContain('<img alt="Remote">');
  expect(cleaned).toContain(
    `<img src="${WIDE_IMAGE}" width="80" height="40" alt="Uploaded">`,
  );
  expect(cleaned.match(/data-page-break="true"/g)).toHaveLength(2);
  expect(cleaned).toContain("<div>Keep marker text</div>");
  expect(cleaned).not.toMatch(
    /javascript|onerror|url\(|aspect-ratio|margin|popup|external/,
  );
  await page.getByRole("button", { name: "Clean HTML", exact: true }).click();
  await expect(input).toHaveValue(cleaned);
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
    "HTML already uses supported markup.",
  );
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("custom table properties validate, cancel, apply and undo as one change", async ({
  page,
}) => {
  await source(
    page,
    '<figure class="table"><table><tbody><tr><td>First cell</td><td>Second cell</td></tr></tbody></table><figcaption>Existing caption</figcaption></figure>',
  );
  const original = await getHtml(page);
  async function openProperties() {
    await page.locator(".ck-content td").first().click();
    await expect(
      page.getByRole("button", { name: "Toggle caption", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Table properties", exact: true })
      .click();
    return page.getByRole("dialog", { name: "Table properties", exact: true });
  }

  let dialog = await openProperties();
  await expect(
    dialog.getByRole("switch", { name: "Border", exact: true }),
  ).toBeChecked();
  await expect(dialog.getByLabel("Border width", { exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByLabel("Width", { exact: true })).toHaveValue("100");
  await expect(
    dialog.getByRole("combobox", { name: "Width unit", exact: true }),
  ).toHaveText("%");
  await dialog.getByLabel("Width", { exact: true }).fill("50");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await getHtml(page)).toBe(original);

  dialog = await openProperties();
  await dialog.getByLabel("Width", { exact: true }).fill("-20");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("non-negative size");
  await expect(dialog.getByLabel("Width", { exact: true })).toBeFocused();
  await dialog.getByLabel("Width", { exact: true }).fill("65");
  await dialog.getByLabel("Height", { exact: true }).fill("35");
  await choose(page, "Height unit", "%");
  await choose(page, "Table alignment", "Left");
  await choose(page, "Border style", "Dashed");
  const borderSwitch = dialog.getByRole("switch", {
    name: "Border",
    exact: true,
  });
  await borderSwitch.click();
  await expect(borderSwitch).not.toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Border style", exact: true }),
  ).toBeDisabled();
  await borderSwitch.focus();
  await page.keyboard.press("Space");
  await expect(borderSwitch).toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Border style", exact: true }),
  ).toHaveText("Dashed");
  await dialog
    .getByRole("group", { name: "Border color presets" })
    .getByRole("button", { name: "Slate", exact: true })
    .click();
  await dialog
    .getByRole("group", { name: "Background color presets" })
    .getByRole("button", { name: "Light blue", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const applied = await getHtml(page);
  expect(applied).toContain("width:65%");
  expect(applied).toContain("height:35%");
  expect(applied).toContain("float:left");
  await expect(page.locator(".ck-content table")).toHaveCSS(
    "border-top-style",
    "dashed",
  );
  await expect(page.locator(".ck-content table")).toHaveCSS(
    "border-top-width",
    "1px",
  );
  expect(applied).toContain("background-color:#dbeafe");
  expect(applied).toContain("Existing caption");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await getHtml(page)).toBe(applied);

  dialog = await openProperties();
  await expect(dialog.getByLabel("Width", { exact: true })).toHaveValue("65");
  await dialog.getByLabel("Width", { exact: true }).fill("90");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await getHtml(page)).toBe(applied);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toBe(applied);
});

test("custom cell properties apply to the selected cell and restore editing focus", async ({
  page,
}) => {
  await source(
    page,
    "<table><tbody><tr><td>Selected cell</td><td>Untouched cell</td></tr></tbody></table>",
  );
  const first = page.locator(".ck-content td").first();
  await first.click();
  await page
    .getByRole("button", { name: "Cell properties", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cell properties",
    exact: true,
  });
  await choose(page, "Horizontal alignment", "Right");
  await choose(page, "Vertical alignment", "Top");
  await dialog.getByLabel("Height", { exact: true }).fill("50");
  await expect(
    dialog.getByRole("combobox", { name: "Height unit", exact: true }),
  ).toHaveText("px");
  await dialog.getByLabel("Width", { exact: true }).fill("30");
  await choose(page, "Width unit", "%");
  await dialog.getByLabel("Cell padding", { exact: true }).fill("12");
  await dialog.getByRole("switch", { name: "Border", exact: true }).click();
  await expect(
    dialog.getByRole("switch", { name: "Border", exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Border style", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Border width", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog
      .getByRole("group", { name: "Border color presets" })
      .getByRole("button", { name: "Black", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("textbox", { name: /color/i })).toHaveCount(0);
  await dialog
    .getByRole("group", { name: "Background color presets" })
    .getByRole("button", { name: "Light green", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("padding-top", "12px");
  await expect(first).toHaveCSS("vertical-align", "top");
  await expect(first).toHaveCSS("text-align", "right");
  await expect(first).toHaveCSS("background-color", "rgb(220, 252, 231)");
  const html = await getHtml(page);
  expect(html).toContain("height:50px");
  expect(html).toContain("width:30%");
  expect(html).toContain("padding:12px");
  expect(html).toContain("border-style:none");
  const untouched = await page
    .locator(".ck-content td")
    .nth(1)
    .getAttribute("style");
  expect(untouched ?? "").not.toContain("12px");
  expect(untouched ?? "").not.toContain("#dcfce7");
  await first.click();
  await page
    .getByRole("button", { name: "Cell properties", exact: true })
    .click();
  await expect(
    dialog.getByRole("switch", { name: "Border", exact: true }),
  ).not.toBeChecked();
  await dialog.getByRole("switch", { name: "Border", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(first).toHaveCSS("border-top-style", "solid");
  await expect(first).toHaveCSS("border-top-width", "1px");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(html);
});

test("custom table properties preserve imported styles and switch dimension units", async ({
  page,
}) => {
  await source(
    page,
    '<figure class="table" style="width:80mm;height:2cm;"><table style="border-style:groove;border-width:4px;border-color:#123abc;background-color:#fedcba;"><tbody><tr><td>Imported table</td></tr></tbody></table></figure>',
  );
  const original = await getHtml(page);
  expect(original).toContain("width:80mm");
  expect(original).toContain("height:2cm");
  async function openProperties() {
    await page.locator(".ck-content td").first().click();
    await page
      .getByRole("button", { name: "Table properties", exact: true })
      .click();
    return page.getByRole("dialog", { name: "Table properties", exact: true });
  }
  let dialog = await openProperties();
  expect(
    Number(await dialog.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeGreaterThan(0);
  await expect(
    dialog.getByRole("combobox", { name: "Width unit", exact: true }),
  ).toHaveText("px");
  await expect(
    dialog.getByRole("combobox", { name: "Border style", exact: true }),
  ).toHaveText("Custom");
  await expect(
    dialog
      .getByRole("group", { name: "Border color presets" })
      .getByRole("button", { pressed: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
  dialog = await openProperties();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".ck-content table")).toHaveCSS(
    "border-top-width",
    "1px",
  );
  await expect(page.locator(".ck-content table")).toHaveCSS(
    "border-top-style",
    "groove",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);

  dialog = await openProperties();
  await dialog.getByLabel("Width", { exact: true }).fill("220");
  await dialog.getByLabel("Height", { exact: true }).fill("25");
  await choose(page, "Height unit", "%");
  await dialog
    .getByRole("combobox", { name: "Border style", exact: true })
    .click();
  await expect(page.getByRole("option")).toHaveText([
    "Solid",
    "Dashed",
    "Dotted",
    "Double",
  ]);
  await page.getByRole("option", { name: "Solid", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  const applied = await getHtml(page);
  expect(applied).toContain("width:220px");
  expect(applied).toContain("height:25%");
  expect(applied).toContain("border-style:solid");
  expect(applied).toContain("border-color:#123abc");
  expect(applied).toContain("background-color:#fedcba");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
});

test("custom cell properties preserve mixed values and clear selected cell backgrounds", async ({
  page,
}) => {
  await source(
    page,
    '<table><tbody><tr><td style="width:20%;background-color:#dbeafe;padding:4px;border-style:none;">Blue cell</td><td style="width:30%;background-color:#dcfce7;padding:8px;border-style:dashed;">Green cell</td><td>Other cell</td></tr></tbody></table>',
  );
  const original = await getHtml(page);
  async function selectCells() {
    await page.locator(".ck-content td").first().click();
    await page
      .locator(".document-editable-host > .ck-content")
      .evaluate((editable) => {
        const editor = editable.ckeditorInstance;
        const cells = editor.plugins
          .get("TableUtils")
          .getSelectionAffectedTableCells(editor.model.document.selection);
        editor.plugins
          .get("TableSelection")
          .setCellSelection(cells[0], cells[0].nextSibling);
      });
    await page
      .getByRole("button", { name: "Cell properties", exact: true })
      .click();
    return page.getByRole("dialog", { name: "Cell properties", exact: true });
  }
  let dialog = await selectCells();
  await expect(dialog).toContainText("2 selected cells");
  await expect(
    dialog.getByLabel("Cell padding", { exact: true }),
  ).toHaveAttribute("placeholder", "Mixed");
  await expect(dialog.getByLabel("Width", { exact: true })).toHaveAttribute(
    "placeholder",
    "Mixed",
  );
  await expect(
    dialog
      .getByRole("group", { name: "Background color presets" })
      .getByRole("button", { pressed: true }),
  ).toHaveCount(0);
  await expect(
    dialog
      .getByRole("region", { name: "Background", exact: true })
      .getByText("Mixed", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("switch", { name: "Border", exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Border style", exact: true }),
  ).toHaveText("Mixed");
  await choose(page, "Width unit", "%");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await getHtml(page)).toBe(original);

  dialog = await selectCells();
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await dialog.getByLabel("Cell padding", { exact: true }).fill("10px");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  const cells = page.locator(".ck-content td");
  for (const index of [0, 1]) {
    await expect(cells.nth(index)).toHaveCSS("padding-top", "10px");
    await expect(cells.nth(index)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  expect((await cells.nth(2).getAttribute("style")) ?? "").not.toContain(
    "10px",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
  dialog = await selectCells();
  await dialog.getByRole("switch", { name: "Border", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  for (const index of [0, 1]) {
    await expect(cells.nth(index)).toHaveCSS("border-top-style", "solid");
    await expect(cells.nth(index)).toHaveCSS("border-top-width", "1px");
  }
  expect((await cells.nth(2).getAttribute("style")) ?? "").not.toContain(
    "border",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await getHtml(page)).toBe(original);
});

test("table contextual menus keep their anchor and run row and column actions", async ({
  page,
}) => {
  await source(
    page,
    "<table><tbody><tr><td>First</td><td>Second</td></tr><tr><td>Third</td><td>Fourth</td></tr></tbody></table>",
  );
  const cells = page.locator(".ck-content td");
  const toolbar = page.getByRole("toolbar", {
    name: "Table toolbar",
    exact: true,
  });
  await cells.first().click();
  await toolbar.getByRole("button", { name: "Row", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Header row", exact: true }),
  ).not.toBeChecked();
  const menuBounds = await page.getByRole("menu").boundingBox();
  const toolbarBounds = await toolbar.boundingBox();
  expect(menuBounds.y).toBeGreaterThan(toolbarBounds.y);
  await page
    .getByRole("menuitem", { name: "Insert row below", exact: true })
    .click();
  await expect(page.locator(".ck-content tr")).toHaveCount(3);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".ck-content")
        .evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".ck-content tr")).toHaveCount(2);

  await cells.first().click();
  await toolbar.getByRole("button", { name: "Column", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Insert column right", exact: true })
    .click();
  await expect(
    page.locator(".ck-content tr").first().locator("td"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cells).toHaveCount(4);

  await cells.first().click();
  await toolbar.getByRole("button", { name: "Row", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Header row", exact: true })
    .click();
  await expect(page.locator(".ck-content thead th")).toHaveCount(2);
  await toolbar.getByRole("button", { name: "Row", exact: true }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Header row", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    toolbar.getByRole("button", { name: "Row", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    toolbar.getByRole("button", { name: "Column", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page
        .locator(".ck-content")
        .evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  await cells.nth(2).click();
  await toolbar.getByRole("button", { name: "Row", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete row", exact: true }).click();
  await expect(page.locator(".ck-content tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".ck-content tr")).toHaveCount(2);
});

test("table contextual merge menu reflects selection and supports merge and split", async ({
  page,
}) => {
  await source(
    page,
    "<table><tbody><tr><td>First</td><td>Second</td></tr><tr><td>Third</td><td>Fourth</td></tr></tbody></table>",
  );
  const cells = page.locator(".ck-content td");
  const merge = page.getByRole("button", { name: "Merge", exact: true });
  await cells.first().click();
  await merge.click();
  await expect(
    page.getByRole("menuitem", { name: "Merge selected cells", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Merge cell left", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Merge cell up", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("menuitem", { name: "Merge cell right", exact: true })
    .click();
  await expect(cells.first()).toHaveAttribute("colspan", "2");
  await expect(cells.first()).toContainText("Second");
  await expect(cells).toHaveCount(3);
  await merge.click();
  await page
    .getByRole("menuitem", { name: "Split cell vertically", exact: true })
    .click();
  await expect(cells).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cells).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cells).toHaveCount(4);

  await cells.first().click();
  await page
    .locator(".document-editable-host > .ck-content")
    .evaluate((editable) => {
      const editor = editable.ckeditorInstance;
      const [cell] = editor.plugins
        .get("TableUtils")
        .getSelectionAffectedTableCells(editor.model.document.selection);
      editor.plugins
        .get("TableSelection")
        .setCellSelection(cell, cell.nextSibling);
    });
  await merge.click();
  await expect(
    page.getByRole("menuitem", { name: "Merge selected cells", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("menuitem", { name: "Merge selected cells", exact: true })
    .click();
  await expect(cells.first()).toHaveAttribute("colspan", "2");
  await expect(cells).toHaveCount(3);
});

test("table contextual toolbar supports selecting the whole table and narrow screens", async ({
  page,
}) => {
  await source(
    page,
    "<table><tbody><tr><td>First</td><td>Second</td></tr></tbody></table>",
  );
  await page.locator(".ck-content td").first().click();
  await page
    .locator(".document-editable-host > .ck-content")
    .evaluate((editable) => {
      const editor = editable.ckeditorInstance;
      const table = editor.model.document.selection
        .getFirstPosition()
        .findAncestor("table");
      editor.model.change((writer) => writer.setSelection(table, "on"));
      editor.editing.view.focus();
    });
  const toolbar = page.getByRole("toolbar", {
    name: "Table toolbar",
    exact: true,
  });
  await expect(
    toolbar.getByRole("button", { name: "Table properties", exact: true }),
  ).toBeEnabled();
  await expect(
    toolbar.getByRole("button", { name: "Cell properties", exact: true }),
  ).toBeDisabled();
  await toolbar
    .getByRole("button", { name: "Table properties", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Table properties", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 700 });
  await page.locator(".ck-content td").first().click();
  await expect(toolbar).toBeVisible();
  const bounds = await toolbar.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await toolbar.getByRole("button", { name: "Column", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Select column", exact: true }),
  ).toBeVisible();
  await expect(toolbar).toBeVisible();
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

test("save, reload, confirm changes before PDF export, and delete work through backend", async ({
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
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect(
    page.getByRole("dialog", { name: "Save template before downloading?" }),
  ).toBeVisible();
  const [response, download] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save and download" }).click(),
  ]);
  expect(response.request().postDataJSON()).toEqual({
    templateId: templates[0].id,
    documentId: "demo-invoice",
  });
  expect(response.status()).toBe(200);
  expect(download.suggestedFilename()).toBe("Browser test.pdf");
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  const updated = await (
    await request.get(`/api/templates/${templates[0].id}`)
  ).json();
  expect(updated.html).toContain("Unsaved export");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete template" }).click();
  await expect
    .poll(
      async () => (await (await request.get("/api/templates")).json()).length,
    )
    .toBe(0);
});

for (const [button, action] of [
  ["Export PDF", "download"],
  ["Print document", "print"],
]) {
  test(`${action} can cancel unsaved changes without saving or generating a PDF`, async ({
    page,
    request,
  }) => {
    await source(page, "<p>Unsaved template</p>");
    const pdfRequests = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/pdf/render")) pdfRequests.push(r);
    });
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await getHtml(page)).toBe("<p>Unsaved template</p>");
    expect(await (await request.get("/api/templates")).json()).toEqual([]);
    expect(pdfRequests).toHaveLength(0);
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test(`${action} stops after a save failure and preserves the draft`, async ({
    page,
  }) => {
    await source(page, "<p>Keep this draft</p>");
    const pdfRequests = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/pdf/render")) pdfRequests.push(r);
    });
    await page.route("**/api/templates", async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 503,
          json: { detail: "Template storage is unavailable." },
        });
      else await route.continue();
    });
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("button", { name: `Save and ${action}` }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Template storage is unavailable.",
    );
    expect(pdfRequests).toHaveLength(0);
    expect(await getHtml(page)).toBe("<p>Keep this draft</p>");
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("button", { name: button })).toBeEnabled();
  });
}

test("print saves a new template, requests IDs only, and prints the returned PDF", async ({
  page,
  request,
}) => {
  await source(page, "<p>Print {Client Name}</p>");
  const backendPdf = await captureNativePrint(page);
  await page.getByRole("button", { name: "Print document" }).click();
  await expect(
    page.getByRole("dialog", { name: "Save template before printing?" }),
  ).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/pdf/render")),
    page.getByRole("button", { name: "Save and print" }).click(),
  ]);
  expect(response.status()).toBe(200);
  const saved = await (await request.get("/api/templates")).json();
  expect(response.request().postDataJSON()).toEqual({
    templateId: saved[0].id,
    documentId: "demo-invoice",
  });
  await expect
    .poll(() => page.evaluate(() => window.printedPdf?.bytes ?? null))
    .not.toBeNull();
  expect(
    Buffer.from(await page.evaluate(() => window.printedPdf.bytes)).equals(
      backendPdf(),
    ),
  ).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Print dialog requested", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="PDF for printing"]')).toHaveCount(0);
});

test("failed PDF generation keeps the saved template and permits retry", async ({
  page,
  request,
}) => {
  await source(page, "<p>Saved before rendering</p>");
  await page.route("**/api/pdf/render", (route) =>
    route.fulfill({ status: 500, json: { detail: "PDF rendering failed." } }),
  );
  await page.getByRole("button", { name: "Export PDF" }).click();
  await page.getByRole("button", { name: "Save and download" }).click();
  await expect(page.getByRole("alert")).toContainText("PDF rendering failed.");
  expect(await (await request.get("/api/templates")).json()).toHaveLength(1);
  await page.unroute("**/api/pdf/render");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a browser without a PDF viewer reports a print error and still permits download", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false }),
  );
  await page.getByRole("button", { name: "Print document" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This browser cannot print PDFs.",
  );
  await expect(page.locator('iframe[title="PDF for printing"]')).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export PDF" }).click(),
  ]);
  expect(
    (await readFile(await download.path())).subarray(0, 5).toString(),
  ).toBe("%PDF-");
});

test("a native print failure removes the temporary PDF frame and reports an error", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(
    page.getByText("Saved to backend", { exact: true }),
  ).toBeVisible();
  await captureNativePrint(page, { fail: true });
  await page.getByRole("button", { name: "Print document" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The print dialog could not open.",
  );
  await expect(page.locator('iframe[title="PDF for printing"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeEnabled();
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
  const printed = inspect(await printedPdf(page));
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
  expect(await getHtml(page)).toBe(original);
  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
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
  await expect(page.locator(".browser-print-document")).toHaveCount(0);
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
  const printed = inspect(await printedPdf(page));
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
  expect(await getHtml(page)).toBe(original);
  await page.reload();
  await settled(page);
  expect(await getHtml(page)).toBe(original);
  await expect(page.locator(".ck-content tbody > tr")).toHaveCount(4);
});

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

test("table row heights match in the editor and backend PDF", async ({
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
  const response = await renderSavedPdf(request, {
    name: "Table row spacing",
    html: await getHtml(page),
    pageSettings: {
      pageSize: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    },
  });
  expect(response.status()).toBe(200);
  const { execFileSync } = await import("node:child_process");
  const inspect = (bytes) =>
    JSON.parse(
      execFileSync("backend/.venv/bin/python", ["tests/pdf_table_rows.py"], {
        input: bytes,
      }).toString(),
    );
  for (const bytes of [await response.body()]) {
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
    page.getByRole("button", { name: "Insert", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Page break", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".document-editable-host > .ck-content")
    .evaluate((editable) => {
      editable.ckeditorInstance.execute("insertPageBreak");
    });
  await expect(page.locator(".page-frame")).toHaveCount(2);
  await expect(page.locator(".ck-content > p").first()).toHaveText(
    /^Alpha\s*$/,
  );
  await expect(page.locator(".ck-content > p").last()).toHaveText("Beta");
  await expect(
    page.getByRole("button", { name: "Page break", exact: true }),
  ).toHaveCount(0);
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

test("backend PDF keeps the same blocks on the same pages as the editor", async ({
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
  const response = await renderSavedPdf(request, {
    name: "Layout fixture",
    html,
    pageSettings: {
      pageSize: "A5",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
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
