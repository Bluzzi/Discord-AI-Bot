import { discordClient } from "#/discord";
import { aiModels } from "#/utils/ai-model";
import { day, type Day } from "#/utils/day";
import { generateText, Output } from "ai";
import { Cron } from "croner";
import dedent from "dedent";
import { ActivityType } from "discord.js";
import z from "zod";

type RssSourceKey = "france" | "monde" | "crypto" | "tech";

type HolidayContext =
  | { mode: "big-holiday-today"; holidayName: string }
  | { mode: "big-holiday-prep"; holidayName: string; daysRemaining: number; prepStage: string }
  | { mode: "important-holiday-today"; holidayName: string }
  | { mode: "rss" };

const decodeXmlEntities = (input: string) => {
  const withoutCdata = input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  return withoutCdata
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num: string) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/\s+/g, " ")
    .trim();
};

const parseAtomTitles = (xml: string, limit: number) => {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/g) ?? [];
  const titles: string[] = [];

  for (const entry of entries) {
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const rawTitle = titleMatch?.[1];
    if (!rawTitle) continue;

    const title = decodeXmlEntities(rawTitle);
    if (!title) continue;

    titles.push(title);
    if (titles.length >= limit) break;
  }

  return titles;
};

const parseRssTitles = (xml: string, limit: number) => {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  const titles: string[] = [];

  for (const item of items) {
    const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const rawTitle = titleMatch?.[1];
    if (!rawTitle) continue;

    const title = decodeXmlEntities(rawTitle);
    if (!title) continue;

    titles.push(title);
    if (titles.length >= limit) break;
  }

  return titles;
};

const fetchFeedTitles = async (url: string, limit: number) => {
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) throw new Error(`Failed to fetch RSS feed: ${url} (${response.status})`);

  const xml = await response.text();

  const isAtom = xml.includes("<feed") && xml.includes("http://www.w3.org/2005/Atom");
  const titles = isAtom ? parseAtomTitles(xml, limit) : parseRssTitles(xml, limit);

  return titles;
};

const getNextFixedDate = (today: Day, month: number, dayOfMonth: number) => {
  const candidate = day()
    .tz()
    .year(today.year())
    .month(month - 1)
    .date(dayOfMonth)
    .startOf("day");

  if (candidate.isBefore(today, "day")) return candidate.add(1, "year");
  return candidate;
};

const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const dayOfMonth = ((h + l - 7 * m + 114) % 31) + 1;

  return day().tz().year(year).month(month - 1).date(dayOfMonth).startOf("day");
};

const getNextEasterSunday = (today: Day) => {
  const easterThisYear = getEasterSunday(today.year());
  if (!easterThisYear.isBefore(today, "day")) return easterThisYear;
  return getEasterSunday(today.year() + 1);
};

const daysUntil = (today: Day, target: Day) => target.startOf("day").diff(today.startOf("day"), "day");

const getPrepStage = (daysRemaining: number, prepDays: number) => {
  if (prepDays === 3) {
    if (daysRemaining === 3) return "préparatifs";
    if (daysRemaining === 2) return "derniers détails";
    return "dernière ligne droite";
  }

  if (prepDays === 7) {
    if (daysRemaining === 7) return "compte à rebours";
    if (daysRemaining === 6) return "ça se rapproche";
    if (daysRemaining === 5) return "préparation tranquille";
    if (daysRemaining === 4) return "achats";
    if (daysRemaining === 3) return "préparatifs";
    if (daysRemaining === 2) return "derniers détails";
    return "dernière ligne droite";
  }

  return "préparatifs";
};

const getHolidayContext = (today: Day): HolidayContext => {
  const bigHolidays = [
    {
      name: "Noël",
      prepDays: 7,
      date: getNextFixedDate(today, 12, 25),
    },
    {
      name: "Jour de l'an",
      prepDays: 7,
      date: getNextFixedDate(today, 1, 1),
    },
    {
      name: "Saint-Valentin",
      prepDays: 3,
      date: getNextFixedDate(today, 2, 14),
    },
    {
      name: "Pâques",
      prepDays: 3,
      date: getNextEasterSunday(today),
    },
  ] as const;

  for (const holiday of bigHolidays) {
    if (holiday.date.isSame(today, "day")) {
      return { mode: "big-holiday-today", holidayName: holiday.name };
    }
  }

  const upcomingCandidates = bigHolidays
    .map((holiday) => {
      const remaining = daysUntil(today, holiday.date);
      return { holiday, remaining };
    })
    .filter(({ remaining, holiday }) => remaining > 0 && remaining <= holiday.prepDays)
    .sort((a, b) => a.remaining - b.remaining);

  const nextBig = upcomingCandidates[0];
  if (nextBig) {
    return {
      mode: "big-holiday-prep",
      holidayName: nextBig.holiday.name,
      daysRemaining: nextBig.remaining,
      prepStage: getPrepStage(nextBig.remaining, nextBig.holiday.prepDays),
    };
  }

  const importantHolidays = [
    { name: "Fête de la musique", month: 6, dayOfMonth: 21 },
    { name: "Fête Nationale", month: 7, dayOfMonth: 14 },
    { name: "Halloween", month: 10, dayOfMonth: 31 },
    { name: "Fête du Travail", month: 5, dayOfMonth: 1 },
    { name: "Armistice 1918", month: 11, dayOfMonth: 11 },
  ] as const;

  for (const holiday of importantHolidays) {
    const date = getNextFixedDate(today, holiday.month, holiday.dayOfMonth);
    if (date.isSame(today, "day")) return { mode: "important-holiday-today", holidayName: holiday.name };
  }

  return { mode: "rss" };
};

