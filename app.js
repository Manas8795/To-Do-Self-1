const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const timeInput = document.getElementById("todo-time");
const priorityInput = document.getElementById("todo-priority");
const list = document.getElementById("todo-list");
const tasksLeft = document.getElementById("tasks-left");
const clearCompletedBtn = document.getElementById("clear-completed");
const filterButtons = [...document.querySelectorAll(".filter-btn")];
const itemTemplate = document.getElementById("todo-item-template");
const themeSelect = document.getElementById("theme-select");
const installAppBtn = document.getElementById("install-app");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");
const performanceDate = document.getElementById("performance-date");
const performanceDonut = document.getElementById("performance-donut");
const performanceRate = document.getElementById("performance-rate");
const efficiencyDonut = document.getElementById("efficiency-donut");
const efficiencyRate = document.getElementById("efficiency-rate");
const overallEfficiencyDonut = document.getElementById("overall-efficiency-donut");
const overallEfficiencyRate = document.getElementById("overall-efficiency-rate");
const countCompleted = document.getElementById("count-completed");
const countPending = document.getElementById("count-pending");
const countShifted = document.getElementById("count-shifted");
const overdueCount = document.getElementById("overdue-count");
const overdueList = document.getElementById("overdue-list");
const notesDate = document.getElementById("notes-date");
const notesInput = document.getElementById("notes-input");
const notesSaveBtn = document.getElementById("notes-save");
const taskEditor = document.getElementById("task-editor");
const taskEditorForm = document.getElementById("task-editor-form");
const editorText = document.getElementById("editor-text");
const editorTime = document.getElementById("editor-time");
const editorPriority = document.getElementById("editor-priority");
const repeatWeekdays = document.getElementById("repeat-weekdays");
const repeatDayInputs = [...document.querySelectorAll(".repeat-day")];
const editorCancelBtn = document.getElementById("editor-cancel");
const syncState = document.getElementById("sync-state");
const authShell = document.getElementById("auth-shell");
const appShell = document.getElementById("app-shell");
const appLayout = document.getElementById("app-layout");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authCopy = document.getElementById("auth-copy");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authSubmit = document.getElementById("auth-submit");
const authMessage = document.getElementById("auth-message");
const authToggle = document.getElementById("auth-toggle");
const authState = document.getElementById("auth-state");
const userPanel = document.getElementById("user-panel");
const signOutBtn = document.getElementById("sign-out");

const THEME_KEY = "todo-app-theme-v1";
const todayKey = toYyyyMmDd(new Date());
const WEEKDAY_REPEAT_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const SUPABASE_URL = "https://hxgakjlurfydttwqdeke.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-rJ_1mH7oPlOWw_30156wg_3xUW91uV";

let todos = [];
let currentFilter = "pending";
let calendarViewDate = new Date();
let selectedDate = todayKey;
let supabaseClient = null;
let pullTimer = null;
let notesPullTimer = null;
let syncInFlight = false;
let syncQueued = false;
let editingTaskId = null;
let deferredInstallPrompt = null;
let dayNotes = {};
let currentUser = null;
let authMode = "signin";
let authReady = false;
let localChangesTimestamp = 0;

initTheme();
bindUiEvents();
renderAuthMode();
renderShell();
render();
initPwaInstall();
void initSupabase();

function bindUiEvents() {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const text = input.value.trim();
    if (!text) return;

    todos.unshift({
      id: crypto.randomUUID(),
      userId: currentUser.id,
      text,
      completed: false,
      taskDate: selectedDate,
      originalDate: selectedDate,
      shifted: false,
      shiftedFrom: null,
      priority: normalizePriority(priorityInput.value),
      repeatDays: [],
      seriesId: null,
      deadlineTime: timeInput.value || null,
      createdAt: Date.now(),
    });

    input.value = "";
    timeInput.value = "";
    priorityInput.value = "moderate";
    saveTodos();
    render();
  });

  clearCompletedBtn.addEventListener("click", () => {
    if (!currentUser) return;
    const hasCompleted = todos.some(
      (todo) => todo.taskDate === selectedDate && todo.completed
    );
    if (!hasCompleted) return;

    todos = todos.filter(
      (todo) => !(todo.taskDate === selectedDate && todo.completed)
    );
    saveTodos();
    render();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      filterButtons.forEach((btn) =>
        btn.classList.toggle("active", btn === button)
      );
      render();
    });
  });

  themeSelect.addEventListener("change", () => {
    setTheme(themeSelect.value);
  });

  editorCancelBtn.addEventListener("click", () => {
    closeTaskEditor();
  });

  taskEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveTaskEditor();
  });

  repeatWeekdays.addEventListener("change", () => {
    WEEKDAY_REPEAT_DAYS.forEach((day) => {
      const checkbox = repeatDayInputs.find((inputEl) => inputEl.value === day);
      if (checkbox) {
        checkbox.checked = repeatWeekdays.checked;
      }
    });
  });

  repeatDayInputs.forEach((inputEl) => {
    inputEl.addEventListener("change", syncWeekdaysRepeatCheckbox);
  });

  notesSaveBtn.addEventListener("click", () => {
    saveCurrentNote();
  });

  installAppBtn.addEventListener("click", () => {
    void handleInstallClick();
  });

  prevMonthBtn.addEventListener("click", () => {
    calendarViewDate = new Date(
      calendarViewDate.getFullYear(),
      calendarViewDate.getMonth() - 1,
      1
    );
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", () => {
    calendarViewDate = new Date(
      calendarViewDate.getFullYear(),
      calendarViewDate.getMonth() + 1,
      1
    );
    renderCalendar();
  });

  authToggle.addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    renderAuthMode();
  });

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAuthForm();
  });

  signOutBtn.addEventListener("click", () => {
    void signOut();
  });
}

