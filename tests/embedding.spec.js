import { test, expect } from "@playwright/test";

const errors = new WeakMap();
const region = (page, name = "First editor") =>
  page.getByRole("region", { name, exact: true });

async function ready(page, id = "first") {
  await expect(page.getByTestId(`${id}-state`)).toHaveText(/^Ready:/);
}

async function openSource(editor) {
  await editor.getByRole("button", { name: "Source", exact: true }).click();
  return editor.getByRole("dialog", { name: "Source", exact: true });
}

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on("pageerror", (error) => errors.get(page).push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/examples/embedded-editor.html");
  await ready(page);
  await ready(page, "second");
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test("keeps host styles and independent editor sizes", async ({ page }) => {
  expect(await page.evaluate(() => window.hostStyleSnapshot())).toEqual(
    await page.evaluate(() => window.hostBaseline),
  );
  const first = region(page);
  const second = region(page, "Second editor");
  expect(
    await first.evaluate((node) => [node.clientWidth, node.clientHeight]),
  ).toEqual([1078, 598]);
  expect(
    await second.evaluate((node) => [node.clientWidth, node.clientHeight]),
  ).toEqual([658, 448]);
  await expect(first.locator(".ck-content")).toHaveText(
    "First editor content.",
  );
  await expect(second.locator(".ck-content")).toHaveText(
    "Second editor content.",
  );
  const firstDialog = await openSource(first);
  const firstLabel = await firstDialog.getAttribute("aria-labelledby");
  await firstDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  const secondDialog = await openSource(second);
  expect(await secondDialog.getAttribute("aria-labelledby")).not.toBe(
    firstLabel,
  );
  await secondDialog
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
});

test("inserts host variables and reports edits without changing another instance", async ({
  page,
}) => {
  const first = region(page);
  await first.locator(".ck-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await first
    .getByRole("button", { name: "{{host.customer}}", exact: true })
    .click();
  await expect(page.getByTestId("first-html")).toContainText(
    "{{host.customer}}",
  );
  await expect(region(page, "Second editor").locator(".ck-content")).toHaveText(
    "Second editor content.",
  );
  await page
    .getByRole("button", { name: "Switch first document", exact: true })
    .click();
  await ready(page);
  await expect(first.locator(".ck-content")).toHaveText(
    "Replacement first document.",
  );
  await expect(region(page, "Second editor").locator(".ck-content")).toHaveText(
    "Second editor content.",
  );
});

test("blocks read-only edits, insertion, page changes, and source apply", async ({
  page,
}) => {
  const first = region(page);
  await page
    .getByRole("button", { name: "Toggle read only", exact: true })
    .click();
  await expect(first.locator(".ck-content")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(
    first.getByRole("button", { name: "{{host.customer}}", exact: true }),
  ).toBeDisabled();
  await expect(
    first.getByRole("button", { name: "Add page", exact: true }),
  ).toBeDisabled();
  await first.locator(".ck-content").click();
  await page.keyboard.type("Must not be inserted");
  await expect(first.locator(".ck-content")).toHaveText(
    "First editor content.",
  );
  const dialog = await openSource(first);
  await expect(
    dialog.getByRole("textbox", { name: "Document HTML" }),
  ).toHaveAttribute("readonly", "");
  await expect(
    dialog.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Clean HTML", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Toggle read only", exact: true })
    .click();
  await expect(first.locator(".ck-content")).toHaveAttribute(
    "contenteditable",
    "true",
  );
});

test("recovers layout after hidden resizing and remounting", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Hide or show first", exact: true })
    .click();
  await page.getByRole("button", { name: "Resize first", exact: true }).click();
  await page
    .getByRole("button", { name: "Hide or show first", exact: true })
    .click();
  await ready(page);
  expect(
    await region(page).evaluate((node) => [
      node.clientWidth,
      node.clientHeight,
    ]),
  ).toEqual([798, 418]);
  await expect(region(page).locator(".ck-content")).toHaveText(
    "First editor content.",
  );
  await page
    .getByRole("button", { name: "Mount or unmount first", exact: true })
    .click();
  await expect(region(page)).toHaveCount(0);
  await expect(region(page, "Second editor").locator(".ck-content")).toHaveText(
    "Second editor content.",
  );
  await page
    .getByRole("button", { name: "Mount or unmount first", exact: true })
    .click();
  await ready(page);
  await expect(region(page).locator(".ck-content")).toHaveCount(1);
});

test("cleans up when an instance unmounts during initialization", async ({
  page,
}) => {
  const portals = await page
    .locator(".ck-body-wrapper > .papercraft-editor-portal")
    .count();
  await page
    .getByRole("button", { name: "Quick mount and unmount", exact: true })
    .click();
  await expect(region(page, "Transient editor")).toHaveCount(0);
  await expect(
    page.locator(".ck-body-wrapper > .papercraft-editor-portal"),
  ).toHaveCount(portals);
  await ready(page);
  await ready(page, "second");
});
