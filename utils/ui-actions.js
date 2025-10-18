import { expect } from '@playwright/test';

export async function connectFlow(page, sels, postAction = 'none') {
  // 如需先展开账户菜单
  if (sels.accountBtn) {
    const a = await page.$(sels.accountBtn);
    if (a) await a.click();
  }
  await page.click(sels.connectBtn, { timeout: 15000 });
  // 连接后根据配置刷新 UI
  if (postAction === 'reload') {
    await page.reload();
  }
}

export async function checkinClick(page, sels) {
  if (sels.checkinBtn) {
    const b = await page.$(sels.checkinBtn);
    if (b) await b.click();
  }
}

export async function openSite(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/.+/);
}
