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

const DEFAULT_GOAL = Number.isFinite(GOAL) && GOAL > 0 ? GOAL : 0;
const DEFAULT_TARGET_DATE = isValidDate(TARGET_DATE) ? toDateInputValue(TARGET_DATE) : '';
const DEFAULT_PROFILE = {
  id: null,
  name: USERNAME,
  goal: DEFAULT_GOAL,
  targetDate: DEFAULT_TARGET_DATE
};

const selectors = {
  totalYear: document.getElementById('totalYear'),
  goalText: document.getElementById('goalText'),
  goalChip: document.getElementById('goalChip'),
  progressBarInner: document.getElementById('progressBarInner'),
  daysLeft: document.getElementById('daysLeft'),
  targetDateLabel: document.getElementById('targetDateLabel'),
  perDayNeeded: document.getElementById('perDayNeeded'),
  goalLabel: document.getElementById('goalLabel'),
  activeUserName: document.getElementById('activeUserName'),
  historyUserName: document.getElementById('historyUserName'),
  countInput: document.getElementById('countInput'),
  dateInput: document.getElementById('dateInput'),
  entryForm: document.getElementById('entryForm'),
  error: document.getElementById('error'),
  entriesList: document.getElementById('entriesList'),
  profileLookupForm: document.getElementById('profileLookupForm'),
  profileLookupInput: document.getElementById('profileLookupInput'),
  profileLookupStatus: document.getElementById('profileLookupStatus'),
  createProfileForm: document.getElementById('createProfileForm'),
  profileNameInput: document.getElementById('profileNameInput'),
  profileGoalInput: document.getElementById('profileGoalInput'),
  profileDateInput: document.getElementById('profileDateInput'),
  updateProfileForm: document.getElementById('updateProfileForm'),
  updateGoalInput: document.getElementById('updateGoalInput'),
  updateDateInput: document.getElementById('updateDateInput'),
  updateProfileHint: document.getElementById('updateProfileHint'),
  settingsStatus: document.getElementById('settingsStatus'),
  tabButtons: document.querySelectorAll('[data-view]'),
  views: {
    dashboard: document.getElementById('dashboardView'),
    settings: document.getElementById('settingsView')
  }
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
  chart: null,
  profiles: [],
  activeProfile: null
};

const currentYear = new Date().getFullYear();

setActiveProfile(DEFAULT_PROFILE, { skipData: true });

if (configError) {
  selectors.error.textContent = configError;
  disableForm();
  setSettingsAvailability(false);
} else {
  selectors.error.textContent = '';
  setSettingsAvailability(true);
  loadProfiles().catch((error) => {
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
  const userName = getActiveUserName();

  if (!count || count <= 0 || !date) {
    selectors.error.textContent = 'Fyll i både antal och datum.';
    return;
  }

  if (!userName) {
    selectors.error.textContent = 'Skapa eller välj en profil innan du sparar pass.';
    return;
  }

  try {
    await addDoc(collection(firestore, 'pushups'), {
      user: userName,
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

if (selectors.profileLookupForm) {
  selectors.profileLookupForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!firestore) {
      showLookupMessage('Firebase-konfiguration krävs för att byta profil.', 'error');
      return;
    }

    if (!selectors.profileLookupInput) {
      return;
    }

    const name = selectors.profileLookupInput.value.trim();

    if (!name) {
      showLookupMessage('Ange ett profilnamn.', 'error');
      return;
    }

    const normalizedName = name.toLowerCase();
    const profile = state.profiles.find(
      (item) => item.name.toLowerCase() === normalizedName
    );

    if (!profile) {
      showLookupMessage('Hittade ingen profil med det namnet. Skapa en ny nedan.', 'error');
      return;
    }

    setActiveProfile(profile, { forceReload: true });
    if (selectors.profileLookupInput) {
      selectors.profileLookupInput.value = profile.name;
    }
    showLookupMessage(`Bytte till profil ${profile.name}.`, 'success');
  });
}

if (selectors.createProfileForm) {
  selectors.createProfileForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!firestore) {
      return;
    }

    const name = selectors.profileNameInput.value.trim();
    const goalValue = Number(selectors.profileGoalInput.value);
    const targetDate = selectors.profileDateInput.value;

    if (!name || !targetDate || goalValue <= 0) {
      showSettingsMessage('Ange namn, mål och datum för profilen.', 'error');
      return;
    }

    if (!isValidDateString(targetDate)) {
      showSettingsMessage('Ogiltigt datumformat. Använd YYYY-MM-DD.', 'error');
      return;
    }

    const duplicate = state.profiles.find(
      (profile) => profile.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      showSettingsMessage('Det finns redan en profil med det namnet.', 'error');
      return;
    }

    try {
      const docRef = await addDoc(collection(firestore, 'profiles'), {
        name,
        goal: goalValue,
        targetDate
      });

      selectors.createProfileForm.reset();
      showSettingsMessage('Profilen skapades.', 'success');
      await loadProfiles(docRef.id);
    } catch (error) {
      console.error(error);
      showSettingsMessage('Kunde inte skapa profilen. Försök igen.', 'error');
    }
  });
}

