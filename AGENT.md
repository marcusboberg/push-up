# Agent Guide for Push-up Tracker

This document explains how to maintain and extend the Push-up Tracker app as an autonomous agent.

---

## 1. Purpose

Single-page, mobile-first web app to:

- Log push-up sessions (count + date)
- Show yearly total
- Visualize daily totals in a line chart
- Track progress toward a numeric goal (default: 10,000)
- Calculate days left to a fixed target date
- Store all data in Firebase Firestore

All logic lives in a single file: `push-up.html`.

---

## 2. Tech Stack

- HTML, CSS, JavaScript (no framework)
- Chart.js via CDN
- Firebase Firestore via Firebase JS SDK

No build step: the file is served as static HTML via a simple web server.

---

## 3. File Map

### `push-up.html`

- `<style>`
  - Dark, mobile-first layout
  - Cards, grid, progress bar, history list styling
- `<body>`
  - **Header**: title + user label + goal chip
  - **Summary card**: yearly total, progress bar, goal text
  - **Stats grid**:
    - Days left until `TARGET_DATE`
    - Required reps per day to reach `GOAL`
  - **"Registrera pass" card**: main form to log a session
  - **"Utveckling" card**: line chart (`<canvas id="pushupChart">`)
  - **"Historik" card**: list of sessions with edit/delete actions
- `<script type="module">`
  - Firebase init
  - Firestore access (collection `pushups`)
  - Data aggregation and chart rendering
  - History list rendering and actions
  - Form submission and validation

---

## 4. Data Model

Firestore collection: `pushups`

Document shape:

```json
{
  "user": "JJ",          // string
  "date": "YYYY-MM-DD",  // string
  "count": 42             // number
}
```

Notes:

- All current logic filters on `user == "JJ"`.
- Daily totals are computed by summing `count` per `date`.
- Yearly total is the sum of all `count` values in the current year.

---

## 5. Key Constants / Variables

In the script:

```js
const USERNAME = "JJ";
const GOAL = 10000;
const TARGET_DATE = new Date("2026-06-14T00:00:00");
const currentYear = new Date().getFullYear();
```

Usage:

- `USERNAME`: Firestore filter (`where("user", "==", USERNAME)`).
- `GOAL`: used in the progress bar and "needed per day" calculation.
- `TARGET_DATE`: used to compute remaining days.
- `currentYear`: defines which entries count toward the yearly total.

If you change these:

- Keep `USERNAME` a plain string.
- Keep `date` values as `"YYYY-MM-DD"` strings in Firestore.

---

## 6. Core Functions

### `updateDaysLeft()`

- Uses `TARGET_DATE` and `Date.now()` to compute remaining days.
- Updates `#daysLeft` in the DOM.
- Returns the number of days (0 or more).

### `loadData()`

- Fetches all `pushups` documents for `USERNAME`.
- Builds:
  - `entries`: all raw entries (including Firestore `id`).
  - `dailyTotals`: map `date -> total count`.
  - `totalYear`: sum of counts for the current year.
- Updates UI:
  - `#totalYear` text.
  - Progress bar width and goal text (`#goalText`) based on `GOAL`.
  - `#perDayNeeded` (required reps per day) using `GOAL` and `updateDaysLeft()`.
- Rebuilds the Chart.js line chart with daily totals.
- Calls `renderEntries(entries)` to refresh the history list.

### `renderEntries(list)`

- If `list` is empty:
  - Renders a single line: “Inga pass registrerade ännu.”
- Otherwise:
  - Sorts entries by date descending (newest first, then by count desc).
  - Renders rows with:
    - Date
    - Count
    - Buttons `Ändra` and `Ta bort`
  - Each row has `data-id` with the Firestore document ID.

### History click handler

- Delegated click listener on `#entriesList`.
- For each clicked button:
  - `data-action="edit"`:
    - Prompts for new count and new date.
    - Validates positive count and `YYYY-MM-DD` date format.
    - Calls `updateDoc` on the matching Firestore document.
    - Calls `loadData()` afterward.
  - `data-action="delete"`:
    - Confirms with the user.
    - Calls `deleteDoc` on the matching document.
    - Calls `loadData()` afterward.

### Entry form submit handler

- Validates that `count > 0` and `date` is present.
- Creates a Firestore document:

  ```js
  addDoc(collection(db, "pushups"), { user: USERNAME, date, count });
  ```

- Clears the count input field.
- Calls `loadData()` to refresh totals, chart and history.

---

## 7. How to Run Locally

The app is purely client-side and should be served from a static web server.

Steps:

1. Ensure `firebaseConfig` in the script is valid for this Firebase project.
2. From the repo root, start a static server, for example:

   ```bash
   npx serve .
   ```

3. Open the app in a browser, e.g.:

   ```text
   http://localhost:3000/push-up.html
   ```

The app requires network access to Firebase and the Chart.js CDN.

---

## 8. Expected Behaviors

- On first load:
  - Sets the date input to today.
  - Loads all data for `USERNAME` from Firestore.
  - Renders totals, progress bar, chart, and history.
- When a new entry is added:
  - A new Firestore document is created.
  - Totals, progress, chart and history are updated via `loadData()`.
- When an entry is edited or deleted:
  - The corresponding Firestore document is updated or removed.
  - The UI is refreshed via `loadData()`.

---

## 9. Coding Style and Constraints

- No framework; use plain JavaScript.
- Keep all logic in `push-up.html` unless explicitly asked to split files.
- Use modern JS compatible with current Chrome/Firefox/Safari.
- Keep CSS consistent with the existing dark theme and rounded components.
- Prefer small, focused changes over large refactors.

---

## 10. Safe vs. Risky Changes

You can safely:

- Tweak styling in `<style>` (colors, spacing, typography).
- Extend `renderEntries` (e.g. add cumulative totals per day).
- Adjust chart options (tension, tick format, tooltips).
- Change default constants (`USERNAME`, `GOAL`, `TARGET_DATE`).

Be careful when:

- Modifying the Firestore data model (adding/removing fields).
- Changing date handling; aggregation relies on `"YYYY-MM-DD"` strings and `startsWith(currentYear)`.

---

## 11. Future Work (Nice-to-have)

Implement only if explicitly requested:

- **Settings panel**
  - Change `USERNAME`, `GOAL` and `TARGET_DATE` from the UI.
  - Persist settings in `localStorage`.
  - Update header labels and goal-related texts.
- **Multi-user support**
  - Integrate Firebase Authentication.
  - Filter Firestore data per authenticated user.
- **PWA support**
  - Add `manifest.json` and a service worker.
  - Enable offline caching and sync to Firestore when online.

