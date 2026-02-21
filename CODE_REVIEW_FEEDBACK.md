# Code Review Feedback

## What looks good
- The code is thoughtfully structured around named helper functions (`loadData`, `setActiveProfile`, `updateProfileGateUI`, etc.), which makes a large single-file app easier to follow and maintain.
- Environment-based Firebase config with explicit missing-key handling is a strong pattern and gives clear user-facing failure messages.
- UX details are solid: profile gate flow, streak tracking, zero-day placeholders, and disabled settings states all show careful product thinking.

## High-priority issues

1. **Yearly metrics currently include all historical entries**
   - `loadData()` queries all entries for the user with no date/year filter and then sums all valid entries into `totalYear`.
   - The UI labels this as yearly totals (e.g. "Totalt antal armhävningar" and chart copy mentioning "detta år"), so users can get inflated numbers when older years exist.
   - **Suggestion:** either filter at query-time by date range (`YYYY-01-01` to `YYYY-12-31`) or filter in-memory before totals, streaks, and chart calculations.

2. **XSS risk in history rendering due to `innerHTML` with Firestore data**
   - `renderEntries()` builds HTML strings and injects `entry.date` and `entry.count` directly into `innerHTML`.
   - Since Firestore is user-writable data, a malicious value (especially in `date` edited manually) can inject script/html in the history list.
   - **Suggestion:** build rows using `document.createElement` + `textContent` for all dynamic values.

## Medium-priority issues

3. **Date validation is format-only, not calendar-valid**
   - `handleEdit()` and `handleAddForMissingDay()` only check `/^\d{4}-\d{2}-\d{2}$/`.
   - Invalid dates like `2026-99-99` pass validation and can produce broken chart/timeline behavior.
   - **Suggestion:** add strict parser validation (construct `Date`, reformat to ISO date, compare to input).

4. **Large production bundle warning**
   - Build output warns about a >500kB chunk.
   - This may hurt mobile startup times.
   - **Suggestion:** lazy-load Chart.js and/or Firebase modules used only after profile selection, or split settings/dashboard code paths.

## Nice-to-have improvements

5. **Split `src/main.js` into feature modules**
   - File is nearing 2k lines and handles state, Firestore, charting, rendering, and forms.
   - **Suggestion:** extract `profiles`, `entries`, `chart`, and `ui/state` modules to reduce cognitive load and lower regression risk.

6. **Add automated tests for pure logic helpers**
   - Functions like `calculateStreaks`, `computeZeroDays`, and `calculateGoalProjection` are ideal for unit tests.
   - **Suggestion:** add Vitest with fixture-based tests for edge cases (year boundaries, missing today, future dates, sparse datasets).
