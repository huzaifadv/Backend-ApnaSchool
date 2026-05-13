import puppeteer from 'puppeteer';
import ejs from 'ejs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'idcards');

// Portrait templates (54mm wide × 85.6mm tall)
const PORTRAIT_TEMPLATES = new Set([
  'security-red-vertical',
  'staff-blue-teal-vertical',
  'position-holder-green',
]);

function cardSize(templateId) {
  return PORTRAIT_TEMPLATES.has(templateId)
    ? { width: '54mm', height: '85.6mm' }
    : { width: '85.6mm', height: '54mm' };
}

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function renderIdCard(templateId, data) {
  const templatePath = path.join(TEMPLATES_DIR, `${templateId}.ejs`);
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templateId}`);

  const html = await ejs.renderFile(templatePath, data, { async: false });
  const { width, height } = cardSize(templateId);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ width, height, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  } finally {
    await page.close();
  }
}

// Extract <style> block and <body> content from a full HTML doc
function splitHtml(fullHtml) {
  const styleMatch = fullHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  // Strip the `body { ... }` rule — it conflicts with the outer A4 page body
  let styles = styleMatch ? styleMatch[1] : '';
  styles = styles.replace(/(^|\s)body\s*\{[^}]*\}/g, '');

  const content = bodyMatch ? bodyMatch[1] : fullHtml;
  return { styles, content };
}

// Render multiple ID cards onto A4 pages (grid layout for printing)
export async function renderIdCardsGrid(cards) {
  if (!cards.length) throw new Error('No cards to render');

  // Render each card's HTML in parallel
  const renderedHtmls = await Promise.all(
    cards.map(({ templateId, data }) => {
      const p = path.join(TEMPLATES_DIR, `${templateId}.ejs`);
      if (!fs.existsSync(p)) throw new Error(`Template not found: ${templateId}`);
      return ejs.renderFile(p, data, { async: false });
    })
  );

  // All cards use the same template — extract styles once
  const templateStyles = splitHtml(renderedHtmls[0]).styles;
  const cardContents = renderedHtmls.map(html => splitHtml(html).content);

  const { width: cw, height: ch } = cardSize(cards[0].templateId);

  const a4Html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
    }

    .sheet {
      padding: 8mm;
      display: flex;
      flex-wrap: wrap;
      gap: 5mm;
      justify-content: flex-start;
    }

    .card-slot {
      width: ${cw};
      height: ${ch};
      overflow: hidden;
      page-break-inside: avoid;
    }

    /* ===== Embedded template styles (body rule stripped) ===== */
    ${templateStyles}
  </style>
</head>
<body>
  <div class="sheet">
    ${cardContents.map(c => `<div class="card-slot">${c}</div>`).join('')}
  </div>
</body>
</html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(a4Html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await page.close();
  }
}
