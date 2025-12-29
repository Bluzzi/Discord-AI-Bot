import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

export const holidaysTools: ToolSet = {
  getPublicHolidays: tool({
    description: "Fetch French public holidays for métropole from calendrier.api.gouv.fr",
    inputSchema: z.object({}),
    outputSchema: z.object({
      holidays: z.array(z.object({ date: z.string(), name: z.string() })),
    }),
    execute: async () => {
      const url = "https://calendrier.api.gouv.fr/jours-feries/metropole.json";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch public holidays: ${res.status}`);
      const data = (await res.json()) as Record<string, string>;
      const holidays = Object.entries(data).map(([date, name]) => ({ date, name }));
      return { holidays };
    },
  }),

  getFestiveDays: tool({
    description: "Compute festive (non-official) celebration dates for a given year, filtered out if they match public holidays",
    inputSchema: z.object({ year: z.number().int().describe("Year to compute festivities for") }),
    outputSchema: z.object({
      festiveDays: z.array(z.object({ date: z.string(), name: z.string() })),
    }),
    execute: async ({ year }) => {
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const easterSunday = (y: number) => {
        const a = y % 19;
        const b = Math.floor(y / 100);
        const c = y % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month, day);
      };

      const addDays = (d: Date, days: number) => { const r = new Date(d); r.setDate(r.getDate() + days); return r; };

      const nthWeekdayOfMonth = (y: number, monthIndex: number, weekday: number, nth: number) => {
        const first = new Date(y, monthIndex, 1);
        const offset = (weekday - first.getDay() + 7) % 7;
        return new Date(y, monthIndex, 1 + offset + (nth - 1) * 7);
      };

      const lastWeekdayOfMonth = (y: number, monthIndex: number, weekday: number) => {
        const last = new Date(y, monthIndex + 1, 0);
        const diff = (last.getDay() - weekday + 7) % 7;
        return new Date(last.getFullYear(), last.getMonth(), last.getDate() - diff);
      };

      // Build festive list
      const list: Array<{ name: string; date: string }> = [];
      list.push({ name: "Saint-Valentin", date: `${year}-02-14` });
      list.push({ name: "Saint-Patrick", date: `${year}-03-17` });
      list.push({ name: "Halloween", date: `${year}-10-31` });

      // Fête des Pères: third Sunday of June
      const fathers = nthWeekdayOfMonth(year, 5, 0, 3);
      list.push({ name: "Fête des Pères", date: toIsoDate(fathers) });

      // Fête des Mères (France): last Sunday of May, unless equals Pentecost -> first Sunday of June
      const easter = easterSunday(year);
      const pentecost = addDays(easter, 49);
      const lastSundayMay = lastWeekdayOfMonth(year, 4, 0);
      let mothersDay = lastSundayMay;
      if (toIsoDate(lastSundayMay) === toIsoDate(pentecost)) {
        mothersDay = nthWeekdayOfMonth(year, 5, 0, 1);
      }
      list.push({ name: "Fête des Mères", date: toIsoDate(mothersDay) });

      // Filter out dates that are official public holidays
      const url = "https://calendrier.api.gouv.fr/jours-feries/metropole.json";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch public holidays: ${res.status}`);
      const publicHolidays = (await res.json()) as Record<string, string>;

      const festiveOnly = list.filter(f => !publicHolidays[f.date]);
      return { festiveDays: festiveOnly };
    },
  }),
};
