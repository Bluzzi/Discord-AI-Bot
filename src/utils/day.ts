import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import "dayjs/locale/fr.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("fr");

dayjs.tz.setDefault("Europe/Paris");

export const day = dayjs;
export type Day = Dayjs;