async function initSupabase() {
  if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setSyncState("Sync: Supabase not configured");
    setAuthMessage("Supabase is not configured.", true);
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    setAuthMessage(error.message, true);
    setSyncState(`Sync error: ${error.message}`);
  }

  supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
    void applySession(nextSession);
  });

  authReady = true;
  await applySession(session);
}

async function submitAuthForm() {
  if (!supabaseClient) {
    setAuthMessage("Supabase not ready. Please wait and try again.", true);
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) {
    setAuthMessage("Please enter both email and password.", true);
    return;
  }

  authSubmit.disabled = true;
  setAuthMessage(authMode === "signin" ? "Signing in..." : "Creating account...");

  try {
    const action = authMode === "signin"
      ? supabaseClient.auth.signInWithPassword({ email, password })
      : supabaseClient.auth.signUp({ email, password });

    const { error, data } = await action;

    if (error) {
      authSubmit.disabled = false;
      setAuthMessage(error.message || "Authentication failed", true);
      return;
    }

    if (authMode === "signup" && !data.session) {
      authSubmit.disabled = false;
      setAuthMessage("Account created. Check your email if confirmation is enabled.");
      authMode = "signin";
      renderAuthMode();
      return;
    }

    authPassword.value = "";
    setAuthMessage("Authenticated. Loading your data...");
    if (data.session) {
      await applySession(data.session);
    }
  } catch (err) {
    authSubmit.disabled = false;
    setAuthMessage(`Error: ${err.message || "Authentication failed"}`, true);
  }
}

async function signOut() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    setSyncState(`Sign out error: ${error.message}`);
    return;
  }
  setAuthMessage("Signed out.");
}

async function applySession(session) {
  stopPullTimers();
  closeTaskEditorIfOpen();

  currentUser = session?.user ?? null;
  if (!currentUser) {
    todos = [];
    dayNotes = {};
    renderShell();
    render();
    if (authReady) {
      setSyncState("Sync: waiting for sign in");
    }
    return;
  }

  // Initialize UI immediately with empty state
  selectedDate = todayKey;
  calendarViewDate = new Date();
  currentFilter = "pending";
  filterButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });

  renderShell();
  setSyncState("Sync: loading...");

  // Load from cloud first, then local as fallback
  try {
    await loadTodosFromSupabase(true, false);
    await loadNotesFromSupabase(true, false);
  } catch (err) {
    console.error("Cloud load failed, falling back to local:", err);
    todos = loadTodosLocal();
    dayNotes = loadNotesLocal();
    render();
  }

  render();

  // Subscribe to real-time changes AFTER initial load
  subscribeToTodosChanges();
  subscribeToNotesChanges();

  // Keep polling as fallback (every 30 seconds)
  pullTimer = setInterval(() => {
    void loadTodosFromSupabase(false, true);
  }, 30000);
  notesPullTimer = setInterval(() => {
    void loadNotesFromSupabase(false, true);
  }, 30000);
}

function stopPullTimers() {
  if (pullTimer) {
    clearInterval(pullTimer);
    pullTimer = null;
  }
  if (notesPullTimer) {
    clearInterval(notesPullTimer);
    notesPullTimer = null;
  }
}

let lastSyncTime = 0;

function subscribeToTodosChanges() {
  if (!supabaseClient || !currentUser) return;
  
  supabaseClient
    .channel(`todos-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "todos",
        filter: `user_id=eq.${currentUser.id}`,
      },
      (payload) => {
        // Debounce real-time updates to prevent thrashing
        const now = Date.now();
        if (now - lastSyncTime > 1000) {
          lastSyncTime = now;
          void loadTodosFromSupabase(true, true, true);
        }
      }
    )
    .subscribe();
}

function subscribeToNotesChanges() {
  if (!supabaseClient || !currentUser) return;
  
  supabaseClient
    .channel(`notes-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "day_notes",
        filter: `user_id=eq.${currentUser.id}`,
      },
      (payload) => {
        void loadNotesFromSupabase(true, true);
      }
    )
    .subscribe();
}

