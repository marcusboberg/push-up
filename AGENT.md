# AGENT.md – Push-up Tracker

This document explains how to maintain, extend, and deploy the Push-up Tracker app as an autonomous agent.

---

## 1. Purpose

A small, mobile-first web app that lets the user:

* Log push-up sessions (count + date)
* See yearly totals
* Track progress towards a configurable push-up goal
* See days remaining to a target date
* Visualize daily totals in a line chart
* Store all data in Firebase Firestore

The app is deployed via **GitHub Pages** and built via **GitHub Actions**.

---

## 2. Architecture Overview

Target architecture (modernized):

* **Frontend**

  * Vite-based static site (vanilla JS or minimal framework-free setup)
  * Main app code under `src/` (e.g. `src/main.ts` or `src/main.js`)
  * `index.html` at the project root uses the Vite entry script
  * Dark, mobile-first UI for logging and visualizing push-ups

* **Backend / Data**

  * Firebase Firestore (client-side SDK)
  * Collection: `pushups`

* **Config & Secrets**

  * Firebase credentials stored as **GitHub repository secrets**:

    * `FIREBASE_API_KEY`
    * `FIREBASE_APP_ID`
    * `FIREBASE_AUTH_DOMAIN`
    * `FIREBASE_MESSAGING_SENDER_ID`
    * `FIREBASE_PROJECT_ID`
    * `FIREBASE_STORAGE_BUCKET`
  * Exposed to the frontend at build time through **Vite env variables** (`VITE_…`)

* **CI/CD**

  * GitHub Actions pipeline builds the app (`npm run build`)
  * Output from Vite (`dist/`) is deployed to GitHub Pages
  * Pages is connected to a custom domain via repository settings

---

## 3. Repository Layout (desired)

Typical structure for this app when migrated to Vite:

```text
.
├─ index.html          # Vite entry HTML
├─ vite.config.(js|ts)
├─ package.json
├─ src/
│  ├─ main.(js|ts)     # App bootstrap, Firebase init, chart + UI logic
│  └─ styles.css       # Optional separated CSS
└─ .github/
   └─ workflows/
      └─ deploy.yml    # GitHub Actions workflow for Pages
```

If the app is still a single `push-up.html` file without Vite, the agent’s first refactor task is to:

1. Extract the inline `<script>` into `src/main.(js|ts)`.
2. Configure Vite to use `index.html` + `src/main.(js|ts)`.
3. Wire up Firebase config via env vars instead of hard-coded values.

---

## 4. Data Model

Firestore collection: `pushups`

Example document:

```json
{
  "user": "JJ",
  "date": "YYYY-MM-DD",
  "count": 42
}
```

Notes:

* `user` is a string key (e.g. `"JJ"` or the user’s name from settings).
* `date` is stored as a string in `YYYY-MM-DD` format (important for sorting and year filtering).
* `count` is the number of push-ups for that session.

Daily totals and yearly totals are derived in the client by aggregating these documents.

---

## 5. Firebase Configuration

### 5.1 GitHub Secrets

Required repository secrets (already configured by the user):

* `FIREBASE_API_KEY`
* `FIREBASE_APP_ID`
* `FIREBASE_AUTH_DOMAIN`
* `FIREBASE_MESSAGING_SENDER_ID`
* `FIREBASE_PROJECT_ID`
* `FIREBASE_STORAGE_BUCKET`

These are mapped to Vite env variables in the GitHub Actions workflow as:

* `VITE_FIREBASE_API_KEY`
* `VITE_FIREBASE_APP_ID`
* `VITE_FIREBASE_AUTH_DOMAIN`
* `VITE_FIREBASE_MESSAGING_SENDER_ID`
* `VITE_FIREBASE_PROJECT_ID`
* `VITE_FIREBASE_STORAGE_BUCKET`

### 5.2 Config module

The frontend should read Firebase config from `import.meta.env` instead of hard-coding values. Example:

```ts
// src/firebaseConfig.ts
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
```

In `src/main.(js|ts)`:

```ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
```

This keeps environment-specific configuration out of the committed source while still bundling the necessary values into the static build.

---

## 6. Core App Logic (high level)

The app logic from the original `push-up.html` should be preserved in `src/main.(js|ts)`:

* Initialize Firebase / Firestore.
* Compute `currentYear` from the client clock.
* Load push-up entries for the current `USERNAME` from Firestore.
* Aggregate totals per day and per year.
* Render:

  * Total yearly push-ups
  * Progress bar vs. `GOAL`
  * Days left to `TARGET_DATE`
  * Required push-ups per day to reach `GOAL`
  * Line chart of daily totals (Chart.js)
  * History list with edit/delete actions
* Handle form submissions to add new sessions.

## 7. Environment-Driven Settings

Previously, settings such as `USERNAME`, `GOAL`, and `TARGET_DATE` were constants in the script.

With a settings UI and/or env-driven configuration:

* `USERNAME` can be derived from local UI state or a stored preference (e.g. `localStorage`).
* `GOAL` and `TARGET_DATE` can be adjusted by the user and persisted locally.

The agent should:

* Avoid hard-coding user-specific values in the code or workflow.
* Keep the logic that aggregates and displays totals independent of the actual user name and goal numbers.

---

## 8. GitHub Actions & Pages Deployment

### 8.1 Workflow Overview

Use GitHub Actions to:

1. Install dependencies
2. Build the app (`npm run build`)
3. Deploy the `dist/` folder to GitHub Pages

Example workflow: `.github/workflows/deploy.yml`

```yaml
name: Deploy Push-up Tracker

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 8.2 Custom Domain

The custom domain (e.g. `pushups.example.com`) is configured in the **GitHub Pages settings** of the repository, not in the workflow itself.

The agent should not hard-code domains in the build or workflow; rely on GitHub Pages configuration and DNS instead.

---

## 9. Agent Responsibilities

When working on this repo, the agent should:

1. **Keep the build green**

   * Do not commit changes that break `npm run build`.
   * Ensure the GitHub Actions workflow completes successfully on `main`.

2. **Respect configuration boundaries**

   * Firebase credentials must come from secrets → Vite env → `firebaseConfig`.
   * Avoid embedding raw secret values in source code or documentation.

3. **Preserve app behavior**

   * Logging, totals, progress, chart, and history must continue to work after refactors.

4. **Minimize tech sprawl**

   * Prefer small, incremental improvements over heavy rewrites.
   * Only introduce additional runtime dependencies if clearly justified.

5. **Document significant changes**

   * Update this `AGENT.md` whenever the architecture, workflow, or configuration model changes.

---

## 10. Future Improvements (Optional)

Implement only when explicitly requested by the maintainer:

* Authentication (Firebase Auth) and per-user isolation in Firestore
* More advanced analytics (weekly/monthly aggregates, streaks)
* PWA support (manifest, service worker, offline cache)
* Test suite for core aggregation logic (e.g. using Vitest)
