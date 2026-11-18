import { logger } from "#/utils/logger";
import { existsSync } from "node:fs";
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

// System browser locations, checked when Puppeteer's environment variable is missing or invalid (e.g. in Docker images built from an older configuration):
const SYSTEM_BROWSER_PATHS = [
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
] as const;

// Resolve the browser executable to launch: prefer Puppeteer's environment variable, then system-installed browsers on Linux.
// Returning undefined lets Puppeteer use its own downloaded Chrome (dev environments):
const resolveBrowserExecutablePath = (): string | undefined => {
  const fromEnvironment = process.env.PUPPETEER_EXECUTABLE_PATH;

  if (fromEnvironment !== undefined && existsSync(fromEnvironment)) {
    return fromEnvironment;
  }

  if (process.platform !== "linux") {
    return undefined;
  }

  const systemPath = SYSTEM_BROWSER_PATHS.find((candidatePath) => existsSync(candidatePath));

  if (systemPath === undefined) {
    throw new Error("No Chrome or Chromium executable found on this system: install Chromium or set PUPPETEER_EXECUTABLE_PATH");
  }

  return systemPath;
};

export const renderHtmlToPdf = async (html: string, options: HtmlToPdfOptions = {}): Promise<Buffer> => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveBrowserExecutablePath(),
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
