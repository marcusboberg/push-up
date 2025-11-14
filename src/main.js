import './style.css';
import Chart from 'chart.js/auto';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
};

const USERNAME = import.meta.env.VITE_APP_USERNAME ?? 'JJ';
const GOAL = Number(import.meta.env.VITE_APP_GOAL ?? 10_000);
const TARGET_DATE = new Date(import.meta.env.VITE_APP_TARGET_DATE ?? '2026-06-14T00:00:00');

const selectors = {
  totalYear: document.getElementById('totalYear'),
  goalText: document.getElementById('goalText'),
  progressBarInner: document.getElementById('progressBarInner'),
  daysLeft: document.getElementById('daysLeft'),
  perDayNeeded: document.getElementById('perDayNeeded'),
  countInput: document.getElementById('countInput'),
  dateInput: document.getElementById('dateInput'),
  entryForm: document.getElementById('entryForm'),
  error: document.getElementById('error'),
  entriesList: document.getElementById('entriesList')
};

const today = new Date();
selectors.dateInput.value = toDateInputValue(today);

let firestore;
let configError = '';

try {
  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length) {
    throw new Error(`Saknar Firebase-konfiguration: ${missingKeys.join(', ')}`);
  }

  const app = initializeApp(firebaseConfig);
  firestore = getFirestore(app);
} catch (error) {
  console.error(error);
  configError =
    'Firebase-konfiguration saknas eller är ogiltig. Kontrollera Vite-miljövariablerna.';
}

const state = {
  entries: [],
  chart: null
};

const currentYear = new Date().getFullYear();

updateDaysLeft();

if (configError) {
  selectors.error.textContent = configError;
  disableForm();
} else {
  selectors.error.textContent = '';
  loadData().catch((error) => {
    console.error(error);
    selectors.error.textContent =
      'Kunde inte ladda data. Kontrollera din nätverksanslutning eller Firebase-inställningar.';
  });
}

selectors.entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!firestore) {
    return;
  }

  selectors.error.textContent = '';

  const count = Number(selectors.countInput.value);
  const date = selectors.dateInput.value;

  if (!count || count <= 0 || !date) {
    selectors.error.textContent = 'Fyll i både antal och datum.';
    return;
  }

  try {
    await addDoc(collection(firestore, 'pushups'), {
      user: USERNAME,
      date,
      count
    });

    selectors.countInput.value = '';
    await loadData();
  } catch (error) {
    console.error(error);
    selectors.error.textContent =
      'Kunde inte spara. Kontrollera Firebase-inställningar eller nätverksanslutning.';
  }
});

selectors.entriesList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || !firestore) {
    return;
  }

  const row = button.closest('.entry-row');
  if (!row) {
    return;
  }

  const id = row.getAttribute('data-id');
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  const action = button.getAttribute('data-action');

  if (action === 'edit') {
    await handleEdit(entry);
  } else if (action === 'delete') {
    await handleDelete(entry);
  }
});

function disableForm() {
  selectors.entryForm.querySelectorAll('input, button').forEach((element) => {
    element.setAttribute('disabled', 'disabled');
  });
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function updateDaysLeft() {
  const now = new Date();
  const diffMs = TARGET_DATE.getTime() - now.getTime();
  let daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (Number.isNaN(daysLeft) || daysLeft < 0) {
    daysLeft = 0;
  }

  selectors.daysLeft.textContent = String(daysLeft);
  return daysLeft;
}

async function loadData() {
  if (!firestore) {
    return;
  }

  selectors.error.textContent = '';

  const snapshot = await getDocs(
    query(collection(firestore, 'pushups'), where('user', '==', USERNAME))
  );

  state.entries = [];

  let totalYear = 0;
  const dailyTotals = new Map();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const date = data.date;
    const count = Number(data.count ?? 0);

    state.entries.push({
      id: docSnap.id,
      date,
      count
    });

    if (typeof date === 'string' && date.startsWith(String(currentYear))) {
      totalYear += count;
      dailyTotals.set(date, (dailyTotals.get(date) ?? 0) + count);
    }
  });

  updateTotals(totalYear);
  updatePerDay(totalYear);
  renderChart(dailyTotals);
  renderEntries();
}

