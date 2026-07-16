// One-off Midjourney CDN scraper. selenium-webdriver and chromedriver are NOT
// in package.json (dropped 2026-07-16 — they pulled in every vulnerability the
// repo had). To run this again: npm i --no-save selenium-webdriver chromedriver
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const URL_TEMPLATE = 'https://cdn.midjourney.com/${uuid}/0_${index}.png';
const outputDir = process.env.MIDJOURNEY_OUTPUT_DIR || join(process.cwd(), 'mj_output');

if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
}

// Read the UUIDs from the log file
const logFilePath = join(process.cwd(), 'midjourney-UUIDs.log');
const uuids = readFileSync(logFilePath, 'utf-8').split('\n').filter(Boolean);

// Remove duplicates from uuids
const uniqueUuids = [...new Set(uuids)];

// Generate URLs
const urls = uniqueUuids.flatMap(uuid =>
    [0, 1, 2, 3].map(index => ({
        url: URL_TEMPLATE.replace('${uuid}', uuid).replace('${index}', index),
        uuid,
        index
    }))
);
let driver = await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options()).build();
// Function to download a file using Selenium
async function downloadFile(url, filePath) {
    try {
        console.log(`Downloading ${url} to ${filePath}`);
        await driver.get(url);

        // Find the image element and fetch its data as a base64 encoded string
        const imageElement = await driver.findElement(By.tagName('img'));
        const imageBase64 = await imageElement.takeScreenshot(); // This will take a screenshot of the image element

        // Convert the base64 string to a Buffer and save it as a file
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        writeFileSync(filePath, imageBuffer);
        console.log(`Downloaded ${url} to ${filePath}`);
    } catch (error) {
        console.error(`Failed to download ${url}:`, error);
    }
}

// Download the files one at a time
(async () => {
    for (const { url, uuid, index } of urls) {
        const fileName = `${uuid}_${index}.png`;
        const filePath = join(outputDir, fileName);
        console.log(`Downloading ${url} to ${filePath}`);
        await downloadFile(url, filePath);
    }
    console.log('All files downloaded.');
})();

/*(async () => {
    const u = urls[0];
    const fileName = `${u.uuid}_${u.index}.png`;
    const filePath = join(outputDir, fileName);
    console.log(`Downloading ${u.url} to ${filePath}`);
    await downloadFile(u.url, filePath);

    console.log('All files downloaded.');
})();*/