function renderShell() {
  const signedIn = Boolean(currentUser);
  authShell.hidden = signedIn;
  appShell.hidden = !signedIn;
  userPanel.hidden = !signedIn;
  authState.textContent = signedIn
    ? `Signed in: ${currentUser.email ?? currentUser.id}`
    : "Signed out";
}

function renderAuthMode() {
  const signingIn = authMode === "signin";
  authTitle.textContent = signingIn ? "Sign in" : "Create account";
  authCopy.textContent = signingIn
    ? "Use your account to load your tasks and notes."
    : "Create an account. Your tasks and notes will sync to your user only.";
  authSubmit.textContent = signingIn ? "Sign in" : "Create account";
  authToggle.textContent = signingIn
    ? "Need an account? Create one"
    : "Already have an account? Sign in";
  authPassword.autocomplete = signingIn ? "current-password" : "new-password";
}

let lastRenderTime = 0;
let pendingRender = false;

function render() {
  // Debounce renders to prevent excessive DOM updates
  const now = Date.now();
  if (pendingRender || (now - lastRenderTime < 100)) {
    pendingRender = true;
    setTimeout(() => {
      pendingRender = false;
      doRender();
    }, 100);
    return;
  }
  
  lastRenderTime = now;
  doRender();
}

function doRender() {
  if (!currentUser) {
    list.innerHTML = "";
    renderOverdueSection();
    renderPerformance([]);
    renderShortNotes();
    renderCalendarLite();
    tasksLeft.textContent = "Sign in to load your tasks";
    return;
  }

  generateRecurringTasksUpTo(maxDateKey(todayKey, selectedDate));
  autoShiftOverdueTasks();
  
  // Only update list if it exists
  if (list.parentElement) {
    list.innerHTML = "";
    const dayTodos = getDayTodos();
    const dayScopeTodos = getDayScopeTodos();
    const filtered = getFilteredTodos(dayTodos);
    const fragment = document.createDocumentFragment();

    filtered.forEach((todo) => {
      const node = itemTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = todo.id;
      node.classList.toggle("completed", todo.completed);

      const checkbox = node.querySelector(".todo-check");
      const text = node.querySelector(".todo-text");
      const level = node.querySelector(".todo-priority");
      const time = node.querySelector(".todo-time");
      const editBtn = node.querySelector(".edit-btn");
      const deleteBtn = node.querySelector(".delete-btn");

      checkbox.checked = todo.completed;
      text.textContent = todo.text;
      node.classList.toggle("shifted", Boolean(todo.shifted));
      level.textContent = capitalize(todo.priority);
      level.className = `todo-priority priority-${todo.priority}`;

      const meta = [];
      if (todo.shifted && todo.taskDate !== selectedDate) {
        meta.push(`Shifted to ${formatDateLabel(todo.taskDate)}`);
      } else if (todo.shifted && todo.shiftedFrom) {
        meta.push(`Shifted from ${formatDateLabel(todo.shiftedFrom)}`);
      }
      if (todo.deadlineTime) {
        meta.push(`Deadline: ${formatTime(todo.deadlineTime)}`);
      }
      time.textContent = meta.join(" | ");

      checkbox.addEventListener("change", () => {
        todo.completed = checkbox.checked;
        saveTodos();
        render();
      });

      editBtn.addEventListener("click", () => {
        openTaskEditor(todo.id);
      });

      deleteBtn.addEventListener("click", () => {
        todos = todos.filter((item) => item.id !== todo.id);
        saveTodos();
        render();
      });

      fragment.appendChild(node);
    });

    if (filtered.length === 0) {
      const emptyState = document.createElement("li");
      emptyState.className = "todo-item";
      emptyState.textContent = `No ${currentFilter} tasks for ${formatDateLabel(selectedDate)}.`;
      list.appendChild(emptyState);
    } else {
      list.appendChild(fragment);
    }

    const activeCount = todos.filter(
      (todo) =>
        !todo.completed &&
        (todo.taskDate === selectedDate || todo.originalDate === selectedDate)
    ).length;
    tasksLeft.textContent = `${activeCount} task${activeCount === 1 ? "" : "s"} left for ${formatDateLabel(selectedDate)}`;
    renderPerformance(dayScopeTodos);
  }
  
  renderOverdueSection();
  renderShortNotes();
  renderCalendarLite();
}

