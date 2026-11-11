import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

export const holidaysTools: ToolSet = {
  getPublicHolidays: tool({
    description: "Get the French public holidays (métropole) of the current year with their dates.",
    inputSchema: z.object({}),
    outputSchema: z.array(z.object({
      date: z.string().describe("Date in ISO format (YYYY-MM-DD)"),
      name: z.string().describe("Holiday name"),
    })).describe("French public holidays of the current year"),
    execute: async () => {
      const response = await fetch("https://calendrier.api.gouv.fr/jours-feries/metropole.json");
      if (!response.ok) {
        throw new Error(`Failed to fetch public holidays: HTTP ${String(response.status)}`);
      }

      const data = await response.json() as Record<string, string>;

      return Object.entries(data).map(([date, name]) => ({ date, name }));
    },
  }),

  getFestiveDays: tool({
    description: "Get the festive days (unofficial celebrations: Valentine's Day, Saint Patrick's Day, Halloween, Mother's Day, Father's Day) of a given year, excluding French public holidays.",
    inputSchema: z.object({
      year: z.number().int().describe("Year to compute festivities for"),
    }),
    outputSchema: z.array(z.object({
      date: z.string().describe("Date in ISO format (YYYY-MM-DD)"),
      name: z.string().describe("Celebration name"),
    })).describe("Festive days of the year, sorted by date"),
    execute: async ({ year }) => {
      const pad = (n: number) => (n < 10 ? `0${String(n)}` : String(n));
      const toIsoDate = (d: Date) => `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

      const addDays = (d: Date, days: number) => {
        const result = new Date(d);
        result.setDate(result.getDate() + days);
        return result;
      };

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

      const list: { name: string; date: string }[] = [
        { name: "Saint-Valentin", date: `${String(year)}-02-14` },
        { name: "Saint-Patrick", date: `${String(year)}-03-17` },
        { name: "Halloween", date: `${String(year)}-10-31` },
      ];

      // Fête des Pères: third Sunday of June:
      list.push({ name: "Fête des Pères", date: toIsoDate(nthWeekdayOfMonth(year, 5, 0, 3)) });

      // Fête des Mères (France): last Sunday of May, unless it falls on Pentecost -> first Sunday of June:
      const pentecost = addDays(easterSunday(year), 49);
      const lastSundayMay = lastWeekdayOfMonth(year, 4, 0);
      const mothersDay = toIsoDate(lastSundayMay) === toIsoDate(pentecost) ? nthWeekdayOfMonth(year, 5, 0, 1) : lastSundayMay;
      list.push({ name: "Fête des Mères", date: toIsoDate(mothersDay) });

      // Exclude dates that are official public holidays:
      const response = await fetch("https://calendrier.api.gouv.fr/jours-feries/metropole.json");
      if (!response.ok) {
        throw new Error(`Failed to fetch public holidays: HTTP ${String(response.status)}`);
      }
      const publicHolidays = await response.json() as Record<string, string>;

      return list
        .filter((festiveDay) => publicHolidays[festiveDay.date] === undefined)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  }),
};
