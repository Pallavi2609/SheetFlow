import { expect, test, type Page } from '@playwright/test';

const cell = (page: Page, addr: string) => page.locator(`[data-cell="${addr}"]`);
const status = (page: Page) => page.locator('[data-testid="active-cell"]');
const formulaBar = (page: Page) => page.getByLabel('Formula bar');

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(status(page)).toHaveText('A1');
}

async function typeInCell(page: Page, addr: string, text: string) {
  await cell(page, addr).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test.describe('SheetFlow end-to-end', () => {
  test('1. application loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await fresh(page);

    await expect(page.getByRole('heading', { name: 'SheetFlow' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(formulaBar(page)).toBeVisible();
    await expect(page.getByRole('grid', { name: 'Spreadsheet grid' })).toBeVisible();
    await expect(page.locator('[data-testid="grid-dimensions"]')).toHaveText('100 rows × 26 columns');
    expect(errors).toEqual([]);
  });

  test('2. cell editing stores values', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '10');
    await typeInCell(page, 'B1', '20');
    await expect(cell(page, 'A1')).toHaveText('10');
    await expect(cell(page, 'B1')).toHaveText('20');
  });

  test('3. formula evaluation and raw preservation', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '10');
    await typeInCell(page, 'B1', '20');
    await typeInCell(page, 'C1', '=A1+B1');
    await expect(cell(page, 'C1')).toHaveText('30');
    await cell(page, 'C1').click();
    await expect(formulaBar(page)).toHaveValue('=A1+B1');
  });

  test('4. dependent cells recalculate automatically', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '10');
    await typeInCell(page, 'B1', '20');
    await typeInCell(page, 'C1', '=A1+B1');
    await typeInCell(page, 'A1', '50');
    await expect(cell(page, 'C1')).toHaveText('70');
  });

  test('5. undo and redo update dependent formulas', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '10');
    await typeInCell(page, 'B1', '20');
    await typeInCell(page, 'C1', '=A1+B1');
    await typeInCell(page, 'A1', '50');
    await typeInCell(page, 'B1', '40');
    await expect(cell(page, 'C1')).toHaveText('90');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(cell(page, 'C1')).toHaveText('70');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(cell(page, 'C1')).toHaveText('90');
  });

  test('6. invalid formula shows an error and stays responsive', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '5');
    await typeInCell(page, 'A2', '=A1/0');
    await expect(cell(page, 'A2')).toHaveText('#DIV/0!');
    await typeInCell(page, 'A3', '7');
    await expect(cell(page, 'A3')).toHaveText('7');
  });

  test('7. circular references error without freezing', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'D1', '=E1');
    await typeInCell(page, 'E1', '=D1');
    await expect(cell(page, 'D1')).toHaveText('#CYCLE!');
    await expect(cell(page, 'E1')).toHaveText('#CYCLE!');
    await typeInCell(page, 'E1', '2');
    await expect(cell(page, 'D1')).toHaveText('2');
  });

  test('8. SUM over a range', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '1');
    await typeInCell(page, 'A2', '2');
    await typeInCell(page, 'A3', '3');
    await typeInCell(page, 'A4', '4');
    await typeInCell(page, 'A5', '5');
    await typeInCell(page, 'C1', '=SUM(A1:A5)');
    await expect(cell(page, 'C1')).toHaveText('15');
  });

  test('9. keyboard navigation and normal typing in inputs', async ({ page }) => {
    await fresh(page);
    await page.keyboard.press('ArrowRight');
    await expect(status(page)).toHaveText('B1');
    await page.keyboard.press('ArrowDown');
    await expect(status(page)).toHaveText('B2');
    await page.keyboard.press('Tab');
    await expect(status(page)).toHaveText('C2');
    await page.keyboard.press('Shift+Tab');
    await expect(status(page)).toHaveText('B2');

    await cell(page, 'A1').click();
    await page.keyboard.press('F2');
    await expect(page.getByLabel('Edit cell A1')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Edit cell A1')).toHaveCount(0);

    await formulaBar(page).click();
    await formulaBar(page).fill('hello');
    await expect(formulaBar(page)).toHaveValue('hello');
  });

  test('10. clipboard copy and paste', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '99');
    await cell(page, 'A1').click();
    await page.keyboard.press('Control+c');
    await cell(page, 'C3').click();
    await page.keyboard.press('Control+v');
    await expect(cell(page, 'C3')).toHaveText('99');
  });

  test('10b. multi-cell paste from the system clipboard', async ({ page }) => {
    await fresh(page);
    await page.evaluate(() => navigator.clipboard.writeText('1\t2\n3\t4'));
    await cell(page, 'A1').click();
    await page.keyboard.press('Control+v');
    await expect(cell(page, 'A1')).toHaveText('1');
    await expect(cell(page, 'B1')).toHaveText('2');
    await expect(cell(page, 'A2')).toHaveText('3');
    await expect(cell(page, 'B2')).toHaveText('4');
  });

  test('11. data persists across a real page reload', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '10');
    await typeInCell(page, 'B1', '=A1*4');
    await page.reload();
    await expect(cell(page, 'A1')).toHaveText('10');
    await expect(cell(page, 'B1')).toHaveText('40');
  });

  test('12. reset requires confirmation and survives a refresh', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '7');

    let accept = false;
    page.on('dialog', (dialog) => (accept ? dialog.accept() : dialog.dismiss()));

    await page.getByRole('button', { name: 'Reset spreadsheet' }).click();
    await expect(cell(page, 'A1')).toHaveText('7');

    accept = true;
    await page.getByRole('button', { name: 'Reset spreadsheet' }).click();
    await expect(cell(page, 'A1')).toHaveText('');

    await page.reload();
    await expect(cell(page, 'A1')).toHaveText('');
  });

  test('13. CSV export downloads a file', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', 'x');
    await typeInCell(page, 'B1', 'y');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('sheetflow.csv');
  });

  test('14. CSV import populates the grid', async ({ page }) => {
    await fresh(page);
    await page.setInputFiles('input[type="file"]', {
      name: 'import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('1,2\n3,"a,b"'),
    });
    await expect(cell(page, 'A1')).toHaveText('1');
    await expect(cell(page, 'B1')).toHaveText('2');
    await expect(cell(page, 'A2')).toHaveText('3');
    await expect(cell(page, 'B2')).toHaveText('a,b');
  });

  test('15. fill handle copies a value down', async ({ page }) => {
    await fresh(page);
    await typeInCell(page, 'A1', '5');
    await cell(page, 'A1').click();

    const handle = page.getByTestId('fill-handle-A1');
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const target = await cell(page, 'A3').boundingBox();
    await page.mouse.move(target!.x + 10, target!.y + 10, { steps: 5 });
    await page.mouse.up();

    await expect(cell(page, 'A2')).toHaveText('5');
    await expect(cell(page, 'A3')).toHaveText('5');
  });

  test('16. responsive layout has no page overflow', async ({ page }) => {
    await fresh(page);
    for (const size of [
      { width: 320, height: 700 },
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${size.width}px`).toBeLessThanOrEqual(1);
      await expect(formulaBar(page)).toBeVisible();
      await expect(page.locator('[data-testid="grid-scroll"]')).toBeVisible();
    }
  });

  test('17. accessibility: focus, live status, dialog focus management', async ({ page }) => {
    await fresh(page);
    const grid = page.getByRole('grid', { name: 'Spreadsheet grid' });
    await expect(grid).toHaveAttribute('aria-activedescendant', 'cell-A1');
    await page.keyboard.press('ArrowRight');
    await expect(grid).toHaveAttribute('aria-activedescendant', 'cell-B1');

    await page.getByRole('button', { name: 'Keyboard shortcuts help' }).click();
    const dialog = page.getByTestId('shortcuts-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(grid).toBeFocused();
  });

  test('18. column resize changes header width', async ({ page }) => {
    await fresh(page);
    const before = await page.locator('th', { hasText: /^A$/ }).boundingBox();
    const resizer = page.getByTestId('col-resize-0');
    const box = await resizer.boundingBox();
    expect(box).not.toBeNull();
    if (!box || !before) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    const after = await page.locator('th', { hasText: /^A$/ }).boundingBox();
    expect(after!.width).toBeGreaterThan(before.width + 40);
  });
});
