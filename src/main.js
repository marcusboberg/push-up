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
  deleteDoc,
  limit
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
};

const GOAL = Number(import.meta.env.VITE_APP_GOAL ?? 10_000);

const ENV_DEFAULT_GOAL = Number.isFinite(GOAL) && GOAL > 0 ? GOAL : 0;
const DEFAULT_PROFILE = {
  id: null,
  name: '',
  goal: 0
};
const ACTIVE_PROFILE_STORAGE_KEY = 'pushup-active-profile';
const selectors = {
  totalYear: document.getElementById('totalYear'),
  goalText: document.getElementById('goalText'),
  goalChip: document.getElementById('goalChip'),
  progressBarInner: document.getElementById('progressBarInner'),
  daysLeft: document.getElementById('daysLeft'),
  targetDateLabel: document.getElementById('targetDateLabel'),
  perDayNeeded: document.getElementById('perDayNeeded'),
  goalLabel: document.getElementById('goalLabel'),
  streakCard: document.getElementById('streakCard'),
  streakCurrent: document.getElementById('streakCurrent'),
  streakBest: document.getElementById('streakBest'),
  activeUserName: document.getElementById('activeUserName'),
  historyUserName: document.getElementById('historyUserName'),
  countInput: document.getElementById('countInput'),
  dateInput: document.getElementById('dateInput'),
  entryForm: document.getElementById('entryForm'),
  entrySubmitButton: document.getElementById('entrySubmitButton'),
  error: document.getElementById('error'),
  entriesList: document.getElementById('entriesList'),
  profileLookupForm: document.getElementById('profileLookupForm'),
  profileLookupInput: document.getElementById('profileLookupInput'),
  profileLookupStatus: document.getElementById('profileLookupStatus'),
  createProfileForm: document.getElementById('createProfileForm'),
  profileNameInput: document.getElementById('profileNameInput'),
  profileGoalInput: document.getElementById('profileGoalInput'),
  updateProfileForm: document.getElementById('updateProfileForm'),
  updateGoalInput: document.getElementById('updateGoalInput'),
  updateProfileHint: document.getElementById('updateProfileHint'),
  settingsStatus: document.getElementById('settingsStatus'),
  profileGate: document.getElementById('profileGate'),
  profileGateExistingForm: document.getElementById('profileGateExistingForm'),
  profileGateExistingInput: document.getElementById('profileGateExistingInput'),
  profileGateExistingStatus: document.getElementById('profileGateExistingStatus'),
  profileGateCreateForm: document.getElementById('profileGateCreateForm'),
  profileGateCreateNameInput: document.getElementById('profileGateCreateNameInput'),
  profileGateCreateGoalInput: document.getElementById('profileGateCreateGoalInput'),
  profileGateCreateStatus: document.getElementById('profileGateCreateStatus'),
  openSettingsButton: document.getElementById('openSettingsButton'),
  closeSettingsButton: document.getElementById('closeSettingsButton'),
  cardToggles: document.querySelectorAll('[data-toggle-card]'),
  views: {
    dashboard: document.getElementById('dashboardView'),
    settings: document.getElementById('settingsView')
  }
};

const swedishNumberFormatter = new Intl.NumberFormat('sv-SE');

const state = {
  entries: [],
  zeroDays: [],
  streak: {
    current: 0,
    best: 0
  },
  chart: null,
  profiles: [],
  activeProfile: null,
  storedProfilePreference: loadStoredProfilePreference()
};

const currentYear = new Date().getFullYear();

const collapsibleCards = new Map();

initializeCollapsibles();
updateEntryButtonState();

if (selectors.profileGoalInput && ENV_DEFAULT_GOAL > 0) {
  selectors.profileGoalInput.value = String(ENV_DEFAULT_GOAL);
}

if (selectors.profileGateCreateGoalInput && ENV_DEFAULT_GOAL > 0) {
  selectors.profileGateCreateGoalInput.value = String(ENV_DEFAULT_GOAL);
}

const today = new Date();
selectors.dateInput.value = toDateInputValue(today);
updateEntryButtonState();

if (selectors.dateInput) {
  selectors.dateInput.addEventListener('change', updateEntryButtonState);
  selectors.dateInput.addEventListener('input', updateEntryButtonState);
}

