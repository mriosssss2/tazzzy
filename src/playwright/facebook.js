// Scrape company Facebook page for business info, using robust logic similar to person scraping
async function scrapeCompanyProfile(page) {
  await page.waitForTimeout(2000);
  // Try to extract left sidebar/intro section (like person)
  let introText = '';
  let introLinks = [];
  const sidebarSelectors = [
    'div[data-testid="profile_intro_card"]',
    'div:has-text("Intro")',
    'aside',
    'section:has-text("Intro")',
    'div[role="complementary"]',
    'div[aria-label*="Intro" i]'
  ];
  for (const sel of sidebarSelectors) {
    const sidebar = await page.$(sel);
    if (sidebar) {
      const introData = await sidebar.evaluate(el => {
        let texts = [];
        let links = [];
        function collect(node) {
          if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') return;
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            texts.push(node.textContent.trim());
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'A' && node.href) links.push(node.href);
            if (window.getComputedStyle(node).display !== 'none') {
              for (const child of node.childNodes) collect(child);
            }
          }
        }
        collect(el);
        return { text: texts.join('\n'), links };
      });
      introText = introData.text;
      introLinks = introData.links;
      break;
    }
  }
  // Extract all visible text and links from main area
  const main = await page.$('div[role="main"]') || await page.$('body');
  let mainText = '';
  let mainLinks = [];
  if (main) {
    mainText = await main.evaluate(el => el.innerText || '');
    mainLinks = await main.evaluate(el => Array.from(el.querySelectorAll('a')).map(a => a.href));
  }
  // Combine all text for regex extraction
  const allText = [introText, mainText].filter(Boolean).join('\n');
  const allLinks = [...introLinks, ...mainLinks];
  // Extract emails, phones, websites
  const emails = Array.from(new Set((allText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])));
  const phones = Array.from(new Set((allText.match(/\+?\d[\d\s().-]{7,}\d/g) || [])));
  const websites = Array.from(new Set([
    ...(allText.match(/https?:\/\/[\w.-]+\.[a-z]{2,}(?:[\/\w\-?=&#%]*)?/gi) || []),
    ...allLinks.filter(l => /https?:\/\//.test(l) && !l.includes('facebook.com'))
  ]));
  // Followers QTY
  let followersQty = null;
  const followersMatch = allText.match(/([\d,.]+)\s+followers/i);
  if (followersMatch) followersQty = followersMatch[1];
  // Only extract followers QTY and visibility
  let followersVisible = followersQty ? 'y' : 'n';
  return {
    introText,
    introLinks,
    emails,
    phones,
    websites,
    followersQty,
    followersVisible,
    mainText
  };
}
// src/playwright/facebook.js
const { chromium } = require('playwright');
require('dotenv').config();


const fs = require('fs');
const path = require('path');
const STORAGE_STATE = path.resolve(__dirname, 'fb_storage.json');

async function loginFacebook(page) {
  await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', process.env.FB_EMAIL);
  await page.fill('input[name="pass"]', process.env.FB_PASSWORD);
  await Promise.all([
    page.click('button[name="login"]'),
    page.waitForNavigation({ waitUntil: 'networkidle' })
  ]);
  // Give user time to solve captcha if present
  console.log('If you see a captcha, please solve it in the browser. Press ENTER here when done.');
  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });
  // Save login state
  await page.context().storageState({ path: STORAGE_STATE });
}

async function searchProfile(page, name) {
  console.log(`[FB] Searching for: ${name}`);
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  // Try aria-label first (like in your working script)
  let searchInput = null;
  try {
    searchInput = await page.locator('input[aria-label="Search Facebook"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.click({ delay: 200 });
      for (const char of name) {
        await searchInput.type(char, { delay: 100 + Math.floor(Math.random() * 100) });
      }
      await page.waitForTimeout(400 + Math.random() * 400);
      await searchInput.press('Enter');
    } else {
      searchInput = null;
    }
  } catch (e) {
    searchInput = null;
  }
  // Fallback: try placeholder
  if (!searchInput) {
    const locator = page.locator('input[placeholder]');
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const input = locator.nth(i);
      const ph = await input.getAttribute('placeholder');
      if (ph && /search facebook/i.test(ph)) {
        await input.click({ delay: 200 });
        for (const char of name) {
          await input.type(char, { delay: 100 + Math.floor(Math.random() * 100) });
        }
        await page.waitForTimeout(400 + Math.random() * 400);
        await input.press('Enter');
        searchInput = input;
        break;
      }
    }
  }
  if (!searchInput) {
    throw new Error('Search input with aria-label or placeholder "Search Facebook" not found.');
  }
  await page.waitForTimeout(3500);
  console.log('[FB] Search results loaded, attempting to click first profile...');
  // Click on People tab if available (using hasText selector)
    // (People tab click removed as requested)
  // Try provided selector for the first profile result
  let clicked = false;
  // (People tab click removed as requested)
  try {
    const selector = '#mount_0_0_iZ > div > div:nth-child(1) > div > div.x9f619.x1n2onr6.x1ja2u2z > div > div > div.x78zum5.xdt5ytf.x1t2pt76.x1n2onr6.x1ja2u2z.x10cihs4 > div.x9f619.x2lah0s.x1nhvcw1.x1qjc9v5.xozqiw3.x1q0g3np.x78zum5.x1iyjqo2.x1t2pt76.x1n2onr6.x1ja2u2z.x1h6rjhl > div.x9f619.x1n2onr6.x1ja2u2z.xdt5ytf.x193iq5w.xeuugli.x1r8uery.x1iyjqo2.xs83m0k.x78zum5.x1t2pt76 > div > div > div > div > div > div:nth-child(1) > div > div > div > div > div > div > div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl > div > div > div:nth-child(1)';
    const firstProfileDiv = await page.$(selector);
    if (firstProfileDiv) {
      console.log('[DEBUG] Found first profile div with selector:', selector);
      await firstProfileDiv.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await firstProfileDiv.click({ force: true });
      console.log('[DEBUG] Clicked first profile div.');
      await page.waitForTimeout(3000);
      clicked = true;
      console.log('[FB] Clicked first profile using selector.');
    } else {
      console.log('[DEBUG] Selector did not match any element:', selector);
      console.log('[FB] Selector did not match, will try anchor fallback.');
    }
  } catch (e) {
    console.log('[DEBUG] Error using selector for first profile:', e.message);
    console.log('[FB] Error using selector, will try anchor fallback.');
  }
  // Fallback: anchor logic if selector fails
  if (!clicked) {
    const searchName = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const nameAnchors = await page.locator('a', { hasText: name }).all();
    console.log(`[FB] Found ${nameAnchors.length} anchors with name text.`);
    for (let i = 0; i < nameAnchors.length; i++) {
      const anchor = nameAnchors[i];
      const linkText = (await anchor.textContent() || '').toLowerCase().trim();
      const href = await anchor.getAttribute('href') || '';
      console.log(`Candidate anchor ${i}: text='${linkText}', href='${href}'`);
      if (
        href && (
          href.includes('/profile.php') ||
          href.includes('/people/') ||
          (/^https:\/\/www\.facebook\.com\/[a-zA-Z0-9\.]+$/.test(href))
        )
      ) {
        console.log(`[FB] Clicking anchor ${i}: ${href}`);
        await anchor.scrollIntoViewIfNeeded();
        await anchor.hover();
        await anchor.click({ force: true });
        await page.waitForTimeout(3000);
        clicked = true;
        break;
      }
    }
    // Fallback: always click the first anchor with a valid profile-like href if no match above
    if (!clicked) {
      const allAnchors = await page.$$('a');
      console.log(`[FB] Fallback: checking all ${allAnchors.length} anchors for profile-like hrefs.`);
      for (let i = 0; i < allAnchors.length; i++) {
        const anchor = allAnchors[i];
        const href = await anchor.getAttribute('href') || '';
        const linkText = (await anchor.textContent() || '').toLowerCase().trim();
        console.log(`Fallback anchor ${i}: text='${linkText}', href='${href}'`);
        if (
          href && (
            href.includes('/profile.php') ||
            href.includes('/people/') ||
            (/^https:\/\/www\.facebook\.com\/[a-zA-Z0-9\.]+$/.test(href))
          )
        ) {
          console.log(`[FB] Fallback: clicking anchor ${i}: ${href}`);
          await anchor.scrollIntoViewIfNeeded();
          await anchor.hover();
          await anchor.click({ force: true });
          await page.waitForTimeout(3000);
          break;
        }
      }
    }
  }
  if (!clicked) {
    console.log('[FB] No suitable profile anchor found to click.');
  } else {
    console.log('[FB] Navigated to profile page.');
  }
}

async function scrapeProfile(page) {
  console.log('[FB] Scraping profile...');
  // Wait for the profile main content to load
  await page.waitForTimeout(3000);
  // Only proceed if on a profile page (URL contains /profile.php or /people/ or /[a-zA-Z0-9.]+$)
  const url = page.url();
  if (!/facebook\.com\/(profile\.php|people|[a-zA-Z0-9.]+$)/.test(url)) {
    console.log('[FB] Not on a profile page, skipping scrape. Current URL:', url);
    return { error: 'Not on a profile page', url };
  }
  try {
    await page.waitForSelector('div[data-testid="profile_intro_card"], div:has-text("Intro")', { timeout: 7000 });
    console.log('[FB] Profile main content loaded.');
  } catch (e) {
    // Ignore timeout, continue
  }

    // Try to robustly extract the left-hand sidebar/intro section
    let introText = '';
    let introLinks = [];
    let introDebugHtml = '';
    // Try common selectors for left sidebar/intro
    const sidebarSelectors = [
      'div[data-testid="profile_intro_card"]',
      'div:has-text("Intro")',
      'aside',
      'section:has-text("Intro")',
      'div[role="complementary"]',
      'div[aria-label*="Intro" i]'
    ];
    let foundSidebar = false;
    for (const sel of sidebarSelectors) {
      const sidebar = await page.$(sel);
      if (sidebar) {
        foundSidebar = true;
        // Log debug HTML for diagnosis
        introDebugHtml = await sidebar.evaluate(el => el.outerHTML);
        // Extract all visible text and links except the heading itself
        const introData = await sidebar.evaluate(el => {
          let texts = [];
          let links = [];
          function collect(node) {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
              // Ignore images
              return;
            }
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              texts.push(node.textContent.trim());
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'A' && node.href) {
                links.push(node.href);
              }
              if (window.getComputedStyle(node).display !== 'none') {
                for (const child of node.childNodes) {
                  collect(child);
                }
              }
            }
          }
          collect(el);
          return { text: texts.join('\n'), links };
        });
        introText = introData.text;
        introLinks = introData.links;
        break;
      }
    }
    if (foundSidebar) {
      console.log('[FB] Extracted Intro/Sidebar text:', introText);
      console.log('[FB] Extracted Intro/Sidebar links:', introLinks);
      // Optionally log debug HTML for diagnosis
      // console.log('[FB] Sidebar HTML:', introDebugHtml);
    } else {
      // Fallback: try previous heading-based logic
      const introHeading = page.locator('xpath=//h2[contains(., "Intro") or contains(., "intro")]');
      if (await introHeading.count() > 0) {
        console.log('[FB] Found Intro heading (fallback).');
        const introDiv = await introHeading.first().evaluateHandle(h => {
          let el = h;
          while (el && el.tagName !== 'DIV') el = el.parentElement;
          return el;
        });
        const introData = await introDiv.evaluate(el => {
          let texts = [];
          let links = [];
          function collect(node) {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
              // Ignore images
              return;
            }
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              texts.push(node.textContent.trim());
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'A' && node.href) {
                links.push(node.href);
              }
              if (window.getComputedStyle(node).display !== 'none') {
                for (const child of node.childNodes) {
                  collect(child);
                }
              }
            }
          }
          collect(el);
          return { text: texts.join('\n'), links };
        });
        introText = introData.text;
        introLinks = introData.links;
        console.log('[FB] Extracted Intro text (fallback):', introText);
        console.log('[FB] Extracted Intro links (fallback):', introLinks);
      } else {
        console.log('[FB] No Intro/Sidebar found.');
      }
    }

    // Always extract all visible text and hyperlinks from the main profile area for Claude
    let mainProfileText = '';
    let mainProfileLinks = [];
    let relationshipText = '';
    const mainDiv = await page.$('div[role="main"]');
    if (mainDiv) {
      // Extract all visible text, filtering out header/nav/footer UI elements and unwanted lines
      mainProfileText = await mainDiv.evaluate(el => {
        // Remove header/nav/footer/sidebars if present
        const removeSelectors = [
          'header',
          'nav',
          'footer',
          '[role="navigation"]',
          '[role="banner"]',
          '[role="complementary"]',
          '[aria-label*="Facebook" i]',
          '[aria-label*="Menu" i]',
          '[aria-label*="Navigation" i]',
          '[aria-label*="Stories" i]',
          '[aria-label*="Create" i]',
          '[aria-label*="Search" i]',
          '[aria-label*="Account" i]',
          '[aria-label*="Messenger" i]',
          '[aria-label*="Notifications" i]',
          '[aria-label*="Shortcuts" i]',
          '[aria-label*="Your profile" i]',
          '[aria-label*="Home" i]',
          '[aria-label*="Watch" i]',
          '[aria-label*="Groups" i]',
          '[aria-label*="Marketplace" i]',
          '[aria-label*="Menu" i]'
        ];
        removeSelectors.forEach(sel => {
          el.querySelectorAll(sel).forEach(e => e.remove());
        });
        // Get all visible text
        let text = el.innerText;
        // Filter out lines containing 'facebook', 'news', or 'feed' (case-insensitive)
        let lines = text.split('\n').filter(line => {
          const l = line.toLowerCase();
          if (l.includes('facebook') || l.includes('news') || l.includes('feed')) return false;
          // Ignore empty or very short lines
          if (l.trim().length < 2) return false;
          return true;
        });
        return lines.join('\n');
      });
      // Extract all hyperlinks (text + href)
      mainProfileLinks = await mainDiv.evaluate(el => {
        const links = [];
        el.querySelectorAll('a').forEach(a => {
          if (a.offsetParent !== null && a.href) {
            links.push({ text: a.innerText.trim(), href: a.href });
          }
        });
        return links;
      });
      // Try to extract relationship/married info from visible text
      const relMatch = mainProfileText.match(/married to ([^\n]+)/i) || mainProfileText.match(/in a relationship with ([^\n]+)/i);
      if (relMatch) {
        relationshipText = relMatch[0];
      }
      console.log('[FB] Extracted ALL main profile text:', mainProfileText);
      console.log('[FB] Extracted ALL main profile links:', mainProfileLinks);
      if (relationshipText) console.log('[FB] Extracted relationship info:', relationshipText);
    } else {
      console.log('[FB] No main profile div found.');
    }
    // Try to extract friends/followers count
    let friendsCount = '';
    try {
      const friendsSpan = page.locator('xpath=//span[contains(., "friends") or contains(., "Followers") or contains(., "followers")]');
      if (await friendsSpan.count() > 0) {
        friendsCount = await friendsSpan.first().evaluate(el => el.innerText);
        console.log('[FB] Extracted friends/followers count:', friendsCount);
      } else {
        console.log('[FB] No friends/followers span found.');
      }
    } catch (e) {
      console.log('[FB] Error extracting friends/followers count:', e);
    }
  // Return all scraped info for Claude
  return {
    introText,
    introLinks,
    friendsCount,
    mainProfileText,
    mainProfileLinks,
    relationshipText
  };
}


