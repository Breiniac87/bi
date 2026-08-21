const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3000');
  
  // Wait for network idle to make sure charts render
  await new Promise(r => setTimeout(r, 2000));
  
  await page.screenshot({ path: '/Users/tony/.gemini/antigravity-ide/brain/f4af097e-e96c-4c68-9385-63fbf0f6afad/latest_dashboard.png', fullPage: true });
  await browser.close();
})();