function updateTotals(totalYear) {
  selectors.totalYear.textContent = formatNumber(totalYear);

  const progress = Math.min(100, (totalYear / GOAL) * 100);
  selectors.progressBarInner.style.width = `${progress.toFixed(1)}%`;

  selectors.goalText.innerHTML = `${formatNumber(totalYear)} av ${formatNumber(GOAL)} (` +
    `${progress.toFixed(1).replace('.', ',')}&nbsp;%)`;
}

function updatePerDay(totalYear) {
  const daysLeft = updateDaysLeft();

  if (daysLeft <= 0) {
    selectors.perDayNeeded.textContent = '0';
    return;
  }

  const remaining = Math.max(0, GOAL - totalYear);
  const perDay = remaining / daysLeft;
  selectors.perDayNeeded.textContent = perDay.toFixed(1).replace('.', ',');
}

function renderChart(dailyTotals) {
  const canvas = document.getElementById('pushupChart');
  if (!canvas) {
    return;
  }

  const dates = Array.from(dailyTotals.keys()).sort();
  const values = dates.map((date) => dailyTotals.get(date));

  if (state.chart) {
    state.chart.destroy();
  }

  const context = canvas.getContext('2d');
  state.chart = new Chart(context, {
    type: 'line',
    data: {
      labels: dates.map((date) => date.slice(5).replace('-', '/')),
      datasets: [
        {
          label: 'Armhävningar per dag',
          data: values,
          tension: 0.3,
          borderColor: 'rgba(79, 140, 255, 0.85)',
          backgroundColor: 'rgba(79, 140, 255, 0.25)',
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#4f8cff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#a0a4c0',
            maxRotation: 0,
            font: { size: 10 }
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: '#a0a4c0',
            font: { size: 10 }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        }
      }
    }
  });
}

function renderEntries() {
  const container = selectors.entriesList;
  if (!container) {
    return;
  }

  if (state.entries.length === 0) {
    container.innerHTML = '<div class="card-footnote">Inga pass registrerade ännu.</div>';
    return;
  }

  const sorted = [...state.entries].sort((a, b) => {
    if (a.date === b.date) {
      return b.count - a.count;
    }
    return a.date < b.date ? 1 : -1;
  });

  container.innerHTML = sorted
    .map((entry) => {
      const safeDate = entry.date ?? '';
      const safeCount = Number(entry.count ?? 0);
      return `
        <div class="entry-row" data-id="${entry.id}">
          <div class="entry-main">
            <div class="entry-date">${safeDate}</div>
            <div class="entry-count">${safeCount} st</div>
          </div>
          <div class="entry-actions">
            <button type="button" data-action="edit">Ändra</button>
            <button type="button" class="btn-danger" data-action="delete">Ta bort</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function handleEdit(entry) {
  const newCountStr = window.prompt('Nytt antal armhävningar:', String(entry.count));
  if (newCountStr === null) {
    return;
  }

  const newCount = Number(newCountStr);
  if (!Number.isFinite(newCount) || newCount <= 0) {
    window.alert('Ogiltigt antal.');
    return;
  }

  const newDateStr = window.prompt('Nytt datum (YYYY-MM-DD):', entry.date ?? '');
  if (newDateStr === null) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) {
    window.alert('Ogiltigt datumformat. Använd YYYY-MM-DD.');
    return;
  }

  try {
    const docRef = doc(firestore, 'pushups', entry.id);
    await updateDoc(docRef, {
      count: newCount,
      date: newDateStr
    });
    await loadData();
  } catch (error) {
    console.error(error);
    window.alert('Kunde inte uppdatera passet.');
  }
}

async function handleDelete(entry) {
  if (!window.confirm('Ta bort detta pass?')) {
    return;
  }

  try {
    const docRef = doc(firestore, 'pushups', entry.id);
    await deleteDoc(docRef);
    await loadData();
  } catch (error) {
    console.error(error);
    window.alert('Kunde inte ta bort passet.');
  }
}

function formatNumber(value) {
  return Number(value).toLocaleString('sv-SE');
}
