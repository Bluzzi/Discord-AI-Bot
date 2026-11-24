import { Readability } from "@mozilla/readability";
import { parseWebUrl } from "#/utils/public-web";
import { JSDOM, VirtualConsole } from "jsdom";
import TurndownService from "turndown";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.remove("img");
turndown.addRule("plainLinkText", { filter: "a", replacement: (content) => content });

const unwantedElements = [
  "script",
  "style",
  "noscript",
  "template",
  "nav",
  "footer",
  "aside",
  "form",
  "dialog",
  "iframe",
  "svg",
  "[hidden]",
  "[aria-hidden='true']",
  "[role='navigation']",
  "[role='dialog']",
  "[aria-modal='true']",
  "[id*='cookie-banner' i]",
  "[class*='cookie-banner' i]",
  "[id*='cookie-consent' i]",
  "[class*='cookie-consent' i]",
  "[id*='popup' i]",
  "[class~='popup' i]",
].join(", ");

const socialHost = /(?:^|\.)(?:facebook\.com|instagram\.com|linkedin\.com|pinterest\.com|tiktok\.com|twitter\.com|x\.com)$/iu;
const unwantedPath = /(?:^|\/)(?:log[-_]?in|sign[-_]?in|log[-_]?out|sign[-_]?up|register|oauth2?|share|tracking)(?:\/|\.|$)/iu;
const trackingParam = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_[ce]id)$/iu;
const compact = (text: string, max: number) => text.replace(/\s+/gu, " ").trim().slice(0, max);

const collectLinks = (root: Element, navigation: HTMLAnchorElement[], pageUrl: URL, baseUrl: URL) => {
  const links = new Map<string, { text: string; url: string }>();
  for (const anchor of [...root.querySelectorAll<HTMLAnchorElement>("a[href]"), ...navigation]) {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!href || href.startsWith("#") || anchor.hasAttribute("download")) continue;
    const url = parseWebUrl(href, baseUrl);
    if (url === null || url.port || socialHost.test(url.hostname) || unwantedPath.test(url.pathname)) continue;
    const trackingKeys = [...url.searchParams.keys()].filter((key) => trackingParam.test(key));
    for (const key of trackingKeys) url.searchParams.delete(key);
    if (url.href === pageUrl.href) continue;

    const text = compact(anchor.textContent, 140) || compact(anchor.getAttribute("aria-label") ?? "", 140);
    if (!text) continue;
    if (!links.has(url.href)) links.set(url.href, { text, url: url.href });
    if (links.size === 24) break;
  }
  return [...links.values()];
};

const decodeText = (bytes: Buffer, contentType: string) => {
  const charset = (/;\s*charset\s*=\s*["']?([^\s;"']+)/iu).exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return bytes.toString("utf8");
  }
};

export const extractWebContent = (bytes: Buffer, contentType: string, pageUrl: URL) => {
  if (!(/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/iu).test(contentType)) {
    return { title: pageUrl.hostname, markdown: decodeText(bytes, contentType).trim(), links: [] };
  }

  // Parse HTML with script execution and subresource loading disabled by default:
  const dom = new JSDOM(bytes, {
    url: pageUrl.href,
    contentType: contentType.replace(/^application\/xhtml\+xml/iu, "text/html"),
    virtualConsole: new VirtualConsole(),
  });
  try {
    // Preserve same-origin navigation links before removing page chrome:
    const { document } = dom.window;
    const baseUrl = parseWebUrl(document.baseURI) ?? pageUrl;
    const navigation = [...document.querySelectorAll<HTMLAnchorElement>("nav a[href], [role='navigation'] a[href]")]
      .filter((anchor) => parseWebUrl(anchor.href)?.origin === pageUrl.origin);
    for (const element of document.querySelectorAll(unwantedElements)) element.remove();

    // Prefer semantic content and fall back to Readability or the page body:
    const main = document.querySelector<HTMLElement>("main, [role='main']") ?? document.querySelector("article");
    const article = main ? null : new Readability<HTMLElement>(document.cloneNode(true) as Document, {
      serializer: (element) => element as HTMLElement,
    }).parse();
    const root = main ?? article?.content ?? document.body;
    return {
      title: compact(article?.title ?? "", 250) || compact(document.title, 250) || pageUrl.hostname,
      markdown: turndown.turndown(root),
      links: collectLinks(root, navigation, pageUrl, baseUrl),
    };
  }
  finally {
    dom.window.close();
  }
};