if (selectors.updateGoalInput) {
  selectors.updateGoalInput.addEventListener('input', (event) => {
    event.target.value = sanitizeNumericInput(event.target.value);
  });

  selectors.updateGoalInput.addEventListener('blur', () => {
    selectors.updateGoalInput.value = formatGoalInputDisplay(selectors.updateGoalInput.value);
  });
}

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

setActiveProfile(DEFAULT_PROFILE, { skipData: true, skipPersistence: true });

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
  const entry = findEntryByIdIncludingPlaceholders(id);
  if (!entry) {
    return;
  }

  const action = button.getAttribute('data-action');

  if (entry.isZeroPlaceholder && action === 'add-missing') {
    await handleAddForMissingDay(entry);
  } else if (action === 'edit') {
    await handleEdit(entry);
  } else if (action === 'delete') {
    await handleDelete(entry);
  }
});

if (selectors.profileLookupForm) {
  selectors.profileLookupForm.addEventListener('submit', async (event) => {
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

    let profile = findProfileByName(name);

    if (!profile) {
      let fetchFailed = false;
      setFormEnabled(selectors.profileLookupForm, false);
      showLookupMessage('Söker efter profil…', 'info');

      try {
        profile = await fetchProfileByNameRemote(name);
      } catch (error) {
        console.error(error);
        fetchFailed = true;
        showLookupMessage('Kunde inte hämta profil. Försök igen.', 'error');
      } finally {
        setFormEnabled(selectors.profileLookupForm, true);
      }

      if (fetchFailed) {
        return;
      }
    }

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

if (selectors.profileGateExistingForm) {
  selectors.profileGateExistingForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!firestore) {
      setStatusMessage(
        selectors.profileGateExistingStatus,
        'Firebase-konfiguration krävs för att välja en profil.',
        'error'
      );
      return;
    }

    if (!selectors.profileGateExistingInput) {
      return;
    }

    const name = selectors.profileGateExistingInput.value.trim();

    if (!name) {
      setStatusMessage(selectors.profileGateExistingStatus, 'Ange ett profilnamn.', 'error');
      return;
    }

    let profile = findProfileByName(name);

    if (!profile) {
      let fetchFailed = false;
      setFormEnabled(selectors.profileGateExistingForm, false);
      setStatusMessage(selectors.profileGateExistingStatus, 'Söker efter profil…', 'info');

      try {
        profile = await fetchProfileByNameRemote(name);
      } catch (error) {
        console.error(error);
        fetchFailed = true;
        setStatusMessage(
          selectors.profileGateExistingStatus,
          'Kunde inte hämta profil. Försök igen.',
          'error'
        );
      } finally {
        setFormEnabled(selectors.profileGateExistingForm, true);
      }

      if (fetchFailed) {
        return;
      }
    }

    if (!profile) {
      setStatusMessage(
        selectors.profileGateExistingStatus,
        'Hittade ingen profil med det namnet. Försök igen eller skapa en ny profil.',
        'error'
      );
      return;
    }

    selectors.profileGateExistingForm.reset();
    setActiveProfile(profile, { forceReload: true });
  });
}

if (selectors.profileGateCreateForm) {
  selectors.profileGateCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!firestore) {
      setStatusMessage(
        selectors.profileGateCreateStatus,
        'Firebase-konfiguration krävs för att skapa en profil.',
        'error'
      );
      return;
    }

    const name = selectors.profileGateCreateNameInput?.value.trim() ?? '';
    const goalValue = Number(selectors.profileGateCreateGoalInput?.value);

    if (!name || goalValue <= 0) {
      setStatusMessage(
        selectors.profileGateCreateStatus,
        'Ange namn och mål för profilen.',
        'error'
      );
      return;
    }

    const duplicate = findProfileByName(name);

    if (duplicate) {
      setStatusMessage(
        selectors.profileGateCreateStatus,
        'Det finns redan en profil med det namnet. Ange ett annat namn.',
        'error'
      );
      return;
    }

    try {
      const docRef = await addDoc(collection(firestore, 'profiles'), {
        name,
        goal: goalValue
      });

      selectors.profileGateCreateForm.reset();
      if (selectors.profileGateCreateGoalInput && ENV_DEFAULT_GOAL > 0) {
        selectors.profileGateCreateGoalInput.value = String(ENV_DEFAULT_GOAL);
      }

      await loadProfiles(docRef.id);
    } catch (error) {
      console.error(error);
      setStatusMessage(
        selectors.profileGateCreateStatus,
        'Kunde inte skapa profilen. Försök igen.',
        'error'
      );
    }
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

    if (!name || goalValue <= 0) {
      showSettingsMessage('Ange namn och mål för profilen.', 'error');
      return;
    }

    const duplicate = findProfileByName(name);

    if (duplicate) {
      showSettingsMessage('Det finns redan en profil med det namnet.', 'error');
      return;
    }

    try {
      const docRef = await addDoc(collection(firestore, 'profiles'), {
        name,
        goal: goalValue
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

    const goalValue = parseGoalInputValue(selectors.updateGoalInput.value);

    if (!Number.isFinite(goalValue) || goalValue <= 0) {
      showSettingsMessage('Ange ett mål som är större än noll.', 'error');
      return;
    }

    try {
      const docRef = doc(firestore, 'profiles', active.id);
      await updateDoc(docRef, {
        goal: goalValue
      });

      showSettingsMessage('Profilen uppdaterades.', 'success');
      await loadProfiles(active.id);
    } catch (error) {
      console.error(error);
      showSettingsMessage('Kunde inte uppdatera profilen. Försök igen.', 'error');
    }
  });
}