function getFilteredTodos(dayTodos) {
  if (currentFilter === "pending") return getPendingTodosForSelectedDate();
  if (currentFilter === "completed") return dayTodos.filter((todo) => todo.completed);
  if (currentFilter === "shifted") return getShiftedTodosForSelectedDate();
  return getPendingTodosForSelectedDate();
}

function getDayTodos() {
  return todos.filter((todo) => todo.taskDate === selectedDate);
}

function getDayScopeTodos() {
  return todos.filter(
    (todo) => todo.taskDate === selectedDate || todo.originalDate === selectedDate
  );
}

function openTaskEditor(taskId) {
  const todo = todos.find((item) => item.id === taskId);
  if (!todo) return;

  editingTaskId = taskId;
  editorText.value = todo.text;
  editorTime.value = todo.deadlineTime ?? "";
  editorPriority.value = todo.priority;

  const selectedRepeatDays = new Set(todo.repeatDays ?? []);
  repeatDayInputs.forEach((inputEl) => {
    inputEl.checked = selectedRepeatDays.has(inputEl.value);
  });
  syncWeekdaysRepeatCheckbox();

  taskEditor.showModal();
}

function closeTaskEditor() {
  editingTaskId = null;
  taskEditor.close();
}

function closeTaskEditorIfOpen() {
  if (taskEditor.open) {
    closeTaskEditor();
  }
}

function saveTaskEditor() {
  const todo = todos.find((item) => item.id === editingTaskId);
  if (!todo) {
    closeTaskEditor();
    return;
  }

  const nextText = editorText.value.trim();
  if (!nextText) return;

  const repeatDays = repeatDayInputs
    .filter((inputEl) => inputEl.checked)
    .map((inputEl) => inputEl.value);

  const nextSeriesId =
    repeatDays.length > 0 ? todo.seriesId ?? crypto.randomUUID() : null;
  const seriesTasks = todo.seriesId
    ? todos.filter((item) => item.seriesId === todo.seriesId)
    : [todo];

  seriesTasks.forEach((item) => {
    item.text = nextText;
    item.deadlineTime = editorTime.value || null;
    item.priority = normalizePriority(editorPriority.value);
    item.repeatDays = [...repeatDays];
    item.seriesId = nextSeriesId;
  });

  saveTodos();
  closeTaskEditor();
  render();
}

function syncWeekdaysRepeatCheckbox() {
  repeatWeekdays.checked = WEEKDAY_REPEAT_DAYS.every((day) =>
    repeatDayInputs.some((inputEl) => inputEl.value === day && inputEl.checked)
  );
}

function getShiftedTodosForSelectedDate() {
  return todos.filter(
    (todo) => todo.shifted && todo.originalDate === selectedDate
  );
}

function saveTodos() {
  localChangesTimestamp = Date.now();
  saveTodosLocal();
  if (currentUser) {
    void syncTodosToSupabase();
  }
}

function saveTodosLocal() {
  const storageKey = getTodosStorageKey();
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(todos));
}

function saveNotesLocal() {
  const storageKey = getNotesStorageKey();
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(dayNotes));
}

