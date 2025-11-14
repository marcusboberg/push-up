# push-up
PushUp Path is a minimal, mobile-first web app that lets you log daily push-up workouts, see your yearly total, track progress toward a custom goal and deadline, and visualize your improvement over time with a clean, dark-mode dashboard. Adjust targets, switch users, and edit or delete entries.

# Push-up Tracker

Minimal, mobile-first web app to log push-ups and see your progress.

## Features

- Log push-ups with date
- Yearly total and goal progress
- Progress bar and “needed per day” to hit goal by target date
- Line chart of daily totals (Chart.js)
- History list with edit / delete
- Dark mode design

## Tech

- HTML, CSS, JavaScript
- Chart.js (CDN)
- Firebase Firestore

## Setup

1. Create a Firebase project and enable Firestore.
2. Copy your web app config into `firebaseConfig` in `push-up.html`.
3. Run a local server in the folder:

```bash
   npx serve .
```

4.	Open http://localhost:3000/push-up.html (or the port shown).

The app will create a pushups collection and store documents like:

{ "user": "NAME", "date": "2025-11-14", "count": 25 }

Adjust USERNAME, GOAL and TARGET_DATE in the script to fit your use case.