if (selectors.openSettingsButton) {
  selectors.openSettingsButton.addEventListener('click', () => {
    setActiveView('settings');
  });
}

if (selectors.closeSettingsButton) {
  selectors.closeSettingsButton.addEventListener('click', () => {
    setActiveView('dashboard');
  });
}

setActiveView('dashboard');

function disableForm() {
  selectors.entryForm.querySelectorAll('input, button').forEach((element) => {
    element.setAttribute('disabled', 'disabled');
  });
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

async function loadData() {
  if (!firestore) {
    return;
  }

  selectors.error.textContent = '';

  const userName = getActiveUserName();

  if (!userName) {
    state.entries = [];
    state.zeroDays = [];
    state.streak = { current: 0, best: 0 };
    updateTotals(0);
    updateProjection(0);
    updateStreakDisplay(state.streak);
    renderChart(new Map());
    renderEntries();
    return;
  }

  const snapshot = await getDocs(
    query(collection(firestore, 'pushups'), where('user', '==', userName))
  );

  state.entries = [];
  state.zeroDays = [];

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

  const zeroDays = computeZeroDays(dailyTotals);
  state.zeroDays = zeroDays;
  const streaks = calculateStreaks(dailyTotals);
  state.streak = streaks;

  updateTotals(totalYear);
  updateProjection(totalYear);
  updateStreakDisplay(streaks);
  renderChart(dailyTotals, new Set(zeroDays));
  renderEntries();
}

async function loadProfiles(preferredId) {
  if (!firestore) {
    state.profiles = [];
    setActiveProfile(DEFAULT_PROFILE, { skipData: true, skipPersistence: true });
    updateProfileLookupState();
    updateProfileGateUI();
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

  if (!nextProfile && state.storedProfilePreference) {
    const { id, name } = state.storedProfilePreference;

    if (id) {
      nextProfile = profiles.find((profile) => profile.id === id) ?? null;
    }

    if (!nextProfile && name) {
      nextProfile = findProfileByName(name);
    }
  }

  if (nextProfile) {
    setActiveProfile(nextProfile, { forceReload: true });
  } else {
    setActiveProfile(DEFAULT_PROFILE, { skipData: true, skipPersistence: true });
  }

  updateProfileLookupState();
  updateProfileGateUI();
}

function mapProfile(docSnap) {
  const data = docSnap.data() ?? {};
  const goalValue = Number(data.goal ?? 0);
  const goal = Number.isFinite(goalValue) && goalValue > 0 ? goalValue : 0;
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  return {
    id: docSnap.id,
    name,
    goal
  };
}

function upsertProfile(profile) {
  if (!profile) {
    return;
  }

  const existingIndex = state.profiles.findIndex((item) => item.id === profile.id);

  if (existingIndex >= 0) {
    state.profiles[existingIndex] = profile;
  } else {
    state.profiles.push(profile);
  }

  state.profiles.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

function setActiveProfile(profile, options = {}) {
  const normalized = normalizeProfile(profile);
  const previous = state.activeProfile;
  const changed =
    !previous ||
    previous.id !== normalized.id ||
    previous.name !== normalized.name ||
    previous.goal !== normalized.goal;
  const sameProfileId = previous && previous.id === normalized.id;

  state.activeProfile = normalized;
  updateProfileUI();
  updateProfileForms();
  updateProfileGateUI();

  if (!options.skipPersistence) {
    state.storedProfilePreference = persistActiveProfile(normalized);
  }

  if (sameProfileId) {
    const currentTotal = calculateCurrentYearTotal();
    updateTotals(currentTotal);
    updateProjection(currentTotal);
  } else {
    updateTotals(0);
    updateProjection(0);
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
  const name = typeof profile.name === 'string' ? profile.name.trim() : '';

  return {
    id: profile.id ?? null,
    name,
    goal
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
}

function updateProfileForms() {
  if (!selectors.updateProfileForm) {
    return;
  }

  const profile = getActiveProfile();
  const hasFirestore = Boolean(firestore);
  const hasPersistedProfile = Boolean(profile.id);

  selectors.updateGoalInput.value = profile.goal > 0 ? formatGoalInputDisplay(profile.goal) : '';

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
        'Sök upp en sparad profil för att uppdatera målet.';
    }
    return;
  }

  setFormEnabled(selectors.updateProfileForm, true);

  if (selectors.updateProfileHint) {
    selectors.updateProfileHint.textContent = `Uppdatera mål för ${profile.name}.`;
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
    updateProfileGateUI();
    return;
  }

  updateProfileForms();
  updateProfileLookupState();
  updateProfileGateUI();
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
  const isSettings = target === 'settings';

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

  if (selectors.openSettingsButton) {
    selectors.openSettingsButton.toggleAttribute('hidden', isSettings);
  }

  if (selectors.closeSettingsButton) {
    selectors.closeSettingsButton.toggleAttribute('hidden', !isSettings);
  }
}

function initializeCollapsibles() {
  if (!selectors.cardToggles) {
    return;
  }

  selectors.cardToggles.forEach((button) => {
    const targetId = button.getAttribute('data-toggle-card');
    if (!targetId) {
      return;
    }

    const card = document.getElementById(targetId);
    if (!card) {
      return;
    }

    collapsibleCards.set(targetId, { button, card });

    button.addEventListener('click', () => {
      if (card.hasAttribute('hidden')) {
        openCollapsible(targetId);
      } else {
        closeCollapsible(targetId);
      }
    });
  });
}

function openCollapsible(id, options = {}) {
  const pair = collapsibleCards.get(id);
  if (!pair) {
    return;
  }

  const { card, button } = pair;
  card.removeAttribute('hidden');
  button.setAttribute('aria-expanded', 'true');
  button.classList.add('card-toggle-active');

  if (options.focus === false) {
    return;
  }

  const focusTarget = card.querySelector('input, select, textarea, button');
  if (focusTarget) {
    requestAnimationFrame(() => {
      focusTarget.focus();
    });
  }
}

function closeCollapsible(id) {
  const pair = collapsibleCards.get(id);
  if (!pair) {
    return;
  }

  const { card, button } = pair;
  card.setAttribute('hidden', 'hidden');
  button.setAttribute('aria-expanded', 'false');
  button.classList.remove('card-toggle-active');
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

function setStatusMessage(element, message, type = 'info') {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = 'status-message';

  if (type === 'success') {
    element.classList.add('status-message--success');
  } else if (type === 'error') {
    element.classList.add('status-message--error');
  }
}

function showSettingsMessage(message, type = 'info') {
  setStatusMessage(selectors.settingsStatus, message, type);
}

function showLookupMessage(message, type = 'info') {
  openCollapsible('activeProfileCard', { focus: false });
  setStatusMessage(selectors.profileLookupStatus, message, type);
}

function updateProfileGateUI() {
  const gate = selectors.profileGate;
  if (!gate) {
    return;
  }

  const hasFirestore = Boolean(firestore);
  const hasActiveName = Boolean(getActiveUserName());
  const shouldShow = hasFirestore && !hasActiveName;

  if (shouldShow) {
    gate.removeAttribute('hidden');
  } else {
    gate.setAttribute('hidden', 'hidden');
  }

  const existingForm = selectors.profileGateExistingForm;
  const createForm = selectors.profileGateCreateForm;

  if (!hasFirestore) {
    setFormEnabled(existingForm, false);
    setFormEnabled(createForm, false);
    setStatusMessage(selectors.profileGateExistingStatus, '', 'info');
    setStatusMessage(selectors.profileGateCreateStatus, '', 'info');
    return;
  }

  const hasProfiles = state.profiles.length > 0;

  setFormEnabled(createForm, true);
  setFormEnabled(existingForm, hasProfiles);

  if (!hasProfiles) {
    if (selectors.profileGateExistingInput) {
      selectors.profileGateExistingInput.value = '';
    }
    setStatusMessage(
      selectors.profileGateExistingStatus,
      'Ingen profil hittades ännu. Skapa en ny nedan.',
      'info'
    );
  } else if (shouldShow) {
    setStatusMessage(
      selectors.profileGateExistingStatus,
      'Skriv namnet på din profil för att fortsätta.',
      'info'
    );
  } else {
    setStatusMessage(selectors.profileGateExistingStatus, '', 'info');
  }

  if (shouldShow) {
    const storedName = state.storedProfilePreference?.name ?? '';

    if (
      selectors.profileGateExistingInput &&
      !selectors.profileGateExistingInput.value &&
      storedName
    ) {
      selectors.profileGateExistingInput.value = storedName;
    }

    const focusTarget = hasProfiles
      ? selectors.profileGateExistingInput
      : selectors.profileGateCreateNameInput;
    if (focusTarget && document.activeElement !== focusTarget) {
      focusTarget.focus();
    }

    setStatusMessage(selectors.profileGateCreateStatus, '', 'info');
  } else {
    setStatusMessage(selectors.profileGateCreateStatus, '', 'info');
  }
}

function findProfileByName(name) {
  const normalized = (name ?? '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return state.profiles.find((profile) => profile.name.toLowerCase() === normalized) ?? null;
}

async function fetchProfileByNameRemote(name) {
  if (!firestore) {
    return null;
  }

  const trimmed = (name ?? '').trim();

  if (!trimmed) {
    return null;
  }

  const profileQuery = query(
    collection(firestore, 'profiles'),
    where('name', '==', trimmed),
    limit(1)
  );

  const snapshot = await getDocs(profileQuery);

  if (snapshot.empty) {
    return null;
  }

  const profile = mapProfile(snapshot.docs[0]);
  upsertProfile(profile);
  return profile;
}

function loadStoredProfilePreference() {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const id = typeof parsed.id === 'string' && parsed.id ? parsed.id : null;
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';

    if (id || name) {
      return { id, name };
    }
  } catch (error) {
    console.warn('Kunde inte läsa sparad profil från localStorage.', error);
  }

  return null;
}

function persistActiveProfile(profile) {
  if (!profile) {
    return null;
  }

  const data = {};

  if (profile.id) {
    data.id = profile.id;
  }

  if (profile.name) {
    data.name = profile.name;
  }

  const hasData = Boolean(data.id || data.name);

  if (!canUseLocalStorage()) {
    return hasData ? { id: data.id ?? null, name: data.name ?? '' } : null;
  }

  try {
    if (hasData) {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, JSON.stringify(data));
    } else {
      window.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Kunde inte spara aktiv profil lokalt.', error);
  }

  return hasData ? { id: data.id ?? null, name: data.name ?? '' } : null;
}

function canUseLocalStorage() {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch (error) {
    return false;
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

function updateProjection(totalYear) {
  const { averagePerDay, daysRemaining, estimatedDate } = calculateGoalProjection(totalYear);

  if (selectors.perDayNeeded) {
    const perDayText = averagePerDay > 0 ? averagePerDay.toFixed(1).replace('.', ',') : '0';
    selectors.perDayNeeded.textContent = perDayText;
  }

  if (selectors.daysLeft) {
    if (typeof daysRemaining === 'number' && daysRemaining >= 0) {
      selectors.daysLeft.textContent = String(daysRemaining);
    } else {
      selectors.daysLeft.textContent = '–';
    }
  }

  if (selectors.targetDateLabel) {
    selectors.targetDateLabel.textContent = estimatedDate ? toDateInputValue(estimatedDate) : '–';
  }
}

function updateStreakDisplay(streak = { current: 0, best: 0 }) {
  const currentValue = Math.max(0, Number(streak.current ?? 0));
  const bestValue = Math.max(0, Number(streak.best ?? 0));

  if (selectors.streakCurrent) {
    selectors.streakCurrent.textContent = String(currentValue);
  }

  if (selectors.streakBest) {
    selectors.streakBest.textContent = String(bestValue);
  }

  if (selectors.streakCard) {
    const isHot = currentValue >= 7;
    selectors.streakCard.setAttribute('data-hot', String(isHot));
  }
}

function calculateGoalProjection(totalYear) {
  const goal = getActiveGoal();
  const baseResult = {
    averagePerDay: 0,
    daysRemaining: null,
    estimatedDate: null
  };

  if (goal <= 0) {
    return baseResult;
  }

  const firstEntryDate = getFirstEntryDateForCurrentYear();
  if (!firstEntryDate) {
    return baseResult;
  }

  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  let daysActive = Math.floor((today.getTime() - firstEntryDate.getTime()) / msPerDay) + 1;
  if (daysActive < 1) {
    daysActive = 1;
  }

  const averagePerDay = daysActive > 0 ? totalYear / daysActive : 0;

  if (averagePerDay <= 0) {
    return { ...baseResult, averagePerDay };
  }

  if (totalYear >= goal) {
    return {
      averagePerDay,
      daysRemaining: 0,
      estimatedDate: today
    };
  }

  const remaining = goal - totalYear;
  const daysRemaining = Math.max(0, Math.ceil(remaining / averagePerDay));
  const estimatedDate = addDays(today, daysRemaining);

  return {
    averagePerDay,
    daysRemaining,
    estimatedDate
  };
}

function getFirstEntryDateForCurrentYear() {
  const yearPrefix = String(currentYear);
  let firstDateStr = null;

  state.entries.forEach((entry) => {
    if (typeof entry.date !== 'string' || !entry.date.startsWith(yearPrefix)) {
      return;
    }

    if (!isValidDateString(entry.date)) {
      return;
    }

    if (!firstDateStr || entry.date < firstDateStr) {
      firstDateStr = entry.date;
    }
  });

  if (!firstDateStr) {
    return null;
  }

  const date = new Date(`${firstDateStr}T00:00:00`);
  return isValidDate(date) ? date : null;
}

function computeZeroDays(dailyTotals) {
  if (state.entries.length === 0) {
    return [];
  }

  const firstEntryDate = getFirstEntryDateForCurrentYear();

  if (!firstEntryDate) {
    return [];
  }

  const zeroDays = [];
  const today = new Date();
  const todayStr = toDateInputValue(today);
  const cursor = new Date(firstEntryDate);
  const endOfRange = today.getFullYear() === currentYear
    ? today
    : new Date(`${currentYear}-12-31T00:00:00`);

  while (cursor <= endOfRange) {
    const dateStr = toDateInputValue(cursor);
    const isCurrentYear = dateStr.startsWith(String(currentYear));
    const isBeforeToday = dateStr !== todayStr;
    if (isCurrentYear && isBeforeToday && !dailyTotals.has(dateStr)) {
      zeroDays.push(dateStr);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return zeroDays;
}

function calculateStreaks(dailyTotals) {
  const yearPrefix = String(currentYear);
  const activeDates = Array.from(dailyTotals.entries())
    .filter(([date, count]) =>
      typeof date === 'string' &&
      date.startsWith(yearPrefix) &&
      Number(count ?? 0) > 0
    )
    .map(([date]) => date);

  if (activeDates.length === 0) {
    return { current: 0, best: 0 };
  }

  const sortedDates = [...activeDates].sort();
  const msPerDay = 1000 * 60 * 60 * 24;
  let best = 0;
  let running = 0;
  let previousDate = null;

  sortedDates.forEach((dateStr) => {
    if (!previousDate) {
      running = 1;
    } else {
      const prev = new Date(`${previousDate}T00:00:00`);
      const current = new Date(`${dateStr}T00:00:00`);
      const diffDays = Math.round((current.getTime() - prev.getTime()) / msPerDay);
      running = diffDays === 1 ? running + 1 : 1;
    }

    if (running > best) {
      best = running;
    }

    previousDate = dateStr;
  });

  const lookup = new Set(activeDates);
  const today = new Date();
  const anchorDates = [toDateInputValue(today), toDateInputValue(addDays(today, -1))];
  let startDate = anchorDates.find((date) => lookup.has(date) && date.startsWith(yearPrefix)) ?? null;
  let currentStreak = 0;

  if (startDate) {
    currentStreak = 1;
    const cursor = new Date(`${startDate}T00:00:00`);

    while (true) {
      cursor.setDate(cursor.getDate() - 1);
      const dateStr = toDateInputValue(cursor);

      if (!dateStr.startsWith(yearPrefix) || !lookup.has(dateStr)) {
        break;
      }

      currentStreak += 1;
    }
  }

  return {
    current: currentStreak,
    best: Math.max(best, currentStreak)
  };
}

function renderChart(dailyTotals, zeroDaySet = new Set()) {
  const canvas = document.getElementById('pushupChart');
  if (!canvas) {
    return;
  }

  const zeroDayLookup = zeroDaySet instanceof Set ? zeroDaySet : new Set(zeroDaySet);
  const timelineSet = new Set([...dailyTotals.keys(), ...zeroDayLookup]);
  let timelineDates = Array.from(timelineSet).sort();
  let labels = timelineDates.map((date) => date.slice(5).replace('-', '/'));
  let values = timelineDates.map((date) =>
    dailyTotals.has(date) ? Number(dailyTotals.get(date) ?? 0) : null
  );

  const sevenDayAverageData = timelineDates.map((date, index) => {
    if (!date) {
      return null;
    }

    const windowStart = Math.max(0, index - 6);
    const windowDates = timelineDates.slice(windowStart, index + 1);
    const windowTotal = windowDates.reduce((sum, windowDate) => {
      if (!windowDate) {
        return sum;
      }

      return sum + Number(dailyTotals.get(windowDate) ?? 0);
    }, 0);

    const divisor = windowDates.filter(Boolean).length;
    if (divisor === 0) {
      return null;
    }

    return Number((windowTotal / divisor).toFixed(1));
  });

  if (state.chart) {
    state.chart.destroy();
  }

  const context = canvas.getContext('2d');
  const datasets = [
    {
      label: 'Armhävningar per dag',
      data: values,
      tension: 0.3,
      borderColor: 'rgba(79, 140, 255, 0.85)',
      backgroundColor: 'rgba(79, 140, 255, 0.25)',
      fill: true,
      pointRadius: 3,
      pointBackgroundColor: '#4f8cff',
      spanGaps: true
    }
  ];

  const todayStr = toDateInputValue(new Date());
  const todayIndex = timelineDates.indexOf(todayStr);

  if (todayIndex >= 0) {
    const historicalDates = timelineDates.filter(
      (date) => date && date < todayStr && dailyTotals.has(date)
    );
    const windowDates = historicalDates.slice(-7);
    const windowTotal = windowDates.reduce(
      (sum, date) => sum + Number(dailyTotals.get(date) ?? 0),
      0
    );
    const average = windowDates.length > 0 ? windowTotal / windowDates.length : 0;

    if (average > 0) {
      const forecastValue = Number(average.toFixed(1));
      labels = [...labels, 'Prognos'];
      timelineDates = [...timelineDates, null];
      values = [...values, null];
      datasets[0].data = values;

      sevenDayAverageData.push(forecastValue);
    } else {
      datasets[0].data = values;
    }
  } else {
    datasets[0].data = values;
  }

  if (sevenDayAverageData.some((value) => Number.isFinite(value) && value > 0)) {
    datasets.push({
      label: '7-dagars snitt',
      data: sevenDayAverageData,
      tension: 0.3,
      borderColor: 'rgba(255, 214, 102, 0.85)',
      borderDash: [6, 4],
      spanGaps: true,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 0
    });
  }

  if (zeroDayLookup.size > 0) {
    const zeroData = timelineDates.map((date) =>
      date && zeroDayLookup.has(date) ? 0 : null
    );

    datasets.push({
      label: 'Missad dag',
      data: zeroData,
      showLine: false,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: '#ff6b6b',
      pointBorderColor: '#ff6b6b',
      borderWidth: 0
    });
  }

  state.chart = new Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      interaction: {
        mode: 'index',
        axis: 'x',
        intersect: false
      },
      hover: {
        mode: 'index',
        intersect: false
      },
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
          },
          beginAtZero: true
        }
      }
    }
  });
}

function renderEntries() {
  updateEntryButtonState();

  const container = selectors.entriesList;
  if (!container) {
    return;
  }

  const entriesWithZeroDays = getEntriesWithZeroDays();

  if (entriesWithZeroDays.length === 0) {
    container.innerHTML = '<div class="card-footnote">Inga pass registrerade ännu.</div>';
    return;
  }

  const sorted = [...entriesWithZeroDays].sort((a, b) => {
    const dateA = a.date ?? '';
    const dateB = b.date ?? '';

    if (dateA === dateB) {
      if (a.isZeroPlaceholder !== b.isZeroPlaceholder) {
        return a.isZeroPlaceholder ? 1 : -1;
      }

      return (b.count ?? 0) - (a.count ?? 0);
    }

    return dateA < dateB ? 1 : -1;
  });

  container.innerHTML = sorted
    .map((entry) => {
      const safeDate = entry.date ?? '';
      const safeCount = Number(entry.count ?? 0);

      if (entry.isZeroPlaceholder) {
        return `
          <div class="entry-row entry-row-zero" data-id="${entry.id}">
            <div class="entry-main">
              <div class="entry-date">${safeDate}</div>
              <div class="entry-count">Inget pass registrerat</div>
            </div>
            <div class="entry-actions">
              <button type="button" data-action="add-missing">Lägg till</button>
            </div>
          </div>
        `;
      }

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

function getEntriesWithZeroDays() {
  if (state.entries.length === 0) {
    return [];
  }

  return [...state.entries, ...getZeroDayPlaceholders()];
}

function getZeroDayPlaceholders() {
  return state.zeroDays.map((date) => ({
    id: `zero-${date}`,
    date,
    count: 0,
    isZeroPlaceholder: true
  }));
}

function findEntryByIdIncludingPlaceholders(id) {
  if (!id) {
    return null;
  }

  const entry = state.entries.find((item) => item.id === id);
  if (entry) {
    return entry;
  }

  return getZeroDayPlaceholders().find((item) => item.id === id) ?? null;
}

function updateEntryButtonState() {
  const button = selectors.entrySubmitButton;
  if (!button) {
    return;
  }

  const dateValue = selectors.dateInput?.value ?? '';
  const hasDate = Boolean(dateValue);

  if (!hasDate) {
    button.textContent = 'Spara pass';
    button.setAttribute('aria-label', 'Spara pass');
    button.setAttribute('title', 'Spara pass');
    return;
  }

  const hasExistingEntries = state.entries.some((entry) => entry.date === dateValue);

  if (hasExistingEntries) {
    button.textContent = 'Addera';
    button.setAttribute('aria-label', 'Addera fler armhävningar för dagen');
    button.setAttribute('title', 'Addera fler armhävningar för dagen');
  } else {
    button.textContent = 'Spara första passet';
    button.setAttribute('aria-label', 'Spara första passet för dagen');
    button.setAttribute('title', 'Spara första passet för dagen');
  }
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

async function handleAddForMissingDay(entry) {
  if (!firestore) {
    window.alert('Firebase-konfiguration krävs för att lägga till pass.');
    return;
  }

  const userName = getActiveUserName();
  if (!userName) {
    window.alert('Skapa eller välj en profil innan du lägger till pass.');
    return;
  }

  const countPrompt = `Antal armhävningar att registrera för ${entry.date}:`;
  const newCountStr = window.prompt(countPrompt, '');
  if (newCountStr === null) {
    return;
  }

  const newCount = Number(newCountStr);
  if (!Number.isFinite(newCount) || newCount <= 0) {
    window.alert('Ogiltigt antal.');
    return;
  }

  const newDateStr = window.prompt('Datum (YYYY-MM-DD):', entry.date ?? '');
  if (newDateStr === null) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) {
    window.alert('Ogiltigt datumformat. Använd YYYY-MM-DD.');
    return;
  }

  try {
    await addDoc(collection(firestore, 'pushups'), {
      user: userName,
      count: newCount,
      date: newDateStr
    });
    await loadData();
  } catch (error) {
    console.error(error);
    window.alert('Kunde inte lägga till passet.');
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
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '0';
  }
  return swedishNumberFormatter.format(numericValue);
}

function sanitizeNumericInput(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\D+/g, '');
}

function formatGoalInputDisplay(value) {
  const digits = sanitizeNumericInput(value);
  if (!digits) {
    return '';
  }
  const numericValue = Number(digits);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '';
  }
  return formatNumber(numericValue);
}

function parseGoalInputValue(value) {
  const digits = sanitizeNumericInput(value);
  if (!digits) {
    return NaN;
  }
  return Number(digits);
}