function loadNotesLocal() {
  const storageKey = getNotesStorageKey();
  if (!storageKey) return {};

  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = JSON.parse(raw ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}
let syncTodoTimeout = null;
let syncRetryCount = 0;
const MAX_SYNC_RETRIES = 3;

async function syncTodosToSupabase() {
  if (!supabaseClient || !currentUser) return;
  
  // Clear any pending sync timer
  if (syncTodoTimeout) {
    clearTimeout(syncTodoTimeout);
  }
  
  // Debounce sync requests
  syncTodoTimeout = setTimeout(async () => {
    if (syncInFlight) {
      syncQueued = true;
      return;
    }

    syncInFlight = true;
    setSyncState("Sync: writing...");
    let hadError = false;

    try {
      const rows = todos.map((todo) => ({
        id: todo.id,
        user_id: currentUser.id,
        text: todo.text,
        completed: todo.completed,
        task_date: todo.taskDate,
        original_date: todo.originalDate,
        shifted: todo.shifted,
        shifted_from: todo.shiftedFrom,
        priority: todo.priority,
        repeat_days: todo.repeatDays,
        series_id: todo.seriesId,
        deadline_time: todo.deadlineTime,
        created_at: new Date(todo.createdAt).toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabaseClient
          .from("todos")
          .upsert(rows, { onConflict: "id" });
        if (error) {
          hadError = true;
          syncRetryCount++;
          if (syncRetryCount < MAX_SYNC_RETRIES) {
            setSyncState(`Sync: retrying (${syncRetryCount}/${MAX_SYNC_RETRIES})...`);
            syncInFlight = false;
            await new Promise(resolve => setTimeout(resolve, 1000 * syncRetryCount));
            void syncTodosToSupabase();
            return;
          }
          setSyncState(`Sync error: ${error.message}`);
          console.error("Supabase sync upsert failed:", error.message);
          syncRetryCount = 0;
          return;
        }
      }

      let cleanupQuery = supabaseClient.from("todos").delete().eq("user_id", currentUser.id);
      if (rows.length > 0) {
        cleanupQuery = cleanupQuery.not(
          "id",
          "in",
          `(${rows.map((row) => `"${row.id}"`).join(",")})`
        );
      }
      const { error: cleanupError } = await cleanupQuery;
      if (cleanupError) {
        console.warn("Supabase cleanup failed:", cleanupError.message);
      }
      
      syncRetryCount = 0;
    } finally {
      syncInFlight = false;
      if (!hadError) {
        setSyncState("Sync: up to date");
      }
      if (syncQueued) {
        syncQueued = false;
        void syncTodosToSupabase();
      }
    }
  }, 500);
}

async function loadTodosFromSupabase(overwriteLocal = true, quiet = false, forceRender = false) {
  if (!supabaseClient || !currentUser) return;
  if (syncInFlight) return;
  if (!quiet) {
    setSyncState("Sync: loading...");
  }

  const { data, error } = await supabaseClient
    .from("todos")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    setSyncState(`Sync error: ${error.message}`);
    console.error("Supabase load failed:", error.message);
    return;
  }

  const cloudTodos = (data ?? []).map((row) => normalizeTodo(row));
  
  // Don't overwrite if local changes are very recent (within 2 seconds)
  const hasRecentLocalChanges = localChangesTimestamp && (Date.now() - localChangesTimestamp < 2000);
  
  if (!forceRender && !overwriteLocal && isSameTodoSet(todos, cloudTodos)) {
    setSyncState("Sync: up to date");
    return;
  }
  
  if (hasRecentLocalChanges && !forceRender) {
    setSyncState("Sync: local changes pending...");
    return;
  }

  todos = cloudTodos;
  saveTodosLocal();
  autoShiftOverdueTasks();
  render();
  setSyncState("Sync: up to date");
}

async function syncNotesToSupabase() {
  if (!supabaseClient || !currentUser) return;
  setSyncState("Sync: saving note...");

  const rows = Object.entries(dayNotes)
    .filter(([dateKey, noteText]) => isDateKey(dateKey) && typeof noteText === "string")
    .map(([dateKey, noteText]) => ({
      user_id: currentUser.id,
      note_date: dateKey,
      note_text: noteText,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabaseClient
      .from("day_notes")
      .upsert(rows, { onConflict: "user_id,note_date" });
    if (error) {
      setSyncState(`Note sync error: ${error.message}`);
      console.error("Supabase notes sync failed:", error.message);
      return;
    }
  }

  let cleanupQuery = supabaseClient.from("day_notes").delete().eq("user_id", currentUser.id);
  if (rows.length > 0) {
    cleanupQuery = cleanupQuery.not(
      "note_date",
      "in",
      `(${rows.map((row) => `"${row.note_date}"`).join(",")})`
    );
  }
  const { error: cleanupError } = await cleanupQuery;
  if (cleanupError) {
    console.warn("Supabase note cleanup failed:", cleanupError.message);
  }

  setSyncState("Sync: note saved");
}

async function loadNotesFromSupabase(overwriteLocal = true, quiet = false) {
  if (!supabaseClient || !currentUser) return;
  if (!quiet) {
    setSyncState("Sync: loading...");
  }

  const { data, error } = await supabaseClient
    .from("day_notes")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("note_date", { ascending: true });

  if (error) {
    setSyncState(`Note load error: ${error.message}`);
    console.error("Supabase notes load failed:", error.message);
    return;
  }

  const cloudNotes = Object.fromEntries(
    (data ?? [])
      .filter((row) => isDateKey(row.note_date))
      .map((row) => [row.note_date, typeof row.note_text === "string" ? row.note_text : ""])
  );

  if (!overwriteLocal && isSameNotesMap(dayNotes, cloudNotes)) {
    return;
  }

  dayNotes = cloudNotes;
  saveNotesLocal();
  renderShortNotes();
}

function loadTodosLocal() {
  const storageKey = getTodosStorageKey();
  if (!storageKey) return [];

  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeTodo(item));
  } catch {
    return [];
  }
}

function normalizeTodo(item) {
  const createdAtRaw = item.createdAt ?? item.created_at;
  const createdAt =
    typeof createdAtRaw === "number"
      ? createdAtRaw
      : Date.parse(createdAtRaw ?? "") || Date.now();
  const userId = item.userId ?? item.user_id;

  return {
    id: String(item.id ?? crypto.randomUUID()),
    userId: typeof userId === "string" ? userId : currentUser?.id ?? null,
    text: typeof item.text === "string" ? item.text : "",
    completed: Boolean(item.completed),
    taskDate: normalizeTaskDate(item),
    originalDate: normalizeOriginalDate(item),
    shifted: Boolean(item.shifted),
    shiftedFrom: normalizeShiftedFrom(item),
    priority: normalizePriority(item.priority),
    repeatDays: normalizeRepeatDays(item),
    seriesId: normalizeSeriesId(item),
    deadlineTime: normalizeDeadline(item),
    createdAt,
  };
}

let cachedTaskDates = null;
let lastTaskDatesCacheTime = 0;

function renderCalendarLite() {
  // Only recalculate if enough time passed or task dates changed
  const now = Date.now();
  if (!cachedTaskDates || (now - lastTaskDatesCacheTime > 5000)) {
    cachedTaskDates = new Set(todos.map((todo) => todo.taskDate));
    lastTaskDatesCacheTime = now;
  }
  
  const taskDates = cachedTaskDates;
  
  // Update only the calendar title and days that changed
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date();
  
  calendarTitle.textContent = `${firstDay.toLocaleString(undefined, { month: "long" })} ${year}`;
  
  // Only rebuild if month changed
  if (calendarGrid.children.length === 0 || calendarGrid.dataset.month !== `${year}-${month}`) {
    calendarGrid.innerHTML = "";
    calendarGrid.dataset.month = `${year}-${month}`;
    
    weekdays.forEach((dayName) => {
      const label = document.createElement("div");
      label.className = "weekday";
      label.textContent = dayName;
      calendarGrid.appendChild(label);
    });

    for (let i = 0; i < offset; i += 1) {
      const spacer = document.createElement("div");
      spacer.className = "day empty";
      calendarGrid.appendChild(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const yyyyMmDd = toYyyyMmDd(date);
      const cell = document.createElement("div");
      cell.className = "day";
      cell.textContent = String(day);
      cell.dataset.date = yyyyMmDd;
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");

      cell.addEventListener("click", () => {
        selectedDate = yyyyMmDd;
        render();
      });

      cell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectedDate = yyyyMmDd;
        render();
      });

      calendarGrid.appendChild(cell);
    }
  }
  
  // Update styles for existing cells
  const todayKeyLocal = toYyyyMmDd(today);
  const dayCells = calendarGrid.querySelectorAll(".day[data-date]");
  dayCells.forEach((cell) => {
    const yyyyMmDd = cell.dataset.date;
    cell.classList.toggle("has-task", taskDates.has(yyyyMmDd));
    cell.classList.toggle("selected", yyyyMmDd === selectedDate);
    cell.classList.toggle("past", yyyyMmDd < todayKeyLocal);
    cell.classList.toggle("today", yyyyMmDd === todayKeyLocal);
    cell.classList.toggle("future", yyyyMmDd > todayKeyLocal);
  });
}

function renderCalendar() {
  // Alias for backward compatibility
  renderCalendarLite();
}

function getPendingTodosForSelectedDate() {
  return todos.filter((todo) => {
    if (todo.completed) return false;
    if (todo.taskDate !== selectedDate) return false;
    return !todo.shifted || todo.originalDate !== selectedDate;
  });
}

function renderOverdueSection() {
  overdueList.innerHTML = "";
  const overdueTodos = currentUser
    ? getPendingTodosForSelectedDate().filter((todo) =>
        isDeadlineCrossed(selectedDate, todo.deadlineTime)
      )
    : [];
  overdueCount.textContent = String(overdueTodos.length);

  if (overdueTodos.length === 0) {
    const empty = document.createElement("li");
    empty.className = "overdue-item";
    empty.textContent = currentUser ? "No overdue tasks for this day." : "Sign in to load overdue tasks.";
    overdueList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  overdueTodos.forEach((todo) => {
    const item = document.createElement("li");
    item.className = "overdue-item";
    const shiftedTo =
      todo.taskDate !== selectedDate
        ? ` (shifted to ${formatDateLabel(todo.taskDate)})`
        : "";
    item.textContent = `${todo.text} - ${formatTime(todo.deadlineTime)}${shiftedTo}`;
    fragment.appendChild(item);
  });
  overdueList.appendChild(fragment);
}

function renderShortNotes() {
  notesDate.textContent = formatDateLabel(selectedDate);
  notesInput.value = dayNotes[selectedDate] ?? "";
  notesInput.disabled = !currentUser;
  notesSaveBtn.disabled = !currentUser;
}

function saveCurrentNote() {
  if (!currentUser) return;
  dayNotes[selectedDate] = notesInput.value;
  saveNotesLocal();
  if (supabaseClient) {
    void syncNotesToSupabase();
  } else {
    setSyncState("Sync: note saved locally");
  }
}

function renderPerformance(dayTodos) {
  const completed = dayTodos.filter((todo) => todo.completed).length;
  const pending = dayTodos.filter((todo) => !todo.completed && !todo.shifted).length;
  const shifted = dayTodos.filter(
    (todo) => todo.shifted && todo.originalDate === selectedDate
  ).length;
  const totalPriority = dayTodos.reduce(
    (sum, todo) => sum + getPriorityWeight(todo.priority),
    0
  );
  const completedPriority = dayTodos
    .filter((todo) => todo.completed)
    .reduce((sum, todo) => sum + getPriorityWeight(todo.priority), 0);
  const total = completed + pending + shifted;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;
  const efficiencyPct = totalPriority
    ? Math.round((completedPriority / totalPriority) * 100)
    : 0;
  const overallTotalPriority = todos.reduce(
    (sum, todo) => sum + getPriorityWeight(todo.priority),
    0
  );
  const overallCompletedPriority = todos
    .filter((todo) => todo.completed)
    .reduce((sum, todo) => sum + getPriorityWeight(todo.priority), 0);
  const overallEfficiencyPct = overallTotalPriority
    ? Math.round((overallCompletedPriority / overallTotalPriority) * 100)
    : 0;
  const completedPct = total ? (completed / total) * 100 : 0;
  const pendingPct = total ? (pending / total) * 100 : 0;
  const shiftedPct = total ? (shifted / total) * 100 : 0;
  const stop1 = completedPct;
  const stop2 = completedPct + pendingPct;
  const stop3 = stop2 + shiftedPct;

  performanceDate.textContent = formatDateLabel(selectedDate);
  performanceRate.textContent = `${completionPct}%`;
  performanceDonut.style.background =
    `conic-gradient(` +
    `#14b8a6 0% ${stop1}%, ` +
    `#f59e0b ${stop1}% ${stop2}%, ` +
    `#ef4444 ${stop2}% ${stop3}%, ` +
    `var(--surface) ${stop3}% 100%)`;
  efficiencyRate.textContent = `${efficiencyPct}%`;
  efficiencyDonut.style.background =
    `conic-gradient(` +
    `#22c55e 0% ${efficiencyPct}%, ` +
    `rgba(148, 163, 184, 0.28) ${efficiencyPct}% 100%)`;
  overallEfficiencyRate.textContent = `${overallEfficiencyPct}%`;
  overallEfficiencyDonut.style.background =
    `conic-gradient(` +
    `#38bdf8 0% ${overallEfficiencyPct}%, ` +
    `rgba(148, 163, 184, 0.28) ${overallEfficiencyPct}% 100%)`;

  countCompleted.textContent = String(completed);
  countPending.textContent = String(pending);
  countShifted.textContent = String(shifted);
}

function autoShiftOverdueTasks() {
  if (!currentUser) return;
  let changed = false;
  const currentDayKey = toYyyyMmDd(new Date());
  todos.forEach((todo) => {
    if (todo.completed) return;
    while (todo.taskDate < currentDayKey) {
      const nextDate = toYyyyMmDd(addDays(todo.taskDate, 1));
      if (!todo.shiftedFrom) {
        todo.shiftedFrom = todo.taskDate;
      }
      todo.taskDate = nextDate;
      todo.shifted = true;
      changed = true;
    }
  });

  if (changed) saveTodos();
}

function generateRecurringTasksUpTo(targetDateKey) {
  if (!currentUser) return;
  let changed = false;
  const seriesMap = new Map();

  todos.forEach((todo) => {
    if (!todo.seriesId || !Array.isArray(todo.repeatDays) || todo.repeatDays.length === 0) {
      return;
    }
    if (!seriesMap.has(todo.seriesId)) {
      seriesMap.set(todo.seriesId, []);
    }
    seriesMap.get(todo.seriesId).push(todo);
  });

  seriesMap.forEach((seriesTodos) => {
    const existingDates = new Set(seriesTodos.map((todo) => todo.originalDate));
    const latestTodo = [...seriesTodos].sort((a, b) =>
      a.originalDate.localeCompare(b.originalDate)
    )[seriesTodos.length - 1];

    let cursorDate = latestTodo.originalDate;
    while (cursorDate < targetDateKey) {
      cursorDate = toYyyyMmDd(addDays(cursorDate, 1));
      if (existingDates.has(cursorDate)) continue;
      if (!shouldRepeatOnDate(latestTodo.repeatDays, cursorDate)) continue;

      todos.push({
        id: crypto.randomUUID(),
        userId: currentUser.id,
        text: latestTodo.text,
        completed: false,
        taskDate: cursorDate,
        originalDate: cursorDate,
        shifted: false,
        shiftedFrom: null,
        priority: latestTodo.priority,
        repeatDays: [...latestTodo.repeatDays],
        seriesId: latestTodo.seriesId,
        deadlineTime: latestTodo.deadlineTime,
        createdAt: Date.now(),
      });
      existingDates.add(cursorDate);
      changed = true;
    }
  });

  if (changed) {
    saveTodos();
  }
}

function normalizeTaskDate(item) {
  const raw = item.taskDate ?? item.task_date ?? item.dueDate;
  if (isDateKey(raw)) return raw;
  if (typeof item.createdAt === "number") return toYyyyMmDd(new Date(item.createdAt));
  if (typeof item.created_at === "string") return toYyyyMmDd(new Date(item.created_at));
  return todayKey;
}

function normalizeOriginalDate(item) {
  const raw = item.originalDate ?? item.original_date ?? item.shiftedFrom ?? item.shifted_from;
  if (isDateKey(raw)) return raw;
  return normalizeTaskDate(item);
}

function normalizeShiftedFrom(item) {
  const raw = item.shiftedFrom ?? item.shifted_from;
  return isDateKey(raw) ? raw : null;
}

function normalizeRepeatDays(item) {
  const raw = item.repeatDays ?? item.repeat_days;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value) => typeof value === "string");
}