if (selectors.updateProfileForm) {
  selectors.updateProfileForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!firestore) {
      return;
    }

    const active = state.activeProfile;
    if (!active || !active.id) {
      showSettingsMessage('Välj en profil att uppdatera.', 'error');
      return;
    }

    const goalValue = Number(selectors.updateGoalInput.value);
    const targetDate = selectors.updateDateInput.value;

    if (!goalValue || goalValue <= 0 || !targetDate) {
      showSettingsMessage('Ange både nytt mål och måldatum.', 'error');
      return;
    }

    if (!isValidDateString(targetDate)) {
      showSettingsMessage('Ogiltigt datumformat. Använd YYYY-MM-DD.', 'error');
      return;
    }

    try {
      const docRef = doc(firestore, 'profiles', active.id);
      await updateDoc(docRef, {
        goal: goalValue,
        targetDate
      });

      showSettingsMessage('Profilen uppdaterades.', 'success');
      await loadProfiles(active.id);
    } catch (error) {
      console.error(error);
      showSettingsMessage('Kunde inte uppdatera profilen. Försök igen.', 'error');
    }
  });
}

if (selectors.tabButtons) {
  selectors.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.getAttribute('data-view');
      setActiveView(view);
    });
  });
}

setActiveView('dashboard');

function disableForm() {
  selectors.entryForm.querySelectorAll('input, button').forEach((element) => {
    element.setAttribute('disabled', 'disabled');
  });
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function updateDaysLeft() {
  const targetDateStr = getActiveTargetDateStr();
  const targetDate = getActiveTargetDate();

  if (selectors.targetDateLabel) {
    selectors.targetDateLabel.textContent = targetDateStr || '–';
  }

  if (!targetDate) {
    selectors.daysLeft.textContent = '–';
    return 0;
  }

  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
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

  const userName = getActiveUserName();

  if (!userName) {
    state.entries = [];
    updateTotals(0);
    updatePerDay(0);
    renderChart(new Map());
    renderEntries();
    return;
  }

  const snapshot = await getDocs(
    query(collection(firestore, 'pushups'), where('user', '==', userName))
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

async function loadProfiles(preferredId) {
  if (!firestore) {
    state.profiles = [];
    setActiveProfile(DEFAULT_PROFILE);
    updateProfileLookupState();
    return;
  }

  const snapshot = await getDocs(collection(firestore, 'profiles'));
  const profiles = [];

  snapshot.forEach((docSnap) => {
    profiles.push(mapProfile(docSnap));
  });

  profiles.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  state.profiles = profiles;

  let nextProfile = null;

  if (preferredId) {
    nextProfile = profiles.find((profile) => profile.id === preferredId) ?? null;
  }

  if (!nextProfile && state.activeProfile?.id) {
    nextProfile = profiles.find((profile) => profile.id === state.activeProfile.id) ?? null;
  }

  if (!nextProfile && profiles.length > 0) {
    const defaultName = (DEFAULT_PROFILE.name ?? '').toLowerCase();
    nextProfile =
      profiles.find((profile) => profile.name.toLowerCase() === defaultName) ?? profiles[0];
  }

  if (nextProfile) {
    setActiveProfile(nextProfile, { forceReload: true });
  } else {
    setActiveProfile(DEFAULT_PROFILE, { forceReload: true });
  }

  updateProfileLookupState();
}

function mapProfile(docSnap) {
  const data = docSnap.data() ?? {};
  const goalValue = Number(data.goal ?? 0);
  const goal = Number.isFinite(goalValue) && goalValue > 0 ? goalValue : 0;
  const targetDate = typeof data.targetDate === 'string' ? data.targetDate : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  return {
    id: docSnap.id,
    name,
    goal,
    targetDate
  };
}

function setActiveProfile(profile, options = {}) {
  const normalized = normalizeProfile(profile);
  const previous = state.activeProfile;
  const changed =
    !previous ||
    previous.id !== normalized.id ||
    previous.name !== normalized.name ||
    previous.goal !== normalized.goal ||
    previous.targetDate !== normalized.targetDate;
  const sameProfileId = previous && previous.id === normalized.id;

  state.activeProfile = normalized;
  updateProfileUI();
  updateProfileForms();

  if (sameProfileId) {
    const currentTotal = calculateCurrentYearTotal();
    updateTotals(currentTotal);
    updatePerDay(currentTotal);
  } else {
    updateTotals(0);
    updatePerDay(0);
    state.entries = [];
    renderChart(new Map());
    renderEntries();
  }

  const shouldReload = (changed || options.forceReload) && firestore && !options.skipData;

  if (shouldReload) {
    loadData().catch((error) => {
      console.error(error);
      selectors.error.textContent =
        'Kunde inte ladda data. Kontrollera din nätverksanslutning eller Firebase-inställningar.';
    });
  }
}

function normalizeProfile(profile) {
  if (!profile) {
    return { ...DEFAULT_PROFILE };
  }

  const goalValue = Number(profile.goal ?? 0);
  const goal = Number.isFinite(goalValue) && goalValue > 0 ? goalValue : 0;
  const targetDate = typeof profile.targetDate === 'string' ? profile.targetDate : '';
  const name = typeof profile.name === 'string' ? profile.name.trim() : '';

  return {
    id: profile.id ?? null,
    name,
    goal,
    targetDate
  };
}

function updateProfileUI() {
  const profile = getActiveProfile();
  const displayName = profile.name || '–';

  if (selectors.activeUserName) {
    selectors.activeUserName.textContent = displayName;
  }

  if (selectors.historyUserName) {
    selectors.historyUserName.textContent = displayName;
  }

  if (selectors.targetDateLabel) {
    selectors.targetDateLabel.textContent = profile.targetDate || '–';
  }

  updateDaysLeft();
}

function updateProfileForms() {
  if (!selectors.updateProfileForm) {
    return;
  }

  const profile = getActiveProfile();
  const hasFirestore = Boolean(firestore);
  const hasPersistedProfile = Boolean(profile.id);

  selectors.updateGoalInput.value = profile.goal > 0 ? String(profile.goal) : '';
  selectors.updateDateInput.value = profile.targetDate || '';

  if (!hasFirestore) {
    setFormEnabled(selectors.updateProfileForm, false);
    if (selectors.updateProfileHint) {
      selectors.updateProfileHint.textContent =
        'Firebase-konfiguration krävs för att hantera profiler.';
    }
    return;
  }

  if (!hasPersistedProfile) {
    setFormEnabled(selectors.updateProfileForm, false);
    if (selectors.updateProfileHint) {
      selectors.updateProfileHint.textContent =
        'Sök upp en sparad profil för att uppdatera mål och datum.';
    }
    return;
  }

  setFormEnabled(selectors.updateProfileForm, true);

  if (selectors.updateProfileHint) {
    selectors.updateProfileHint.textContent = `Uppdatera mål och datum för ${profile.name}.`;
  }
}

function updateProfileLookupState() {
  if (!selectors.profileLookupForm) {
    return;
  }

  if (!firestore) {
    showLookupMessage('Firebase-konfiguration krävs för att byta profil.', 'error');
    if (selectors.profileLookupInput) {
      selectors.profileLookupInput.value = '';
    }
    return;
  }

  if (state.profiles.length === 0) {
    showLookupMessage('Ingen sparad profil hittades ännu. Skapa en ny nedan.', 'info');
    if (selectors.profileLookupInput) {
      selectors.profileLookupInput.value = '';
    }
    return;
  }

  const activeName = getActiveUserName();
  if (!activeName) {
    showLookupMessage('Ange ditt profilnamn för att visa statistik.', 'info');
    if (selectors.profileLookupInput) {
      selectors.profileLookupInput.value = '';
    }
    return;
  }

  if (selectors.profileLookupInput) {
    selectors.profileLookupInput.value = activeName;
  }
  showLookupMessage(`Aktiv profil: ${activeName}.`, 'info');
}

function setSettingsAvailability(enabled) {
  if (selectors.createProfileForm) {
    setFormEnabled(selectors.createProfileForm, enabled);
  }

  if (selectors.profileLookupForm) {
    setFormEnabled(selectors.profileLookupForm, enabled);
  }

  if (!enabled) {
    showSettingsMessage('', 'info');
    showLookupMessage('Firebase-konfiguration krävs för att byta profil.', 'error');
    if (selectors.updateProfileHint) {
      selectors.updateProfileHint.textContent =
        'Firebase-konfiguration krävs för att hantera profiler.';
    }
    setFormEnabled(selectors.updateProfileForm, false);
    return;
  }

  updateProfileForms();
  updateProfileLookupState();
}

function setFormEnabled(form, enabled) {
  if (!form) {
    return;
  }

  form.querySelectorAll('input, button, select, textarea').forEach((element) => {
    if (enabled) {
      element.removeAttribute('disabled');
    } else {
      element.setAttribute('disabled', 'disabled');
    }
  });
}

function setActiveView(view) {
  const target = view === 'settings' ? 'settings' : 'dashboard';

  if (selectors.views) {
    Object.entries(selectors.views).forEach(([key, element]) => {
      if (!element) {
        return;
      }

      if (key === target) {
        element.removeAttribute('hidden');
        element.classList.add('view-active');
      } else {
        element.setAttribute('hidden', 'hidden');
        element.classList.remove('view-active');
      }
    });
  }

  if (selectors.tabButtons) {
    selectors.tabButtons.forEach((button) => {
      const isActive = button.getAttribute('data-view') === target;
      button.classList.toggle('tab-button-active', isActive);
    });
  }
}

function getActiveProfile() {
  return state.activeProfile ?? { ...DEFAULT_PROFILE };
}

function getActiveUserName() {
  const profile = getActiveProfile();
  return profile.name || '';
}

function getActiveGoal() {
  const profile = getActiveProfile();
  const goal = Number(profile.goal ?? 0);
  return Number.isFinite(goal) && goal > 0 ? goal : 0;
}

function getActiveTargetDateStr() {
  const profile = getActiveProfile();
  return profile.targetDate || '';
}

function getActiveTargetDate() {
  const targetDateStr = getActiveTargetDateStr();
  if (!targetDateStr) {
    return null;
  }

  const date = new Date(`${targetDateStr}T00:00:00`);
  return isValidDate(date) ? date : null;
}

function showSettingsMessage(message, type = 'info') {
  if (!selectors.settingsStatus) {
    return;
  }

  selectors.settingsStatus.textContent = message;
  selectors.settingsStatus.className = 'status-message';

  if (type === 'success') {
    selectors.settingsStatus.classList.add('status-message--success');
  } else if (type === 'error') {
    selectors.settingsStatus.classList.add('status-message--error');
  }
}

function showLookupMessage(message, type = 'info') {
  if (!selectors.profileLookupStatus) {
    return;
  }

  selectors.profileLookupStatus.textContent = message;
  selectors.profileLookupStatus.className = 'status-message';

  if (type === 'success') {
    selectors.profileLookupStatus.classList.add('status-message--success');
  } else if (type === 'error') {
    selectors.profileLookupStatus.classList.add('status-message--error');
  }
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function calculateCurrentYearTotal() {
  const yearPrefix = String(currentYear);
  return state.entries.reduce((sum, entry) => {
    if (entry.date && entry.date.startsWith(yearPrefix)) {
      const count = Number(entry.count ?? 0);
      return sum + (Number.isFinite(count) ? count : 0);
    }
    return sum;
  }, 0);
}

function updateTotals(totalYear) {
  selectors.totalYear.textContent = formatNumber(totalYear);

  const goal = getActiveGoal();
  const hasGoal = goal > 0;
  const progress = hasGoal ? Math.min(100, (totalYear / goal) * 100) : 0;
  selectors.progressBarInner.style.width = `${progress.toFixed(1)}%`;

  const goalDisplay = hasGoal ? formatNumber(goal) : '–';
  const progressDisplay = hasGoal ? progress.toFixed(1).replace('.', ',') : '0,0';

  selectors.goalText.innerHTML = `${formatNumber(totalYear)} av ${goalDisplay} (` +
    `${progressDisplay}&nbsp;%)`;

  if (selectors.goalChip) {
    selectors.goalChip.textContent = hasGoal ? `Mål: ${goalDisplay}` : 'Mål saknas';
  }

  if (selectors.goalLabel) {
    selectors.goalLabel.textContent = hasGoal ? goalDisplay : '–';
  }
}

function updatePerDay(totalYear) {
  const daysLeft = updateDaysLeft();
  const goal = getActiveGoal();

  if (daysLeft <= 0 || goal <= 0) {
    selectors.perDayNeeded.textContent = '0';
    return;
  }

  const remaining = Math.max(0, goal - totalYear);
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