async function runFacebookAutomation(name) {
  const browser = await chromium.launch({ headless: false });
  let context;
  if (fs.existsSync(STORAGE_STATE)) {
    context = await browser.newContext({ storageState: STORAGE_STATE });
  } else {
    context = await browser.newContext();
  }
  const page = await context.newPage();
  if (!fs.existsSync(STORAGE_STATE)) {
    await loginFacebook(page);
  }
  await searchProfile(page, name);
  const personProfile = await scrapeProfile(page);
  // Return browser, context, page, and personProfile for further use
  return { browser, context, page, personProfile };
}


async function followAndScrapeCompany(page, companyFacebookUrl) {
  if (!companyFacebookUrl) return null;
  let attempt = 0;
  while (attempt < 2) {
    try {
      await page.goto(companyFacebookUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
  // Do NOT click the Follow button, just scrape the page
      // Extract followers QTY
      let followersQty = null;
      let followersVisible = 'n';
      let followingList = [];
      // Try to find followers count
      const followersElem = await page.$('div:has-text("followers")');
      if (followersElem) {
        const text = await followersElem.innerText();
        const match = text.match(/([\d,.]+)\s+followers/i);
        if (match) {
          followersQty = match[1];
          followersVisible = 'y';
        }
      }
      // Do NOT click or scrape the following list, just return followers info
      return {
        followersQty,
        followersVisible
      };
    } catch (e) {
      const errMsg = String(e && e.message ? e.message : e);
      console.log('[FB] Error scraping company page:', errMsg);
      if (errMsg.includes('RESULT_CODE_KILLED_BAD_MESSAGE') && attempt === 0) {
        console.log('[FB] Detected RESULT_CODE_KILLED_BAD_MESSAGE, reloading page and retrying...');
        attempt++;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        continue;
      }
      return null;
    }
  }
  return null;
}

module.exports = { runFacebookAutomation, followAndScrapeCompany, scrapeProfile, scrapeCompanyProfile };