function normalizeSeriesId(item) {
  const raw = item.seriesId ?? item.series_id;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function normalizeDeadline(item) {
  const raw = item.deadlineTime ?? item.deadline_time;
  return typeof raw === "string" && raw.length >= 4 ? raw : null;
}

function isDeadlineCrossed(dayKey, deadlineTime) {
  if (!deadlineTime) return false;
  const [hourRaw, minuteRaw] = deadlineTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const deadline = new Date(`${dayKey}T00:00:00`);
  deadline.setHours(hour, minute, 0, 0);
  return Date.now() > deadline.getTime();
}

function normalizePriority(value) {
  if (value === "low" || value === "moderate" || value === "high") return value;
  return "moderate";
}

function setTheme(theme, shouldPersist = true) {
  document.body.dataset.theme = theme;
  if (themeSelect) {
    themeSelect.value = theme;
  }
  if (shouldPersist) localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const fallback = preferredDark ? "dark" : "light";
  const allowed = new Set(["light", "dark", "sork", "grind", "soft", "rest"]);
  const nextTheme = allowed.has(saved) ? saved : fallback;
  setTheme(nextTheme, false);
}

function toYyyyMmDd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(yyyyMmDd) {
  const date = new Date(`${yyyyMmDd}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime(hhMm) {
  const [hoursRaw, minutesRaw] = hhMm.split(":");
  const hoursNum = Number(hoursRaw);
  const minutes = String(minutesRaw ?? "00");
  if (!Number.isFinite(hoursNum)) return hhMm;
  const suffix = hoursNum >= 12 ? "PM" : "AM";
  const displayHour = ((hoursNum + 11) % 12) + 1;
  return `${displayHour}:${minutes} ${suffix}`;
}

function addDays(yyyyMmDd, daysToAdd) {
  const date = new Date(`${yyyyMmDd}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return date;
}

function shouldRepeatOnDate(repeatDays, dateKey) {
  const dayName = getDayName(dateKey);
  return repeatDays.includes(dayName);
}

function getDayName(dateKey) {
  const weekdayIndex = new Date(`${dateKey}T00:00:00`).getDay();
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ][weekdayIndex];
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function maxDateKey(a, b) {
  return a > b ? a : b;
}

function getPriorityWeight(priority) {
  if (priority === "high") return 3;
  if (priority === "moderate") return 2;
  return 1;
}

function getTodosStorageKey() {
  return currentUser ? `todo-app-items-${currentUser.id}` : null;
}

function getNotesStorageKey() {
  return currentUser ? `todo-app-notes-${currentUser.id}` : null;
}

function setSyncState(text) {
  if (syncState) {
    syncState.textContent = text;
  }
}

function setAuthMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function isSameTodoSet(localTodos, cloudTodos) {
  if (localTodos.length !== cloudTodos.length) return false;
  const localJson = JSON.stringify(
    [...localTodos].sort((a, b) => a.id.localeCompare(b.id))
  );
  const cloudJson = JSON.stringify(
    [...cloudTodos].sort((a, b) => a.id.localeCompare(b.id))
  );
  return localJson === cloudJson;
}

function isSameNotesMap(localNotes, cloudNotes) {
  const localKeys = Object.keys(localNotes).sort();
  const cloudKeys = Object.keys(cloudNotes).sort();
  if (localKeys.length !== cloudKeys.length) return false;
  for (let index = 0; index < localKeys.length; index += 1) {
    const key = localKeys[index];
    if (key !== cloudKeys[index] || localNotes[key] !== cloudNotes[key]) {
      return false;
    }
  }
  return true;
}

function initPwaInstall() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppBtn.hidden = true;
  });
}

async function handleInstallClick() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installAppBtn.hidden = true;
}