const buildPrompt = (today: Day, holidayContext: HolidayContext, titlesBySource: Record<RssSourceKey, string[]>) => {
  const base = dedent`
    Tu es le générateur de status Discord de Jean Pascal, un bot Discord drôle et décontracté.
    Tu réponds uniquement avec un JSON strict: {"text": string, "emoji": string}

    Date actuelle: ${today.format("DD/MM/YYYY")}

    Contraintes:
    - Français
    - text: 50 caractères maximum (sans emoji)
    - emoji: un seul emoji unicode pertinent
    - NE PAS inclure d'emoji dans text
  `;

  if (holidayContext.mode === "big-holiday-today") {
    return dedent`
      ${base}

      PRIORITÉ ABSOLUE: Aujourd'hui c'est ${holidayContext.holidayName}.
      Génère un status court, drôle, et 100% centré sur la fête.
      Aucune actualité, aucun événement historique.
    `;
  }

  if (holidayContext.mode === "big-holiday-prep") {
    return dedent`
      ${base}

      PRIORITÉ ABSOLUE: Très grosse fête à préparer.
      Fête: ${holidayContext.holidayName}
      Jours restants: ${holidayContext.daysRemaining}
      Ambiance: ${holidayContext.prepStage}

      Génère un status court, drôle, et centré sur cette préparation (selon l'ambiance).
      Aucune actualité, aucun événement historique.
    `;
  }

  if (holidayContext.mode === "important-holiday-today") {
    return dedent`
      ${base}

      Aujourd'hui c'est: ${holidayContext.holidayName}.
      Génère un status court, drôle, et centré sur cette fête.
      Aucune actualité, aucun événement historique.
    `;
  }

  return dedent`
    ${base}

    Ce n'est pas un jour de fête important.
    Objectif: parmi les titres ci-dessous, choisis l'info la plus croustillante pour vanner (humour léger, dédramatiser).

    Règles:
    - Utilise uniquement les titres (pas de contenu)
    - Ne parle de crypto QUE si l'info est vraiment énorme (hack majeur, crash historique, annonce mondiale). Sinon ignore la section crypto.

    Info France (10 titres):
    ${titlesBySource.france.map((t) => `- ${t}`).join("\n")}

    Info Monde (10 titres):
    ${titlesBySource.monde.map((t) => `- ${t}`).join("\n")}

    Info Crypto (10 titres):
    ${titlesBySource.crypto.map((t) => `- ${t}`).join("\n")}

    Info Tech (10 titres):
    ${titlesBySource.tech.map((t) => `- ${t}`).join("\n")}
  `;
};

const job = new Cron("0 0 * * *", async () => {
  if (!discordClient.user) throw new Error("Discord bot user is not available");

  // Get today news:
  const today = day().tz().startOf("day");
  const holidayContext = getHolidayContext(today);

  const titlesBySource: Record<RssSourceKey, string[]> = {
    france: [],
    monde: [],
    crypto: [],
    tech: [],
  };

  if (holidayContext.mode === "rss") {
    const feedUrls: Record<RssSourceKey, string> = {
      france: "https://theconversation.com/fr/articles.atom",
      monde: "https://theconversation.com/global/home-page.atom",
      crypto: "https://coinacademy.fr/actu/gn",
      tech: "https://feeds.feedburner.com/ign/all",
    };

    const limit = 10;

    const [france, monde, crypto, tech] = await Promise.all([
      fetchFeedTitles(feedUrls.france, limit),
      fetchFeedTitles(feedUrls.monde, limit),
      fetchFeedTitles(feedUrls.crypto, limit),
      fetchFeedTitles(feedUrls.tech, limit),
    ]);

    titlesBySource.france = france;
    titlesBySource.monde = monde;
    titlesBySource.crypto = crypto;
    titlesBySource.tech = tech;
  }

  // Ask AI for MOTD from news:
  const motd = await generateText({
    model: aiModels.mistralLarge,
    output: Output.object({
      schema: z.object({
        text: z.string().max(50),
        emoji: z.string().min(1),
      }),
    }),
    prompt: buildPrompt(today, holidayContext, titlesBySource),
  });

  // Set Discord activity:
  discordClient.user.setPresence({
    activities: [{
      name: "Custom",
      type: ActivityType.Custom,
      state: `${motd.output.emoji} ${motd.output.text}`,
    }],
    status: "online",
  });
});

await job.trigger();