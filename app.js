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
const countCompleted = document.getElementById("count-completed");
const countPending = document.getElementById("count-pending");
const countShifted = document.getElementById("count-shifted");
const overdueCount = document.getElementById("overdue-count");
const overdueList = document.getElementById("overdue-list");

const STORAGE_KEY = "todo-app-items-v1";
const THEME_KEY = "todo-app-theme-v1";
const todayKey = toYyyyMmDd(new Date());

// You said keys are already added; these can be replaced with your own.
const SUPABASE_URL = "https://hxgakjlurfydttwqdeke.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-rJ_1mH7oPlOWw_30156wg_3xUW91uV";

let todos = loadTodosLocal();
let currentFilter = "pending";
let calendarViewDate = new Date();
let selectedDate = todayKey;
let supabaseClient = null;
let pullTimer = null;
let syncInFlight = false;
let syncQueued = false;
let deferredInstallPrompt = null;

initTheme();
bindUiEvents();
autoShiftOverdueTasks();
render();
initPwaInstall();
void initSupabase();

function bindUiEvents() {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    todos.unshift({
      id: crypto.randomUUID(),
      text,
      completed: false,
      taskDate: selectedDate,
      originalDate: selectedDate,
      shifted: false,
      shiftedFrom: null,
      priority: normalizePriority(priorityInput.value),
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
}

async function initSupabase() {
  if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await loadTodosFromSupabase();

  // Lightweight pull for cross-device updates.
  pullTimer = setInterval(() => {
    void loadTodosFromSupabase(false);
  }, 15000);
}

function render() {
  autoShiftOverdueTasks();
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
      const updatedText = window.prompt("Edit task:", todo.text);
      if (updatedText === null) return;
      const nextText = updatedText.trim();
      if (!nextText) return;
      todo.text = nextText;
      saveTodos();
      render();
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
  renderOverdueSection();
  renderCalendar();
}

function getFilteredTodos(dayTodos) {
  if (currentFilter === "pending") return getPendingTodosForSelectedDate();
  if (currentFilter === "completed") return dayTodos.filter((todo) => todo.completed);
  if (currentFilter === "shifted") {
    return dayTodos.filter((todo) => !todo.completed && todo.shifted);
  }
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

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  void syncTodosToSupabase();
}

async function syncTodosToSupabase() {
  if (!supabaseClient) return;
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  syncInFlight = true;

  try {
    const rows = todos.map((todo) => ({
      id: todo.id,
      text: todo.text,
      completed: todo.completed,
      task_date: todo.taskDate,
      original_date: todo.originalDate,
      shifted: todo.shifted,
      shifted_from: todo.shiftedFrom,
      priority: todo.priority,
      deadline_time: todo.deadlineTime,
      created_at: new Date(todo.createdAt).toISOString(),
    }));

    if (rows.length > 0) {
      const { error } = await supabaseClient
        .from("todos")
        .upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("Supabase sync upsert failed:", error.message);
        return;
      }
    }

    // Best-effort cleanup for deleted local tasks.
    try {
      if (rows.length === 0) {
        await supabaseClient.from("todos").delete().neq("id", "");
      } else {
        const ids = rows.map((row) => row.id);
        await supabaseClient
          .from("todos")
          .delete()
          .not("id", "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
      }
    } catch {
      // ignore cleanup errors
    }
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      void syncTodosToSupabase();
    }
  }
}

async function loadTodosFromSupabase(overwriteLocal = true) {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("todos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase load failed:", error.message);
    return;
  }

  const cloudTodos = (data ?? []).map((row) => normalizeTodo(row));
  if (!overwriteLocal) {
    // Pull mode: update only if changed count/ids.
    const localIds = new Set(todos.map((t) => t.id));
    const cloudIds = new Set(cloudTodos.map((t) => t.id));
    if (localIds.size === cloudIds.size) {
      let same = true;
      for (const id of localIds) {
        if (!cloudIds.has(id)) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
  }

  if (cloudTodos.length === 0 && todos.length > 0) {
    await syncTodosToSupabase();
    return;
  }

  todos = cloudTodos;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  autoShiftOverdueTasks();
  render();
}

function loadTodosLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

  return {
    id: String(item.id ?? crypto.randomUUID()),
    text: typeof item.text === "string" ? item.text : "",
    completed: Boolean(item.completed),
    taskDate: normalizeTaskDate(item),
    originalDate: normalizeOriginalDate(item),
    shifted: Boolean(item.shifted),
    shiftedFrom: normalizeShiftedFrom(item),
    priority: normalizePriority(item.priority),
    deadlineTime: normalizeDeadline(item),
    createdAt,
  };
}

function renderCalendar() {
  calendarGrid.innerHTML = "";

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay.getDay() + 6) % 7;
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date();
  const taskDates = new Set(todos.map((todo) => todo.taskDate));

  calendarTitle.textContent = `${firstDay.toLocaleString(undefined, { month: "long" })} ${year}`;

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
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");

    if (taskDates.has(yyyyMmDd)) cell.classList.add("has-task");
    if (yyyyMmDd === selectedDate) cell.classList.add("selected");
    const todayKeyLocal = toYyyyMmDd(today);
    if (yyyyMmDd < todayKeyLocal) {
      cell.classList.add("past");
    } else if (yyyyMmDd === todayKeyLocal) {
      cell.classList.add("today");
    } else {
      cell.classList.add("future");
    }

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

function getPendingTodosForSelectedDate() {
  return todos.filter((todo) => {
    if (todo.completed) return false;
    if (todo.taskDate === selectedDate) return true;
    return todo.shifted && todo.originalDate === selectedDate;
  });
}

function renderOverdueSection() {
  overdueList.innerHTML = "";
  const overdueTodos = getPendingTodosForSelectedDate().filter((todo) =>
    isDeadlineCrossed(selectedDate, todo.deadlineTime)
  );
  overdueCount.textContent = String(overdueTodos.length);

  if (overdueTodos.length === 0) {
    const empty = document.createElement("li");
    empty.className = "overdue-item";
    empty.textContent = "No overdue tasks for this day.";
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

function renderPerformance(dayTodos) {
  const completed = dayTodos.filter((todo) => todo.completed).length;
  const pending = dayTodos.filter((todo) => !todo.completed && !todo.shifted).length;
  const shifted = dayTodos.filter((todo) => !todo.completed && todo.shifted).length;
  const total = completed + pending + shifted;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;
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

  countCompleted.textContent = String(completed);
  countPending.textContent = String(pending);
  countShifted.textContent = String(shifted);
}

function autoShiftOverdueTasks() {
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

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
