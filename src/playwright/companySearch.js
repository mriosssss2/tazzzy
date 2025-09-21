// src/playwright/companySearch.js
const { chromium } = require('playwright');

/**
 * Search for a company on abn.business.gov.au and scrape public info.
 * @param {string} companyName
 * @returns {Promise<object>} Scraped company info or error
 */
async function searchCompanyABN(companyName) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('https://abr.business.gov.au/', { waitUntil: 'networkidle' });
    await page.fill('input[name="SearchText"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    // Scrape first result if available
    const resultSelector = 'a[href*="/ABN/"], a[href*="/ACN/"]';
    const firstResult = await page.$(resultSelector);
    if (firstResult) {
      await firstResult.click();
      await page.waitForTimeout(2000);
      // Scrape summary info
      const abn = await page.textContent('dt:has-text("ABN") + dd');
      const entityType = await page.textContent('dt:has-text("Entity type") + dd');
      const status = await page.textContent('dt:has-text("Status") + dd');
      const name = await page.textContent('h1');
      await browser.close();
      return { abn, entityType, status, name };
    } else {
      await browser.close();
      return { error: 'No company found.' };
    }
  } catch (e) {
    await browser.close();
    return { error: e.message };
  }
}

module.exports = { searchCompanyABN };
