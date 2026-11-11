import { logger } from "#/utils/logger";
import puppeteer from "puppeteer";

export type HtmlToPdfMargin = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
};

export type HtmlToPdfOptions = {
  format?: "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid";
  landscape?: boolean;
  margin?: HtmlToPdfMargin;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  scale?: number;
};

const IMAGES_READY_SCRIPT = "Array.from(document.querySelectorAll('img')).every((img) => img.complete && img.naturalHeight !== 0)";

const DEFAULT_MARGIN = "10mm";

export const renderHtmlToPdf = async (html: string, options: HtmlToPdfOptions = {}): Promise<Buffer> => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");

    // Wait for all images to load, without blocking generation on timeout:
    const [imagesResult] = await Promise.allSettled([
      page.waitForFunction(IMAGES_READY_SCRIPT, { timeout: 10_000 }),
    ]);

    if (imagesResult.status === "rejected") {
      logger.warn("Some images may not have loaded completely during PDF generation");
    }

    const pdf = await page.pdf({
      format: options.format ?? "A4",
      landscape: options.landscape ?? false,
      margin: {
        top: options.margin?.top ?? DEFAULT_MARGIN,
        right: options.margin?.right ?? DEFAULT_MARGIN,
        bottom: options.margin?.bottom ?? DEFAULT_MARGIN,
        left: options.margin?.left ?? DEFAULT_MARGIN,
      },
      printBackground: options.printBackground !== false,
      displayHeaderFooter: options.displayHeaderFooter ?? false,
      headerTemplate: options.headerTemplate ?? "",
      footerTemplate: options.footerTemplate ?? "",
      scale: options.scale ?? 1,
      preferCSSPageSize: false,
    });

    return Buffer.from(pdf);
  }
  finally {
    await browser.close();
  }
};
