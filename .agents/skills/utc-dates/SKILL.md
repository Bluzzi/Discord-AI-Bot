---
name: utc-dates
description: MUST be loaded before writing or reviewing date and time handling in Discord Agent. Covers UTC timestamps, date-only inputs, and operations that require a local timezone.
---

# UTC dates and local calendar operations

Use UTC for work on instants, database storage, and transfers. Apply a timezone only where the operation depends on a local calendar or clock.

## Rules

- Use UTC for instant comparisons, sorting, and elapsed-duration arithmetic.
- Use the operation's intended timezone to interpret a date or wall-clock time, calculate calendar boundaries with `startOf` or `endOf`, group by local day, week, or month, or add calendar periods that must preserve local clock time across daylight saving changes.
- Use the intended timezone when formatting a date or time for local display.
- Convert local boundaries back to UTC before passing them to the database. For example, interpreting a date-only value directly in the target timezone keeps its calendar date independent of the host timezone.

```ts
const startAt = day.tz(startDate, timezone).startOf("day").utc().toDate();
const endAt = day.tz(endDate, timezone).endOf("day").utc().toDate();
```

## Constraints

- MUST store instants in UTC and transfer them as UTC timestamps, such as ISO 8601 strings ending in `Z` or Unix timestamps with an explicit unit.
- MUST keep date-only inputs as `YYYY-MM-DD` until a calendar operation interprets them. A date-only value carries no offset.
- NEVER apply a local timezone to storage, transport, or instant arithmetic.
