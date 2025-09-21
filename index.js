// index.js
require('dotenv').config();
const { readNames, writeRow } = require('./src/sheets/sheetsClient');
const { runFacebookAutomation, followAndScrapeCompany } = require('./src/playwright/facebook');
const { extractProfileInfo } = require('./src/claude/claudeClient');
const { searchCompanyABN } = require('./src/playwright/companySearch');

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;

// Ignore column A, start on column B
const NAMES_RANGE = 'Sheet1!B2:B'; // Only read names from column B
const OUTPUT_RANGE_PREFIX = 'Sheet1!C'; // Write results starting from column C

async function main() {
  const names = await readNames(SHEET_ID, NAMES_RANGE);
  // Process all names from row 3 (index 1) to row 142 (index 141)
  for (let i = 1; i <= 141 && i < names.length; i++) {
    const name = names[i][0];
    if (!name) continue;
    console.log(`Processing: ${name}`);
    // 1. Scrape Facebook
    let fbAutomationResult;
    try {
      fbAutomationResult = await runFacebookAutomation(name);
    } catch (e) {
      console.error('Facebook error:', e);
      continue;
    }
    const { browser, context, page, personProfile } = fbAutomationResult;
    // Build a rich string for Claude with all available info
    let fbText = '';
    if (typeof personProfile === 'object' && personProfile !== null) {
      if (personProfile.introText) fbText += `Intro section:\n${personProfile.introText}\n`;
      if (personProfile.friendsCount) fbText += `Friends/Followers: ${personProfile.friendsCount}\n`;
      if (Array.isArray(personProfile.introLinks) && personProfile.introLinks.length > 0) {
        fbText += `Links: ${personProfile.introLinks.join(', ')}\n`;
      }
    } else if (typeof personProfile === 'string') {
      fbText = personProfile;
    }
    if (!fbText) fbText = JSON.stringify(personProfile);
    // 2. Claude extraction
    let profileInfo;
    try {
      profileInfo = await extractProfileInfo(fbText);
    } catch (e) {
      console.error('Claude error:', e);
      continue;
    }
    // Print Claude response in readable format
    if (profileInfo && typeof profileInfo === 'object') {
      const out = [
        `name: ${name}`,
        `worksAt: ${profileInfo["where they work"] || ''}`,
        `companyFacebook: ${profileInfo["company's facebook page"] || ''}`,
        `companyWebsite: ${profileInfo["company's website"] || ''}`,
        `companyFollowerCount: ${profileInfo["the company's following amount (QTY)"] || ''}`,
        `linkedin: ${profileInfo["their linkedin profile"] || ''}`,
        `companyName: ${profileInfo["company's name"] || ''}`,
        `entityType: ${profileInfo["entity type"] || ''}`,
        `abnStatus: ${profileInfo["abn status"] || ''}`
      ];
      console.log(out.join(' | '));
    }

    // 3. Follow and scrape company Facebook page if available, using the same page/browser
    let companyFbInfo = {};
    const companyFacebook = profileInfo && (profileInfo.companyFacebook || profileInfo["company's facebook page"]);
    console.log('[DEBUG] companyFacebook (Claude only):', companyFacebook);
    if (companyFacebook) {
      let retry = false;
      try {
        // Open company Facebook page in a new tab
        const companyPage = await context.newPage();
        console.log('[DEBUG] Attempting to follow and scrape company Facebook page in new tab...');
        companyFbInfo = await followAndScrapeCompany(companyPage, companyFacebook);
        // Scrape company profile for business info only
        const { scrapeCompanyProfile } = require('./src/playwright/facebook');
        const companyProfile = await scrapeCompanyProfile(companyPage);
        companyFbInfo = { ...companyFbInfo, ...companyProfile };
        // Print company profile scrape results
        console.log('\n[COMPANY SCRAPE] Raw extracted fields:');
        console.log(companyProfile);
        // Prepare text for Claude (combine introText, mainText, links) -- filter out any line or link containing 'facebook' (case-insensitive)
        let companyFbText = '';
        if (companyProfile && typeof companyProfile === 'object') {
          let intro = companyProfile.introText || '';
          let main = companyProfile.mainText || '';
          // Filter out lines with 'facebook' or other unhelpful words (case-insensitive)
          const filterLine = line => {
            const l = line.trim().toLowerCase();
            return l &&
              !l.includes('facebook') &&
              !l.includes('attachment') &&
              !l.includes('see more') &&
              !l.includes('edit') &&
              !l.includes('photo') &&
              !l.includes('video') &&
              !l.includes('likes') &&
              !l.includes('comment') &&
              !l.includes('share') &&
              !l.includes('menu');
          };
          intro = intro.split('\n').filter(filterLine).join('\n');
          main = main.split('\n').filter(filterLine).join('\n');
          companyFbText += intro ? `Intro section:\n${intro}\n` : '';
          companyFbText += main ? `Main section:\n${main}\n` : '';
          if (Array.isArray(companyProfile.introLinks) && companyProfile.introLinks.length > 0) {
            const filteredLinks = companyProfile.introLinks.filter(l => !/facebook/i.test(l));
            if (filteredLinks.length > 0) {
              companyFbText += `Links: ${filteredLinks.join(', ')}\n`;
            }
          }
        } else if (typeof companyProfile === 'string') {
          companyFbText = companyProfile.split('\n').filter(line => !/facebook/i.test(line)).join('\n');
        }
        if (!companyFbText) companyFbText = JSON.stringify({
          introText: (companyProfile.introText || '').split('\n').filter(line => !/facebook/i.test(line)).join('\n'),
          introLinks: (companyProfile.introLinks || []).filter(l => !/facebook/i.test(l)),
          mainText: (companyProfile.mainText || '').split('\n').filter(line => !/facebook/i.test(line)).join('\n')
        });
        console.log('\n[COMPANY SCRAPE] Text sent to Claude:');
        console.log(companyFbText);
        // Send to Claude (for completeness, even if not used for output)
        let companyClaudeInfo = {};
        try {
          companyClaudeInfo = await extractProfileInfo(companyFbText);
        } catch (e) {
          companyClaudeInfo = { error: e.message };
        }
        // Remove irrelevant fields from Claude response
        if (companyClaudeInfo && typeof companyClaudeInfo === 'object') {
          delete companyClaudeInfo.marriedTo;
          delete companyClaudeInfo.maritalStatus;
          delete companyClaudeInfo.personFollowers;
        }
        console.log('\n[COMPANY SCRAPE] Claude response:');
        console.log(companyClaudeInfo);
        companyFbInfo = { ...companyFbInfo, ...companyClaudeInfo };
        // ABN/ABR search automation
        if (companyClaudeInfo && companyClaudeInfo.companyName) {
          const abnBrowser = await require('playwright').chromium.launch({ headless: false });
          const abnPage = await abnBrowser.newPage();
          try {
            console.log(`\n[ABN/ABR SEARCH] Searching for: ${companyClaudeInfo.companyName} at https://abr.business.gov.au/`);
            await abnPage.goto('https://abr.business.gov.au/', { waitUntil: 'domcontentloaded' });
            await abnPage.waitForSelector('input#SearchText.content-search-input', { timeout: 10000 });
            await abnPage.fill('input#SearchText.content-search-input', companyClaudeInfo.companyName);
            await abnPage.keyboard.press('Enter');
            await abnPage.waitForTimeout(3000);
            // Click the first result
            const firstResult = await abnPage.$('a[href*="/ABN/"], a[href*="/business/"], a[href*="/entity/"]');
            if (firstResult) {
              await firstResult.click();
              await abnPage.waitForTimeout(4000);
              // Scrape ABN
              let abn = null;
              const abnAnchor = await abnPage.$('a#content-main[title*="Current details for ABN"]');
              if (abnAnchor) {
                const abnTitle = await abnAnchor.getAttribute('title');
                const abnMatch = abnTitle && abnTitle.match(/ABN\s+(\d[\d ]+)/);
                if (abnMatch) abn = abnMatch[1].replace(/\s+/g, '');
              }
              // Scrape entity type
              let entityType = null;
              const entityTypeAnchor = await abnPage.$('a[href*="/Help/EntityTypeDescription"]');
              if (entityTypeAnchor) {
                entityType = await entityTypeAnchor.innerText();
              }
              // Scrape location
              let location = null;
              const locationSpan = await abnPage.$('div[itemprop="address"] span[itemprop="addressLocality"]');
              if (locationSpan) {
                location = await locationSpan.innerText();
              }
              // Scrape ABN status, start date, GST status using table rows
              let abnStatus = '';
              let abnStartDate = '';
              let gstStatus = '';
              const rows = await abnPage.$$('table tbody tr');
              for (const row of rows) {
                const th = await row.$('th');
                const td = await row.$('td');
                if (th && td) {
                  const label = (await th.innerText()).trim();
                  const value = (await td.innerText()).trim();
                  if (/^ABN status:?$/i.test(label)) {
                    abnStatus = value;
                    // Try to extract start date from status string, e.g. "Active from 29 Sep 2015"
                    const dateMatch = value.match(/from (\d{1,2}\s\w+\s\d{4})/);
                    if (dateMatch) abnStartDate = dateMatch[1];
                  }
                  if (/^Goods.*GST/i.test(label)) {
                    gstStatus = value;
                  }
                }
              }
              console.log('[ABN/ABR SEARCH] Scraped:');
              console.log({ abn, entityType, location, abnStatus, abnStartDate, gstStatus });
              // Add ABN, entityType, location, abnStatus, abnStartDate, gstStatus to companyFbInfo
              companyFbInfo.abn = abn;
              companyFbInfo.entityType = entityType;
              companyFbInfo.location = location;
              companyFbInfo.abnStatus = abnStatus;
              companyFbInfo.abnStartDate = abnStartDate;
              companyFbInfo.gstStatus = gstStatus;
            } else {
              console.log('[ABN/ABR SEARCH] No results found.');
            }
          } catch (e) {
            console.log('[ABN/ABR SEARCH] Error:', e.message);
          }
          // Keep browser open for inspection
          console.log('[ABN/ABR SEARCH] Press ENTER to close ABN/ABR browser...');
          await new Promise(resolve => {
            process.stdin.resume();
            process.stdin.once('data', () => resolve());
          });
          await abnBrowser.close();
        }
        // Check if page is closed/crashed
        if (!companyFbInfo && companyPage.isClosed && companyPage.isClosed()) {
          retry = true;
        }
        await companyPage.close();
      } catch (e) {
        const errMsg = String(e && e.message ? e.message : e);
        if (errMsg.includes('RESULT_CODE_KILLED_BAD_MESSAGE')) {
          retry = true;
        } else {
          console.error('[ERROR] Company Facebook scrape failed:', e);
          companyFbInfo = { error: e.message };
        }
      }
      if (retry) {
        console.log('[FB] Company page crashed, retrying with new browser instance...');
        try {
          const { chromium } = require('playwright');
          const browser2 = await chromium.launch({ headless: false });
          const context2 = await browser2.newContext();
          const page2 = await context2.newPage();
          if (process.env.FB_EMAIL && process.env.FB_PASSWORD) {
            await page2.goto('https://www.facebook.com/login', { waitUntil: 'networkidle' });
            await page2.fill('input[name="email"]', process.env.FB_EMAIL);
            await page2.fill('input[name="pass"]', process.env.FB_PASSWORD);
            await Promise.all([
              page2.click('button[name="login"]'),
              page2.waitForNavigation({ waitUntil: 'networkidle' })
            ]);
          }
          companyFbInfo = await followAndScrapeCompany(page2, companyFacebook);
          // Scrape company profile for business info only
          const { scrapeCompanyProfile } = require('./src/playwright/facebook');
          const companyProfile = await scrapeCompanyProfile(page2);
          companyFbInfo = { ...companyFbInfo, ...companyProfile };
          // Print company profile scrape results
          console.log('\n[COMPANY SCRAPE] Raw extracted fields:');
          console.log(companyProfile);
          // Prepare text for Claude (combine introText, mainText, links)
          let companyFbText = '';
          if (companyProfile && typeof companyProfile === 'object') {
            if (companyProfile.introText) companyFbText += `Intro section:\n${companyProfile.introText}\n`;
            if (companyProfile.mainText) companyFbText += `Main section:\n${companyProfile.mainText}\n`;
            if (Array.isArray(companyProfile.introLinks) && companyProfile.introLinks.length > 0) {
              companyFbText += `Links: ${companyProfile.introLinks.join(', ')}\n`;
            }
          } else if (typeof companyProfile === 'string') {
            companyFbText = companyProfile;
          }
          if (!companyFbText) companyFbText = JSON.stringify(companyProfile);
          console.log('\n[COMPANY SCRAPE] Text sent to Claude:');
          console.log(companyFbText);
          // Send to Claude (for completeness, even if not used for output)
          let companyClaudeInfo = {};
          try {
            companyClaudeInfo = await extractProfileInfo(companyFbText);
          } catch (e) {
            companyClaudeInfo = { error: e.message };
          }
          console.log('\n[COMPANY SCRAPE] Claude response:');
          console.log(companyClaudeInfo);
          companyFbInfo = { ...companyFbInfo, ...companyClaudeInfo };
          await browser2.close();
          console.log('[DEBUG] Company Facebook scrape result after retry:', companyFbInfo);
        } catch (e2) {
          console.error('[ERROR] Company Facebook scrape failed after retry:', e2);
          companyFbInfo = { error: e2.message };
        }
      }
    } else {
      console.log('[DEBUG] No company Facebook page found, skipping company scrape.');
    }

    // 4. Company info scraping (optional)
    let companyInfo = {};
    if (profileInfo && profileInfo["company's name"]) {
      try {
        companyInfo = await searchCompanyABN(profileInfo["company's name"]);
      } catch (e) {
        companyInfo = { error: e.message };
      }
    }
    // 4. Write results back to Sheets (combine person and company info intelligently)
    // Map output fields to the exact column letters as specified by the user
    // Only write to mapped columns, not the full row
    // Map: column letter -> value
    const colMap = {
      C: companyFbInfo.companyName || '',
      K: profileInfo['job role'] || personProfile.jobRole || '',
      N: companyFbInfo.website || profileInfo["company's website"] || '',
      P: companyFbInfo.profileUrl || profileInfo["company's facebook page"] || '',
      Q: companyFbInfo.followersQty || '',
      R: companyFbInfo.followersVisible || '',
      S: companyFbInfo.followingQty || '',
      T: personProfile.profileUrl || profileInfo["facebook personal profile"] || '',
      V: personProfile.friendsCount || '',
      W: personProfile.followersVisible || '',
      X: personProfile.followersVisible || '',
      AC: companyFbInfo.companyName || '',
      AD: companyFbInfo.abn || '',
      AE: companyFbInfo.entityType || '',
      AF: companyFbInfo.abnStatus || '',
      AG: companyFbInfo.abnStartDate || '',
      AH: companyFbInfo.gstStatus || '',
      AI: companyFbInfo.gstStatus || '',
      AJ: companyFbInfo.location || ''
    };
    // Print debug info for each field
    Object.entries(colMap).forEach(([col, value]) => {
      console.log(`[DEBUG] Field ${col}:`, value);
    });
    // Prepare batch update requests for each mapped column
    const requests = Object.entries(colMap).map(([col, value]) => ({
      range: `Sheet1!${col}${i + 2}`,
      values: [[value]]
    }));
    for (const req of requests) {
      console.log('[DEBUG] Writing to Sheets:', req.range, req.values);
      await writeRow(SHEET_ID, req.range, req.values[0]);
    }
    console.log(`Done: ${name}`);
    // Close browser after all scraping is done, but do not block Sheets write
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('[INFO] Browser close error:', e.message);
      }
    }
  }
}

main();
