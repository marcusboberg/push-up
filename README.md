# Push-up Tracker

Modern, mobile-first web app to log push-up workouts, track yearly totals, and visualise progress towards a personal goal.

## Features

- Log push-ups with date and edit/delete history entries
- Yearly total, progress bar and "needed per day" indicator for the goal deadline
- Line chart of daily totals powered by Chart.js
- Dark UI optimised for phones and tablets
- Firebase Firestore persistence

## Tech Stack

- [Vite](https://vitejs.dev/) + vanilla JavaScript
- [Firebase Web SDK](https://firebase.google.com/docs/web/setup)
- [Chart.js](https://www.chartjs.org/)

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Firebase**

   Copy the provided template and fill in your Firebase project values:

   ```bash
   cp .env.example .env.local
   ```

   Required variables:

   ```ini
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   ```

   Optional overrides:

   ```ini
   VITE_APP_USERNAME=JJ
   VITE_APP_GOAL=10000
   VITE_APP_TARGET_DATE=2026-06-14
   ```

3. **Run the app locally**

   ```bash
   npm run dev
   ```

   Vite prints a local development URL (defaults to `http://localhost:5173`).

4. **Build for production**

   ```bash
   npm run build
   ```

   The optimised site is emitted to `dist/`.

## Firestore Data Model

Documents in the `pushups` collection use the structure:

```json
{
  "user": "JJ",
  "date": "YYYY-MM-DD",
  "count": 25
}
```

Daily and yearly totals are computed client-side to keep the backend simple.

## Deployment

The project is optimised for static hosting (e.g. GitHub Pages). Configure CI to supply the same environment variables at build time, prefixed with `VITE_`.
