export async function enterBattle(page) {
  await page.locator('#platform-root').waitFor();
  if (await page.locator('#table').isVisible()) return;
  await page.locator('#platform-go-battle').click();
  await page.locator('#table').waitFor({ state: 'visible' });
}
