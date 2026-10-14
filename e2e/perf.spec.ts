import { expect, test } from '@playwright/test';

test('performance: load, grid DOM size, interaction latency', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-cell="A1"]')).toBeVisible();

  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
      loadMs: Math.round(entry.loadEventEnd),
      totalDomNodes: document.querySelectorAll('*').length,
    };
  });

  const cellsInDom = await page.locator('[data-cell]').count();

  await page.locator('[data-cell="A1"]').click();
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await page.locator('[data-cell="B1"]').click();
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');

  const formulaStart = Date.now();
  await page.locator('[data-cell="C1"]').click();
  await page.keyboard.type('=A1+B1');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cell="C1"]')).toHaveText('30');
  const formulaRoundTripMs = Date.now() - formulaStart;

  const depStart = Date.now();
  await page.locator('[data-cell="A1"]').click();
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-cell="C1"]')).toHaveText('70');
  const dependencyRecalcRoundTripMs = Date.now() - depStart;

  const heapMB = await page.evaluate(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return perf.memory ? Math.round(perf.memory.usedJSHeapSize / (1024 * 1024)) : null;
  });

  console.warn(
    '[perf]',
    JSON.stringify({
      ...nav,
      cellsInDom,
      formulaRoundTripMs,
      dependencyRecalcRoundTripMs,
      heapMB,
    }),
  );

  expect(cellsInDom).toBe(2600);
  expect(formulaRoundTripMs).toBeLessThan(3000);
  expect(dependencyRecalcRoundTripMs).toBeLessThan(3000);
});
