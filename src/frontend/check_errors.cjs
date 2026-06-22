const puppeteer = require('puppeteer');
(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
        
        await page.goto('http://localhost:3000/alarms', {waitUntil: 'networkidle0'});
        
        await browser.close();
    } catch (e) {
        console.error("SCRIPT ERROR:", e.message);
    }
})();
