const AUTH_TOKEN_KEY = "legalhub-auth-token-v1";
const MASTER_BRAND_NAME = "legalhub";
const ASSISTANT_PERSONA_NAME = "legalhub";
const STATUS_ORDER = ["NEW", "IN_REVIEW", "BLOCKED", "READY", "CLOSED"];
const STATUS_LABELS = {
  NEW: "Новый",
  IN_REVIEW: "В работе",
  BLOCKED: "Стоп-фактор",
  READY: "Готов к запуску",
  CLOSED: "Закрыт",
};
const URGENCY_LABELS = {
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};
const TEXT_FILE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);
const TRANSCRIBE_FILE_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "mp4", "mov", "webm"]);
const TRANSCRIBE_MAX_BYTES = 512 * 1024 * 1024;

const state = {
  matters: [],
  selectedMatterId: null,
  searchQuery: "",
  statusFilter: "ALL",
  reportText: "",
  authToken: "",
  user: null,
  assistantMessages: [],
  assistantMemoryByMatter: {},
  assistantContextMatterId: null,
  authMode: "login",
  passwordResetEmail: "",
  passwordResetToken: "",
};

const els = {
  menuItems: document.querySelectorAll(".menu-item"),
  sections: document.querySelectorAll(".tab-section"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  forgotForm: document.getElementById("forgot-form"),
  forgotEmail: document.getElementById("forgot-email"),
  resetForm: document.getElementById("reset-form"),
  resetEmail: document.getElementById("reset-email"),
  resetCode: document.getElementById("reset-code"),
  resetNewPassword: document.getElementById("reset-new-password"),
  registerName: document.getElementById("register-name"),
  registerEmail: document.getElementById("register-email"),
  registerPassword: document.getElementById("register-password"),
  showLoginBtn: document.getElementById("show-login"),
  showRegisterBtn: document.getElementById("show-register"),
  forgotPasswordBtn: document.getElementById("forgot-password-btn"),
  backToLoginBtn: document.getElementById("back-to-login-btn"),
  resendCodeBtn: document.getElementById("resend-code-btn"),
  authSession: document.getElementById("auth-session"),
  authUser: document.getElementById("auth-user"),
  authStatus: document.getElementById("auth-status"),
  logoutBtn: document.getElementById("logout-btn"),
  searchInput: document.getElementById("search-input"),
  statusFilter: document.getElementById("status-filter"),
  seedButton: document.getElementById("seed-demo"),
  clearButton: document.getElementById("clear-data"),
  intakeForm: document.getElementById("intake-form"),
  fileInput: document.getElementById("file-input"),
  rawTextInput: document.getElementById("raw-text-input"),
  meetingNotesInput: document.getElementById("meeting-notes-input"),
  transcribeButton: document.getElementById("transcribe-audio"),
  transcribeStatus: document.getElementById("transcribe-status"),
  transcribeProgressFill: document.getElementById("transcribe-progress-fill"),
  transcribeProgressText: document.getElementById("transcribe-progress-text"),
  kpiGrid: document.getElementById("kpi-grid"),
  matterCount: document.getElementById("matter-count"),
  tableBody: document.getElementById("matter-table-body"),
  caseDetails: document.getElementById("case-details"),
  selectedStatus: document.getElementById("selected-status"),
  kanbanBoard: document.getElementById("kanban-board"),
  reportScope: document.getElementById("report-scope"),
  reportPreview: document.getElementById("report-preview"),
  generateReport: document.getElementById("generate-report"),
  downloadReport: document.getElementById("download-report"),
  assistantDock: document.getElementById("assistant-dock"),
  assistantPresence: document.getElementById("assistant-presence"),
  assistantContext: document.getElementById("assistant-context"),
  assistantChat: document.getElementById("assistant-chat"),
  assistantQuick: document.getElementById("assistant-quick"),
  assistantForm: document.getElementById("assistant-form"),
  assistantInput: document.getElementById("assistant-input"),
};

boot();

async function boot() {
  bindEvents();
  ensureAssistantInitialized();
  restoreAuthFromStorage();
  setTranscribeProgress(0);
  applyAuthUiState();
  if (state.authToken) {
    await fetchCurrentUser();
  }

  if (state.user) {
    await refreshMatters();
  }

  render();
}

function bindEvents() {
  els.menuItems.forEach((item) => {
    item.addEventListener("click", () => switchTab(item.dataset.target));
  });

  els.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value.trim().toLowerCase();
    refreshMatters()
      .then(() => render())
      .catch((error) => setAuthStatus(`Ошибка загрузки кейсов: ${error.message}`, "error"));
  });

  els.statusFilter.addEventListener("change", (event) => {
    state.statusFilter = event.target.value;
    refreshMatters()
      .then(() => render())
      .catch((error) => setAuthStatus(`Ошибка загрузки кейсов: ${error.message}`, "error"));
  });

  els.seedButton.addEventListener("click", seedDemoData);

  els.loginForm.addEventListener("submit", handleLoginSubmit);
  els.forgotForm.addEventListener("submit", handleForgotPasswordSubmit);
  els.resetForm.addEventListener("submit", handleResetPasswordSubmit);
  els.registerForm.addEventListener("submit", handleRegisterSubmit);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.showLoginBtn.addEventListener("click", () => setAuthMode("login"));
  els.showRegisterBtn.addEventListener("click", () => setAuthMode("register"));
  els.forgotPasswordBtn.addEventListener("click", () => {
    state.passwordResetEmail = `${els.loginEmail.value || ""}`.trim().toLowerCase();
    state.passwordResetToken = "";
    els.forgotEmail.value = state.passwordResetEmail;
    setAuthMode("forgot");
  });
  els.backToLoginBtn.addEventListener("click", () => setAuthMode("login"));
  els.resendCodeBtn.addEventListener("click", () => {
    void requestPasswordResetCode(els.resetEmail.value.trim().toLowerCase(), { moveToResetForm: false });
  });

  els.clearButton.addEventListener("click", () => {
    if (!state.user) {
      state.matters = [];
      state.selectedMatterId = null;
      state.reportText = "";
      render();
      return;
    }

    if (state.user.role !== "OWNER") {
      window.alert("Полная очистка доступна только роли OWNER.");
      return;
    }

    const isConfirmed = window.confirm("Очистить все кейсы и отчеты? Это действие нельзя отменить.");
    if (!isConfirmed) {
      return;
    }

    resetAllMatters().catch((error) => {
      window.alert(`Не удалось очистить данные: ${error.message}`);
    });
  });

  els.intakeForm.addEventListener("submit", handleIntakeSubmit);
  els.transcribeButton.addEventListener("click", handleTranscriptionRequest);

  els.tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) {
      return;
    }

    state.selectedMatterId = row.dataset.id;
    render();
  });

  els.caseDetails.addEventListener("click", (event) => {
    const button = event.target.closest("button.download-attachment");
    if (!button) {
      return;
    }

    void downloadMatterAttachment(button);
  });

  els.kanbanBoard.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-id]");
    if (!select) {
      return;
    }

    updateStatus(select.dataset.id, select.value);
  });

  els.reportScope.addEventListener("change", () => {
    state.reportText = "";
    els.reportPreview.textContent = "Нажми «Сгенерировать», чтобы получить отчет.";
  });

  els.generateReport.addEventListener("click", async () => {
    try {
      await generateReportFromApi(els.reportScope.value);
    } catch (error) {
      window.alert(`Не удалось сформировать отчет: ${error.message}`);
    }
  });

  els.downloadReport.addEventListener("click", () => {
    if (!state.reportText) {
      window.alert("Сначала сгенерируй отчет.");
      return;
    }

    const blob = new Blob([state.reportText], { type: "text/markdown;charset=utf-8" });
    const fileDate = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `legalhub-report-${fileDate}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  els.assistantForm.addEventListener("submit", handleAssistantSubmit);
  els.assistantQuick.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-prompt]");
    if (!button) {
      return;
    }

    const prompt = `${button.dataset.prompt || ""}`.trim();
    if (!prompt) {
      return;
    }

    submitAssistantPrompt(prompt);
  });
}

function switchTab(tabId) {
  els.menuItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.target === tabId);
  });

  els.sections.forEach((section) => {
    section.classList.toggle("is-active", section.id === tabId);
  });
}

function ensureAssistantInitialized() {
  if (state.assistantMessages.length) {
    return;
  }

  addAssistantMessage({
    role: "assistant",
    text:
      `Я на связи как ${ASSISTANT_PERSONA_NAME}. Помогу собрать факты, сроки, риски и план действий. Чтобы работать по материалам дела, выполни вход и выбери кейс в ${MASTER_BRAND_NAME}.`,
  });
}

function handleAssistantSubmit(event) {
  event.preventDefault();
  const prompt = `${els.assistantInput.value || ""}`.trim();
  if (!prompt) {
    return;
  }

  void submitAssistantPrompt(prompt);
  els.assistantInput.value = "";
}

function setAuthMode(mode) {
  const allowedModes = new Set(["login", "register", "forgot", "reset"]);
  state.authMode = allowedModes.has(mode) ? mode : "login";
  if (state.authMode === "forgot" && state.passwordResetEmail) {
    els.forgotEmail.value = state.passwordResetEmail;
  }
  if (state.authMode === "reset" && state.passwordResetEmail) {
    els.resetEmail.value = state.passwordResetEmail;
  }
  applyAuthUiState();
}

function submitAssistantPrompt(prompt) {
  addAssistantMessage({ role: "user", text: prompt });
  const placeholderId = addAssistantMessage({
    role: "assistant",
    text: "Принял запрос. Готовлю правовую выжимку...",
    mode: "pending",
    pending: true,
  });
  renderAssistantDock();

  void (async () => {
    const matter = getSelectedMatter();
    try {
      const response = await requestAssistantReply(prompt, matter);
      replaceAssistantMessage(placeholderId, response);
    } catch {
      const fallback = generateAssistantReply(prompt, matter);
      replaceAssistantMessage(placeholderId, {
        text: fallback,
        mode: "local",
        sources: [],
      });
    }
    renderAssistantDock();
  })();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = els.loginEmail.value.trim().toLowerCase();
  const password = els.loginPassword.value;
  if (!email || !password) {
    setAuthStatus("Укажи e-mail и пароль.", "error");
    return;
  }

  try {
    const payload = await rawApiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email,
        password,
      },
    });

    state.authToken = payload.token || "";
    state.user = payload.user || null;
    persistAuthToken();
    applyAuthUiState();
    await refreshMatters();
    render();
    els.loginForm.reset();
    setAuthStatus(`Вход выполнен: ${state.user?.name || state.user?.email}`, "success");
    addAssistantMessage({
      role: "assistant",
      text: `Сессия подтверждена. Работаю в контуре ${state.user?.role || "USER"}. Готов принять поручение по кейсу.`,
    });
    renderAssistantDock();
  } catch (error) {
    state.authToken = "";
    state.user = null;
    persistAuthToken();
    applyAuthUiState();
    setAuthStatus(`Ошибка входа: ${error.message}`, "error");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const name = els.registerName.value.trim();
  const email = els.registerEmail.value.trim().toLowerCase();
  const password = els.registerPassword.value;
  if (!name || !email || !password) {
    setAuthStatus("Заполни имя, e-mail и пароль.", "error");
    return;
  }

  try {
    const payload = await rawApiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name,
        email,
        password,
      },
    });

    state.authToken = payload.token || "";
    state.user = payload.user || null;
    persistAuthToken();
    setAuthMode("login");
    applyAuthUiState();
    await refreshMatters();
    render();
    els.registerForm.reset();
    setAuthStatus(`Регистрация успешна: ${state.user?.name || state.user?.email}`, "success");
    addAssistantMessage({
      role: "assistant",
      text: `Профиль создан. Добро пожаловать в ${MASTER_BRAND_NAME}.`,
    });
    renderAssistantDock();
  } catch (error) {
    setAuthStatus(`Ошибка регистрации: ${error.message}`, "error");
  }
}

async function handleForgotPasswordSubmit(event) {
  event.preventDefault();
  const email = els.forgotEmail.value.trim().toLowerCase();
  if (!email) {
    setAuthStatus("Укажи e-mail для восстановления.", "error");
    return;
  }

  await requestPasswordResetCode(email, { moveToResetForm: true });
}

async function requestPasswordResetCode(email, options = {}) {
  const normalizedEmail = `${email || ""}`.trim().toLowerCase();
  if (!normalizedEmail) {
    setAuthStatus("Укажи e-mail для восстановления.", "error");
    return;
  }

  const { moveToResetForm = false } = options;
  try {
    const payload = await rawApiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: { email: normalizedEmail },
    });

    state.passwordResetEmail = normalizedEmail;
    state.passwordResetToken = payload.resetToken || "";
    els.resetEmail.value = normalizedEmail;
    els.loginEmail.value = normalizedEmail;
    if (moveToResetForm) {
      setAuthMode("reset");
    }

    const demoHint = payload.demoCode ? ` Demo-код: ${payload.demoCode}` : "";
    setAuthStatus(`${payload.message || "Код восстановления отправлен."}${demoHint}`, "success");
  } catch (error) {
    setAuthStatus(`Не удалось отправить код: ${error.message}`, "error");
  }
}

async function handleResetPasswordSubmit(event) {
  event.preventDefault();
  const email = els.resetEmail.value.trim().toLowerCase();
  const code = els.resetCode.value.trim();
  const newPassword = els.resetNewPassword.value;
  const resetToken = `${state.passwordResetToken || ""}`.trim();

  if (!email || !code || !newPassword) {
    setAuthStatus("Заполни e-mail, код и новый пароль.", "error");
    return;
  }
  if (!resetToken) {
    setAuthStatus("Сначала запроси код восстановления заново.", "error");
    setAuthMode("forgot");
    return;
  }

  try {
    await rawApiRequest("/api/auth/reset-password", {
      method: "POST",
      body: {
        email,
        code,
        newPassword,
        resetToken,
      },
    });

    els.resetForm.reset();
    state.passwordResetToken = "";
    els.loginEmail.value = email;
    els.loginPassword.value = "";
    setAuthMode("login");
    setAuthStatus("Пароль обновлен. Выполни вход с новым паролем.", "success");
  } catch (error) {
    setAuthStatus(`Восстановление не выполнено: ${error.message}`, "error");
  }
}

function handleLogout() {
  state.authToken = "";
  state.user = null;
  state.matters = [];
  state.selectedMatterId = null;
  state.reportText = "";
  state.assistantContextMatterId = null;
  state.passwordResetToken = "";
  persistAuthToken();
  applyAuthUiState();
  addAssistantMessage({
    role: "assistant",
    text: "Сессия завершена. Продолжу в гостевом режиме. Для работы с материалами снова выполните вход.",
  });
  render();
}

function restoreAuthFromStorage() {
  state.authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function persistAuthToken() {
  if (state.authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, state.authToken);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function applyAuthUiState() {
  const isAuthed = Boolean(state.user && state.authToken);
  els.registerForm.classList.toggle("hidden", isAuthed || state.authMode !== "register");
  els.loginForm.classList.toggle("hidden", isAuthed || state.authMode !== "login");
  els.forgotForm.classList.toggle("hidden", isAuthed || state.authMode !== "forgot");
  els.resetForm.classList.toggle("hidden", isAuthed || state.authMode !== "reset");
  els.authSession.classList.toggle("hidden", !isAuthed);
  els.showLoginBtn.classList.toggle("hidden", isAuthed);
  els.showRegisterBtn.classList.toggle("hidden", isAuthed);
  els.forgotPasswordBtn.classList.toggle("hidden", isAuthed || state.authMode !== "login");
  if (isAuthed) {
    els.authUser.textContent = `${state.user.name} (${state.user.role})`;
  } else {
    els.authUser.textContent = "";
  }
}

function setAuthStatus(message, kind = "info") {
  els.authStatus.textContent = message;
  if (kind === "error") {
    els.authStatus.style.color = "#b42318";
  } else if (kind === "success") {
    els.authStatus.style.color = "#0f766e";
  } else {
    els.authStatus.style.color = "";
  }
}

async function fetchCurrentUser() {
  try {
    const response = await apiRequest("/api/me");
    state.user = response;
    applyAuthUiState();
    setAuthStatus(`Сессия: ${state.user.name} (${state.user.role})`, "info");
  } catch (error) {
    state.authToken = "";
    state.user = null;
    persistAuthToken();
    applyAuthUiState();
    setAuthStatus("Сессия истекла. Выполни вход снова.", "error");
  }
}

async function refreshMatters() {
  if (!state.user) {
    state.matters = [];
    state.selectedMatterId = null;
    return;
  }

  const query = new URLSearchParams();
  if (state.searchQuery) {
    query.set("q", state.searchQuery);
  }
  if (state.statusFilter && state.statusFilter !== "ALL") {
    query.set("status", state.statusFilter);
  }

  const url = query.toString() ? `/api/matters?${query.toString()}` : "/api/matters";
  const payload = await apiRequest(url);
  state.matters = Array.isArray(payload.matters) ? payload.matters : [];
  if (!state.selectedMatterId || !state.matters.some((item) => item.id === state.selectedMatterId)) {
    state.selectedMatterId = state.matters[0]?.id ?? null;
  }
}

async function handleIntakeSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    window.alert("Сначала выполни вход.");
    return;
  }

  const formData = new FormData(els.intakeForm);

  const textChunks = [];
  const attachments = [];
  const pastedText = (formData.get("rawText") || "").trim();
  const meetingNotes = String(formData.get("meetingNotes") || "").trim();
  const routineContext = String(formData.get("routineContext") || "").trim();
  const disclaimerAccepted = Boolean(formData.get("disclaimerAccepted"));

  if (pastedText) {
    textChunks.push(pastedText);
  }

  if (meetingNotes) {
    textChunks.push(`Конспект по аудио/видео:\n${meetingNotes}`);
  }

  if (routineContext) {
    textChunks.push(`Рутинные источники:\n${routineContext}`);
  }

  for (const file of Array.from(els.fileInput.files || [])) {
    const extension = getFileExtension(file.name);
    const dataBase64 = await fileToDataUrl(file);
    attachments.push({
      name: file.name,
      type: file.type || "application/octet-stream",
      extension,
      dataBase64,
      sizeBytes: file.size,
    });

    if (TEXT_FILE_EXTENSIONS.has(extension)) {
      const text = await file.text();
      if (text.trim()) {
        textChunks.push(`Файл: ${file.name}\n${text}`);
      }
    }
  }

  const rawText = textChunks.join("\n\n").trim();
  if (!rawText) {
    if (attachments.length) {
      window.alert("Файлы загружены, но для анализа нужен текст. Добавь конспект/транскрипт записи в соответствующее поле.");
      return;
    }

    window.alert("Нужен текст для анализа: вставь стенограмму, конспект или добавь текстовый файл.");
    return;
  }

  if (!disclaimerAccepted) {
    window.alert("Нужно подтвердить юридический дисклеймер.");
    return;
  }

  const payload = await apiRequest("/api/matters", {
    method: "POST",
    body: {
      company: String(formData.get("company") || "").trim(),
      contact: String(formData.get("contact") || "").trim(),
      industry: String(formData.get("industry") || "").trim() || "Не указано",
      sourceType: String(formData.get("sourceType") || "").trim(),
      summary: String(formData.get("summary") || "").trim() || "Не указано",
      rawText,
      meetingNotes,
      routineContext,
      disclaimerAccepted,
      attachments,
    },
  });

  if (payload?.matter?.id) {
    state.selectedMatterId = payload.matter.id;
  }
  await refreshMatters();

  els.intakeForm.reset();
  els.fileInput.value = "";
  setTranscribeStatus("Выбери аудио/видео файл и нажми кнопку.", "info");
  setTranscribeProgress(0);

  switchTab("overview");
  render();
}

async function handleTranscriptionRequest() {
  if (!state.user) {
    setTranscribeStatus("Сначала выполни вход.", "error");
    return;
  }

  const file = findTranscribableFile(Array.from(els.fileInput.files || []));
  if (!file) {
    setTranscribeStatus("Не найден аудио/видео файл. Загрузи mp3/wav/m4a/ogg/mp4/mov/webm.", "error");
    setTranscribeProgress(0);
    return;
  }

  if (file.size > TRANSCRIBE_MAX_BYTES) {
    setTranscribeStatus(`Файл ${file.name} слишком большой. Лимит ${Math.round(TRANSCRIBE_MAX_BYTES / (1024 * 1024))} МБ.`, "error");
    setTranscribeProgress(0);
    return;
  }

  els.transcribeButton.disabled = true;
  const fileSizeMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
  setTranscribeStatus(`Расшифровываю ${file.name} (${fileSizeMb} МБ)...`, "info");
  setTranscribeProgress(2);

  try {
    const dataBase64 = await fileToDataUrl(file);
    const startPayload = await apiRequest("/api/transcribe/start", {
      method: "POST",
      body: {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
        prompt: "Юридическое заседание/переговоры. Важно точно распознать сроки, суммы, требования и упоминания норм права.",
      },
    });

    const jobId = `${startPayload.jobId || ""}`.trim();
    if (!jobId) {
      throw new Error("Не получен идентификатор задачи расшифровки");
    }

    const payload = await pollTranscriptionJob(jobId);
    const transcript = `${payload.text || ""}`.trim();
    if (!transcript) {
      throw new Error("Пустая расшифровка");
    }

    const block = `Авторасшифровка файла ${file.name}:\n${transcript}`;
    els.rawTextInput.value = els.rawTextInput.value.trim()
      ? `${els.rawTextInput.value.trim()}\n\n${block}`
      : block;

    if (!els.meetingNotesInput.value.trim()) {
      els.meetingNotesInput.value = transcript.slice(0, 1400);
    }

    setTranscribeProgress(100);
    const parts = Number(payload.partsTotal || payload.parts || 1);
    const modeLabel = payload.mode === "segmented" ? `по частям (${parts})` : "целиком";
    setTranscribeStatus(`Готово: ${file.name} расшифрован ${modeLabel} и добавлен в кейс.`, "success");
  } catch (error) {
    setTranscribeStatus(`Ошибка расшифровки: ${error.message}`, "error");
    setTranscribeProgress(0);
  } finally {
    els.transcribeButton.disabled = false;
  }
}

async function pollTranscriptionJob(jobId) {
  const maxPolls = 1200;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const payload = await apiRequest(`/api/transcribe/status/${encodeURIComponent(jobId)}`);
    const job = payload.job || {};
    const percent = Number(job.percent || 0);
    const message = `${job.message || "Идет расшифровка"}`.trim();
    const partInfo =
      job.mode === "segmented" && Number(job.partsTotal || 0) > 0
        ? ` (${Math.max(0, Number(job.partIndex || 0))}/${Number(job.partsTotal)})`
        : "";

    setTranscribeProgress(percent);
    setTranscribeStatus(`${message}${partInfo}`, job.status === "failed" ? "error" : "info");

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Не удалось расшифровать запись");
    }

    await sleep(1200);
  }

  throw new Error("Таймаут ожидания расшифровки");
}

function analyzeMatter(rawText) {
  const slices = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 450);

  const markers = [
    { term: "неустойк", category: "Договор", weight: 14, severity: "HIGH" },
    { term: "штраф", category: "Договор", weight: 12, severity: "HIGH" },
    { term: "гк рф", category: "Норма права", weight: 8, severity: "MEDIUM" },
    { term: "апк рф", category: "Суд и процесс", weight: 10, severity: "MEDIUM" },
    { term: "суд", category: "Суд и процесс", weight: 14, severity: "HIGH" },
    { term: "арбитраж", category: "Суд и процесс", weight: 13, severity: "HIGH" },
    { term: "иск", category: "Суд и процесс", weight: 10, severity: "HIGH" },
    { term: "претенз", category: "Досудебка", weight: 10, severity: "MEDIUM" },
    { term: "досудеб", category: "Досудебка", weight: 9, severity: "MEDIUM" },
    { term: "расторжен", category: "Договор", weight: 9, severity: "MEDIUM" },
    { term: "просроч", category: "Сроки", weight: 12, severity: "HIGH" },
    { term: "срок", category: "Сроки", weight: 7, severity: "MEDIUM" },
    { term: "задолж", category: "Задолженность", weight: 12, severity: "HIGH" },
    { term: "акт сверки", category: "Доказательства", weight: 9, severity: "MEDIUM" },
    { term: "упд", category: "Доказательства", weight: 8, severity: "MEDIUM" },
    { term: "фссп", category: "Исполнение", weight: 10, severity: "MEDIUM" },
    { term: "исполнительн", category: "Исполнение", weight: 10, severity: "MEDIUM" },
    { term: "конфиденц", category: "Комплаенс", weight: 9, severity: "MEDIUM" },
    { term: "персональ", category: "Комплаенс", weight: 11, severity: "HIGH" },
    { term: "152-фз", category: "Комплаенс", weight: 11, severity: "HIGH" },
    { term: "роскомнадзор", category: "Госорганы", weight: 11, severity: "HIGH" },
    { term: "фнс", category: "Госорганы", weight: 10, severity: "MEDIUM" },
    { term: "проверк", category: "Госорганы", weight: 8, severity: "MEDIUM" },
    { term: "должен", category: "Обязательства", weight: 6, severity: "MEDIUM" },
    { term: "обязан", category: "Обязательства", weight: 6, severity: "MEDIUM" },
  ];

  const riskHits = [];
  const categoryWeights = new Map();
  let score = 0;

  for (const line of slices) {
    const lowered = line.toLowerCase();

    markers.forEach((marker) => {
      if (!lowered.includes(marker.term)) {
        return;
      }

      riskHits.push({
        severity: marker.severity,
        category: marker.category,
        marker: marker.term,
        excerpt: line,
      });

      score += marker.weight;
      categoryWeights.set(marker.category, (categoryWeights.get(marker.category) || 0) + marker.weight);
    });
  }

  const timeline = extractTimeline(slices);
  const obligations = extractObligations(slices);

  const uniqueRisks = dedupeRisks(riskHits).slice(0, 10);
  const culturalLoad = measureCulturalLoad(rawText);
  const normalizedScore = Math.min(
    98,
    Math.max(5, Math.round((score / (slices.length + 10)) * 16 + uniqueRisks.length * 2.4 + culturalLoad)),
  );

  let urgency = "LOW";
  if (normalizedScore >= 60 || hasHighSeverity(uniqueRisks)) {
    urgency = "HIGH";
  } else if (normalizedScore >= 32) {
    urgency = "MEDIUM";
  }

  const topCategories = [...categoryWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0])
    .slice(0, 3);

  const actions = buildActions(topCategories, urgency);
  const confidence = Math.min(0.95, 0.48 + uniqueRisks.length * 0.035 + timeline.length * 0.01);

  return {
    riskScore: normalizedScore,
    urgency,
    tags: topCategories,
    risks: uniqueRisks,
    timeline,
    obligations,
    actions,
    confidence,
  };
}

function extractTimeline(lines) {
  const timelineRegex =
    /(\b\d{1,2}:\d{2}\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\bдо\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\bв течение\s+\d+\s+(?:рабочих|календарных)\s+дн)/i;
  const timeline = [];

  lines.forEach((line, index) => {
    if (!timelineRegex.test(line)) {
      return;
    }

    timeline.push({
      order: index + 1,
      event: line,
    });
  });

  return timeline.slice(0, 10);
}

function extractObligations(lines) {
  const obligationHints = [
    "обязан",
    "должен",
    "срок",
    "оплат",
    "передать",
    "подписать",
    "предоставить",
    "акт сверки",
    "упд",
    "претензи",
    "ответ в течение",
    "оригинал",
  ];

  const obligations = lines
    .filter((line) => obligationHints.some((hint) => line.toLowerCase().includes(hint)))
    .slice(0, 8)
    .map((line) => line.trim());

  return obligations;
}

function hasHighSeverity(risks) {
  return risks.some((risk) => risk.severity === "HIGH");
}

function dedupeRisks(risks) {
  const deduped = [];
  const seen = new Set();

  risks.forEach((risk) => {
    const key = `${risk.category}|${risk.excerpt}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(risk);
  });

  return deduped;
}

function buildActions(categories, urgency) {
  const actionMap = {
    Договор: "Сверить предмет, сроки, ответственность и порядок расторжения по договору и допсоглашениям.",
    "Суд и процесс": "Проверить подсудность, процессуальные сроки и собрать комплект доказательств под АПК РФ.",
    Досудебка: "Подготовить и направить претензию с расчетом требований и подтверждением вручения (ЭДО/почта).",
    Сроки: "Зафиксировать критические даты и назначить владельца каждого дедлайна с ежедневным контролем.",
    Задолженность: "Собрать акт сверки, первичку и платежный график; предложить сценарий досудебного погашения.",
    "Обязательства": "Проверить исполнение обязательств по этапам и закрепить это письменно в переписке.",
    "Комплаенс": "Провести экспресс-аудит по ПДн/конфиденциальности и подготовить пакет для возможной проверки.",
    "Госорганы": "Подготовить ответ в госорган с ответственным, сроком и пакетом подтверждающих документов.",
    "Доказательства": "Собрать доказательственную папку: договор, УПД, акты, переписка, счета и реестр приложений.",
    "Исполнение": "Проверить стадию исполнительного производства и план взыскания через ФССП.",
    "Норма права": "Подобрать релевантные нормы ГК РФ/АПК РФ и привязать их к фактам кейса.",
  };

  const actions = categories
    .map((category) => actionMap[category])
    .filter(Boolean)
    .slice(0, 4);

  if (urgency === "HIGH") {
    actions.unshift(
      "В течение 24 часов: провести с собственником короткую риск-сессию, согласовать позицию и запретить противоречивые комментарии.",
    );
  }

  if (!actions.length) {
    actions.push("Сформировать краткий юрбриф: факты, спорные точки, ближайшие сроки, ответственные и канал коммуникации.");
  }

  return actions.slice(0, 5);
}

function measureCulturalLoad(text) {
  const lowered = text.toLowerCase();
  const highPressureSignals = ["срочно", "сегодня", "до конца дня", "блокир", "штраф", "претензия"];
  const relationSignals = ["договорились", "устно", "по звонку", "телеграм", "whatsapp"];
  let score = 0;

  highPressureSignals.forEach((signal) => {
    if (lowered.includes(signal)) {
      score += 2;
    }
  });

  relationSignals.forEach((signal) => {
    if (lowered.includes(signal)) {
      score += 1;
    }
  });

  return Math.min(10, score);
}

async function updateStatus(matterId, nextStatus) {
  if (!state.user) {
    return;
  }

  try {
    await apiRequest(`/api/matters/${encodeURIComponent(matterId)}/status`, {
      method: "PATCH",
      body: { status: nextStatus },
    });
    await refreshMatters();
    render();
  } catch (error) {
    window.alert(`Не удалось изменить статус: ${error.message}`);
  }
}

function render() {
  if (!state.user) {
    state.matters = [];
    state.selectedMatterId = null;
  }

  const filteredMatters = filterMatters();

  renderKpis();
  renderMatterTable(filteredMatters);
  renderCaseDetails();
  renderKanban();
  renderReportScope();
  renderAssistantDock();
}

function filterMatters() {
  return state.matters.filter((matter) => {
    const searchHaystack = [
      matter.company,
      matter.contact,
      matter.industry,
      matter.summary,
      matter.meetingNotes || "",
      matter.routineContext || "",
      (matter.attachments || []).map((item) => item.name).join(" "),
      matter.analysis.tags.join(" "),
      matter.analysis.risks.map((risk) => risk.excerpt).join(" "),
    ]
      .join(" ")
      .toLowerCase();

    const passSearch = !state.searchQuery || searchHaystack.includes(state.searchQuery);
    const passStatus = state.statusFilter === "ALL" || matter.status === state.statusFilter;

    return passSearch && passStatus;
  });
}

function renderKpis() {
  const total = state.matters.length;
  const urgent = state.matters.filter((matter) => matter.analysis.urgency === "HIGH" && matter.status !== "CLOSED").length;
  const active = state.matters.filter((matter) => matter.status !== "CLOSED").length;
  const riskAverage = total
    ? Math.round(state.matters.reduce((acc, matter) => acc + matter.analysis.riskScore, 0) / total)
    : 0;

  const obligations = state.matters.reduce((acc, matter) => acc + matter.analysis.obligations.length, 0);

  const cards = [
    { title: "Всего кейсов", value: total },
    { title: "Активные", value: active },
    { title: "Критичные кейсы", value: urgent },
    { title: "Средний индекс риска", value: `${riskAverage}/100` },
    { title: "Обязательства в трекинге", value: obligations },
  ];

  els.kpiGrid.innerHTML = cards
    .map(
      (card) => `
      <article class="kpi">
        <h4>${escapeHtml(card.title)}</h4>
        <strong>${escapeHtml(String(card.value))}</strong>
      </article>
    `,
    )
    .join("");
}

function renderMatterTable(matters) {
  if (!state.user) {
    els.matterCount.textContent = "0 шт";
    els.tableBody.innerHTML = `
      <tr>
        <td colspan="4">Выполни вход, чтобы видеть кейсы команды.</td>
      </tr>
    `;
    return;
  }

  els.matterCount.textContent = `${matters.length} шт`;

  if (!matters.length) {
    els.tableBody.innerHTML = `
      <tr>
        <td colspan="4">Кейсы не найдены. Добавь новый кейс в разделе «Новый кейс».</td>
      </tr>
    `;

    if (!state.matters.length) {
      state.selectedMatterId = null;
    }

    return;
  }

  if (!state.selectedMatterId || !matters.some((item) => item.id === state.selectedMatterId)) {
    state.selectedMatterId = matters[0].id;
  }

  els.tableBody.innerHTML = matters
    .map((matter) => {
      const rowClass = matter.id === state.selectedMatterId ? "is-selected" : "";
      const riskClass = riskClassName(matter.analysis.urgency);

      return `
        <tr data-id="${escapeHtml(matter.id)}" class="${rowClass}">
          <td>
            <strong>${escapeHtml(matter.company)}</strong>
            <div>${escapeHtml(matter.summary)}</div>
          </td>
          <td class="${riskClass}">${escapeHtml(urgencyLabel(matter.analysis.urgency))} · ${matter.analysis.riskScore}</td>
          <td>${escapeHtml(statusLabel(matter.status))}</td>
          <td>${escapeHtml(formatDate(matter.createdAt))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCaseDetails() {
  if (!state.user) {
    els.selectedStatus.textContent = "Нет";
    els.caseDetails.className = "case-details empty";
    els.caseDetails.textContent = "Выполни вход, чтобы работать с кейсами.";
    return;
  }

  const matter = state.matters.find((item) => item.id === state.selectedMatterId);

  if (!matter) {
    els.selectedStatus.textContent = "Нет";
    els.caseDetails.className = "case-details empty";
    els.caseDetails.textContent = "Выбери кейс, чтобы увидеть извлеченные риски, таймлайн и действия.";
    return;
  }

  els.selectedStatus.textContent = `${urgencyLabel(matter.analysis.urgency)} · ${matter.analysis.riskScore}/100`;
  els.selectedStatus.className = `risk-chip ${riskClassName(matter.analysis.urgency)}`;
  els.caseDetails.className = "case-details";

  els.caseDetails.innerHTML = `
    <div class="meta-grid">
      <article class="meta-card"><span>Компания</span><strong>${escapeHtml(matter.company)}</strong></article>
      <article class="meta-card"><span>Контакт</span><strong>${escapeHtml(matter.contact)}</strong></article>
      <article class="meta-card"><span>Сфера</span><strong>${escapeHtml(matter.industry)}</strong></article>
      <article class="meta-card"><span>Источник</span><strong>${escapeHtml(matter.sourceType)}</strong></article>
      <article class="meta-card"><span>Доверие к анализу</span><strong>${Math.round(matter.analysis.confidence * 100)}%</strong></article>
      <article class="meta-card"><span>Материалов загружено</span><strong>${(matter.attachments || []).length}</strong></article>
      <article class="meta-card">
        <span>Статус</span>
        <select id="detail-status">
          ${STATUS_ORDER.map((status) => `<option value="${status}" ${status === matter.status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
        </select>
      </article>
    </div>

    <section class="list-block">
      <h4>Ключевые риски</h4>
      ${renderList(
        matter.analysis.risks.map(
          (risk) => `${severityLabel(risk.severity)} · ${risk.category} · ${risk.excerpt}`,
        ),
      )}
    </section>

    <section class="list-block">
      <h4>Ключевые события/таймлайн</h4>
      ${renderList(matter.analysis.timeline.map((event) => timelineText(event)))}
    </section>

    <section class="list-block">
      <h4>Обязательства и сроки</h4>
      ${renderList(matter.analysis.obligations)}
    </section>

    <section class="list-block">
      <h4>Рекомендуемые действия</h4>
      ${renderList(matter.analysis.actions)}
    </section>

    <section class="list-block">
      <h4>Что запоминает ассистент по кейсу</h4>
      ${renderAssistantMemorySummary(matter)}
    </section>

    <section class="list-block">
      <h4>Юридический дисклеймер</h4>
      <ul>
        <li>Материалы ИИ носят вспомогательный характер и не заменяют юридическое заключение.</li>
        <li>Финальные выводы и процессуальные решения принимает уполномоченный юрист.</li>
      </ul>
    </section>

    <section class="list-block">
      <h4>Загруженные материалы</h4>
      ${renderAttachmentList(matter.id, matter.attachments || [])}
    </section>

    <section class="list-block">
      <h4>Журнал изменений</h4>
      ${renderAuditTrail(matter.auditTrail || [])}
    </section>
  `;

  const detailStatusSelect = document.getElementById("detail-status");
  detailStatusSelect.addEventListener("change", (event) => {
    updateStatus(matter.id, event.target.value);
  });
}

function renderKanban() {
  if (!state.user) {
    els.kanbanBoard.innerHTML = "<small>Выполни вход, чтобы управлять статусами кейсов.</small>";
    return;
  }

  els.kanbanBoard.innerHTML = STATUS_ORDER.map((status) => {
    const items = state.matters
      .filter((matter) => matter.status === status)
      .map(
        (matter) => `
          <article class="kanban-item">
            <strong>${escapeHtml(matter.company)}</strong>
            <div>${escapeHtml(matter.summary)}</div>
            <small>${escapeHtml(urgencyLabel(matter.analysis.urgency))} · ${matter.analysis.riskScore}</small>
            <select data-id="${escapeHtml(matter.id)}">
              ${STATUS_ORDER.map((option) => `<option value="${option}" ${option === matter.status ? "selected" : ""}>${statusLabel(option)}</option>`).join("")}
            </select>
          </article>
        `,
      )
      .join("");

    return `
      <section class="kanban-col">
        <h4>${statusLabel(status)}</h4>
        ${items || "<small>Нет кейсов</small>"}
      </section>
    `;
  }).join("");
}

function renderReportScope() {
  if (!state.user) {
    els.reportScope.innerHTML = `<option value="ALL">Сначала выполни вход</option>`;
    return;
  }

  const previousValue = els.reportScope.value;

  const options = [
    `<option value="ALL">Все кейсы (портфель)</option>`,
    ...state.matters.map(
      (matter) => `<option value="${escapeHtml(matter.id)}">${escapeHtml(matter.company)} · ${escapeHtml(matter.summary)}</option>`,
    ),
  ];

  els.reportScope.innerHTML = options.join("");

  if (previousValue && [...els.reportScope.options].some((option) => option.value === previousValue)) {
    els.reportScope.value = previousValue;
  }
}

function getSelectedMatter() {
  return state.matters.find((item) => item.id === state.selectedMatterId) || null;
}

function renderAssistantDock() {
  if (!els.assistantDock) {
    return;
  }

  const matter = getSelectedMatter();
  if (state.user && matter && state.assistantContextMatterId !== matter.id) {
    state.assistantContextMatterId = matter.id;
    addAssistantMessage({
      role: "assistant",
      text: `Контекст переключен на кейс ${matter.company}. Готов собрать позицию, дедлайны и план на 24/72 часа.`,
    });
  }

  if (!state.user) {
    state.assistantContextMatterId = null;
    els.assistantPresence.textContent = "Гостевой режим";
    els.assistantPresence.className = "assistant-presence";
    els.assistantContext.textContent = "Контекст: выполни вход, чтобы ассистент работал с кейсами команды и материалами дела.";
  } else {
    els.assistantPresence.textContent = "На связи";
    els.assistantPresence.className = "assistant-presence is-online";

    if (!matter) {
      state.assistantContextMatterId = null;
      els.assistantContext.textContent = `Контекст: в портфеле ${state.matters.length} кейсов. Выбери кейс, и я перейду в режим точечного сопровождения.`;
    } else {
      const memoryCount = (state.assistantMemoryByMatter[matter.id] || []).length;
      els.assistantContext.textContent =
        `Контекст: ${matter.company} • ${statusLabel(matter.status)} • Риск ${urgencyLabel(matter.analysis.urgency)} (${matter.analysis.riskScore}/100) • Память ассистента: ${memoryCount}`;
    }
  }

  const messages = state.assistantMessages.slice(-24);
  els.assistantChat.innerHTML = messages
    .map(
      (item) => `
      <article class="assistant-message ${item.role === "assistant" ? "is-assistant" : "is-user"}">
        <div class="assistant-message-head">
          <strong>${item.role === "assistant" ? ASSISTANT_PERSONA_NAME : "Вы"}</strong>
          <span>${escapeHtml(formatDate(item.at))}</span>
        </div>
        <p>${escapeHtml(item.text)}</p>
        ${renderAssistantSources(item)}
      </article>
    `,
    )
    .join("");

  els.assistantChat.scrollTop = els.assistantChat.scrollHeight;
}

function addAssistantMessage({ role, text, mode = "local", sources = [], pending = false }) {
  const item = {
    id: generateId("assistant-msg"),
    role,
    text: `${text || ""}`.trim(),
    mode,
    sources: normalizeAssistantSources(sources),
    pending: Boolean(pending),
    at: new Date().toISOString(),
  };

  state.assistantMessages.push(item);

  if (state.assistantMessages.length > 80) {
    state.assistantMessages = state.assistantMessages.slice(-80);
  }

  return item.id;
}

function replaceAssistantMessage(messageId, payload) {
  const index = state.assistantMessages.findIndex((item) => item.id === messageId);
  if (index < 0) {
    addAssistantMessage({
      role: "assistant",
      text: payload?.text || "Не удалось сформировать ответ.",
    });
    return;
  }

  const sources = normalizeAssistantSources(payload?.sources);
  state.assistantMessages[index] = {
    ...state.assistantMessages[index],
    text: `${payload?.text || ""}`.trim() || "Не удалось сформировать ответ.",
    mode: `${payload?.mode || "llm"}`,
    sources,
    pending: false,
    at: new Date().toISOString(),
  };
}

async function requestAssistantReply(prompt, matter) {
  if (!state.user || !state.authToken) {
    throw new Error("auth-required");
  }

  const history = buildAssistantHistory();
  const payload = await apiRequest("/api/assistant/query", {
    method: "POST",
    body: {
      prompt,
      matterId: matter?.id || null,
      history,
    },
  });

  return {
    text: payload.reply || "",
    mode: payload.mode || "llm",
    sources: normalizeAssistantSources(payload.sources),
  };
}

function buildAssistantHistory() {
  return state.assistantMessages
    .filter((item) => !item.pending && (item.role === "assistant" || item.role === "user") && item.text)
    .slice(-12)
    .map((item) => ({
      role: item.role,
      text: `${item.text}`.slice(0, 2000),
    }));
}

function normalizeAssistantSources(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      id: `${item?.id || ""}`.trim(),
      title: `${item?.title || ""}`.trim(),
      snippet: `${item?.snippet || ""}`.trim(),
      sourceType: `${item?.sourceType || "context"}`.trim(),
      score: Number(item?.score || 0),
    }))
    .filter((item) => item.title)
    .slice(0, 4);
}

function renderAssistantSources(item) {
  if (item.role !== "assistant") {
    return "";
  }

  const sources = Array.isArray(item.sources) ? item.sources : [];
  if (!sources.length) {
    return "";
  }

  const rows = sources
    .map((source) => {
      const snippet = source.snippet ? ` — ${source.snippet.slice(0, 120)}${source.snippet.length > 120 ? "..." : ""}` : "";
      const score = Number.isFinite(source.score) && source.score > 0 ? ` · rel ${source.score.toFixed(2)}` : "";
      return `<li><strong>${escapeHtml(source.id || "S?")}</strong> ${escapeHtml(source.title)} <span class="assistant-source-meta">(${escapeHtml(sourceTypeLabel(source.sourceType))}${escapeHtml(score)})</span><br /><span>${escapeHtml(snippet)}</span></li>`;
    })
    .join("");

  return `<div class="assistant-sources"><h5>Опора ответа</h5><ul>${rows}</ul></div>`;
}

function sourceTypeLabel(type) {
  const normalized = `${type || ""}`.toLowerCase();
  if (normalized === "rag") {
    return "база практики";
  }
  if (normalized === "attachment") {
    return "материал дела";
  }
  if (normalized === "analysis") {
    return "извлечения";
  }
  if (normalized === "matter") {
    return "карточка кейса";
  }

  return "контекст";
}

function generateAssistantReply(prompt, matter) {
  if (!state.user) {
    return "Сначала выполни вход. После этого я смогу работать по данным кейсов, материалам и журналу изменений.";
  }

  const legalReferenceReply = buildLegalReferenceReply(prompt);
  if (legalReferenceReply) {
    return legalReferenceReply;
  }

  if (!matter) {
    return "Сейчас нет выбранного кейса. Выбери кейс в реестре, и я подготовлю точечное резюме, дедлайны и план действий.";
  }

  const lowered = `${prompt || ""}`.toLowerCase();
  const memoryNote = extractMemoryCommand(prompt);
  if (memoryNote) {
    saveAssistantMemory(matter.id, memoryNote);
    return `Зафиксировал в памяти кейса: ${memoryNote}. Буду учитывать это в следующих ответах по ${matter.company}.`;
  }

  const lines = [`Принял по кейсу ${matter.company}.`];
  const risks = (matter.analysis?.risks || []).slice(0, 2);
  const timeline = (matter.analysis?.timeline || []).slice(0, 3).map((item) => timelineText(item));
  const obligations = (matter.analysis?.obligations || []).slice(0, 3);
  const actions = (matter.analysis?.actions || []).slice(0, 3);
  const memory = (state.assistantMemoryByMatter[matter.id] || []).slice(0, 2);

  const askSummary = containsAny(lowered, ["резюме", "кратко", "summary", "сводк"]);
  const askDeadlines = containsAny(lowered, ["срок", "дедлайн", "обязатель", "timeline"]);
  const askPlan = containsAny(lowered, ["24", "72", "план", "next", "действ"]);
  const askWeakness = containsAny(lowered, ["слаб", "уязв", "доказатель", "позици"]);

  if (askSummary) {
    lines.push(`Коротко для руководителя: статус ${statusLabel(matter.status)}, риск ${urgencyLabel(matter.analysis.urgency)} (${matter.analysis.riskScore}/100).`);
    lines.push(`Суть: ${matter.summary}.`);
  }

  if (askDeadlines) {
    if (timeline.length || obligations.length) {
      lines.push("Ближайшие сроки и обязательства:");
      [...timeline, ...obligations].slice(0, 4).forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    } else {
      lines.push("Явные сроки не выделены. Рекомендую зафиксировать дедлайны письменно в переписке и добавить в кейс.");
    }
  }

  if (askPlan) {
    lines.push("Рабочий план на 24/72 часа:");
    actions.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
    if (!actions.length) {
      lines.push("1. Провести короткий статус-колл и зафиксировать единый контур коммуникаций.");
    }
  }

  if (askWeakness) {
    if (risks.length) {
      lines.push("Слабые места и что усилить:");
      risks.forEach((risk, index) => {
        lines.push(`${index + 1}. ${risk.category}: ${risk.excerpt}`);
      });
      lines.push("Приоритет усиления: договор, первичка, подтверждение сроков и вручения претензии.");
    } else {
      lines.push("Критичные уязвимости не выделены автоматически. Нужна ручная верификация доказательственной базы.");
    }
  }

  if (!askSummary && !askDeadlines && !askPlan && !askWeakness) {
    lines.push(`Статус: ${statusLabel(matter.status)}. Риск: ${urgencyLabel(matter.analysis.urgency)} (${matter.analysis.riskScore}/100).`);
    if (risks[0]) {
      lines.push(`Ключевой риск: ${risks[0].category} — ${risks[0].excerpt}`);
    }
    if (actions[0]) {
      lines.push(`Первое действие: ${actions[0]}`);
    }
    lines.push("Могу детализировать: «резюме», «сроки», «план 24/72», «слабые места».");
  }

  if (memory.length) {
    lines.push("Память по кейсу:");
    memory.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.text}`);
    });
  }

  return lines.join("\n");
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function extractMemoryCommand(prompt) {
  const match = `${prompt || ""}`.trim().match(/^(?:запомни|запиши|зафиксируй)\s*[:\-]?\s*(.+)$/i);
  if (!match?.[1]) {
    return "";
  }

  return match[1].trim().slice(0, 300);
}

function buildLegalReferenceReply(prompt) {
  const text = `${prompt || ""}`.trim();
  if (!text) {
    return "";
  }

  const lowered = text.toLowerCase();
  const asksArticle = containsAny(lowered, ["статья", "ст.", "упк", "гк", "апк", "коап", "ук"]);
  if (!asksArticle) {
    return "";
  }

  const normalized = lowered.replace(/ё/g, "е");
  const articleMatch = normalized.match(/(?:статья|ст\.)\s*(\d+(?:\.\d+)?)/);
  const article = articleMatch?.[1] || "";

  if (article === "237" && normalized.includes("упк")) {
    return [
      "Ст. 237 УПК РФ: возврат уголовного дела прокурору.",
      "Смысл: суд на стадии подготовки или разбирательства возвращает дело прокурору, если есть существенные процессуальные нарушения, которые нельзя устранить в суде.",
      "Обычно это про дефекты обвинительного заключения/акта и иные нарушения, мешающие рассмотрению дела по существу.",
      "Практический шаг: при споре по этой норме проверьте, какое именно нарушение названо существенным и почему его нельзя исправить в заседании.",
      "Важно: это справочная подсказка, финальное правовое заключение делает юрист по материалам дела и актуальной редакции закона.",
    ].join("\n");
  }

  return "Принял вопрос по норме права. Уточни, пожалуйста, кодекс и статью (например: «ст. 237 УПК РФ»), и я дам краткую практическую выжимку для работы.";
}

function saveAssistantMemory(matterId, text) {
  if (!matterId || !text) {
    return;
  }

  const memoryList = state.assistantMemoryByMatter[matterId] || [];
  memoryList.unshift({
    text,
    at: new Date().toISOString(),
  });
  state.assistantMemoryByMatter[matterId] = memoryList.slice(0, 12);
}

function buildReport(scope) {
  const targets = scope === "ALL" ? state.matters : state.matters.filter((matter) => matter.id === scope);

  if (!targets.length) {
    return "Нет данных для отчета.";
  }

  const highRisks = targets.filter((matter) => matter.analysis.urgency === "HIGH").length;
  const generatedAt = formatDate(new Date().toISOString());

  const reportParts = [
    `# Управленческий юридический отчет`,
    ``,
    `Дата: ${generatedAt}`,
    `Кейсов в отчете: ${targets.length}`,
    `Критичные кейсы: ${highRisks}`,
    ``,
  ];

  targets.forEach((matter, index) => {
    reportParts.push(`## ${index + 1}. ${matter.company}`);
    reportParts.push(`- Контакт: ${matter.contact}`);
    reportParts.push(`- Сфера: ${matter.industry}`);
    reportParts.push(`- Источник: ${matter.sourceType}`);
    reportParts.push(`- Статус: ${statusLabel(matter.status)}`);
    reportParts.push(`- Индекс риска: ${matter.analysis.riskScore}/100 (${urgencyLabel(matter.analysis.urgency)})`);
    reportParts.push(`- Кейс: ${matter.summary}`);
    if (matter.meetingNotes) {
      reportParts.push(`- Конспект записи: ${matter.meetingNotes}`);
    }
    if (matter.routineContext) {
      reportParts.push(`- Рутинный контекст: ${matter.routineContext}`);
    }
    reportParts.push(``);

    reportParts.push(`### Основные риски`);
    if (matter.analysis.risks.length) {
      matter.analysis.risks.forEach((risk, idx) => {
        reportParts.push(`${idx + 1}. ${severityLabel(risk.severity)} · ${risk.category} · ${risk.excerpt}`);
      });
    } else {
      reportParts.push(`1. Явные рисковые маркеры не обнаружены`);
    }

    reportParts.push(``);
    reportParts.push(`### События и сроки`);

    if (matter.analysis.timeline.length) {
      matter.analysis.timeline.forEach((item, idx) => {
        reportParts.push(`${idx + 1}. ${timelineText(item)}`);
      });
    } else {
      reportParts.push(`1. Таймлайн не выявлен автоматически`);
    }

    reportParts.push(``);
    reportParts.push(`### План действий на 72 часа`);
    matter.analysis.actions.forEach((action, idx) => {
      reportParts.push(`${idx + 1}. ${action}`);
    });

    reportParts.push(``);
    reportParts.push(`### Загруженные материалы`);
    const attachments = matter.attachments || [];
    if (attachments.length) {
      attachments.forEach((item, idx) => {
        reportParts.push(`${idx + 1}. ${item.name} (${(item.extension || "").toUpperCase() || "FILE"}, ${item.sizeKb} КБ)`);
      });
    } else {
      reportParts.push(`1. Материалы не приложены`);
    }

    reportParts.push(``);
  });

  reportParts.push(`## Системная рекомендация`);
  reportParts.push(`Утвердить ответственного по каждому кейсу, вести единый письменный контур (почта/ЭДО), раз в неделю проводить короткий статус-колл по рискам и срокам.`);

  return reportParts.join("\n");
}

async function seedDemoData() {
  if (!state.user) {
    window.alert("Сначала выполни вход.");
    return;
  }

  if (state.matters.length) {
    const proceed = window.confirm("Демо-данные добавятся к существующим кейсам. Продолжить?");
    if (!proceed) {
      return;
    }
  }

  const demoCases = [
    {
      company: "ООО ТехноМаркет",
      contact: "Алексей Кузнецов",
      industry: "Дистрибуция",
      sourceType: "Переговоры с контрагентом",
      summary: "Спор по просрочке поставки и неустойке по договору",
      rawText:
        "12.02.2026 в 10:30 поставщик заявил о просрочке и штрафе. До 18.02.2026 обязаны предоставить акт сверки, УПД и оплатить задолженность. В случае отказа будет направлена претензия по АПК РФ и иск в арбитраж.",
      meetingNotes: "Заседание с контрагентом: спор по срокам поставки и неустойке.",
      routineContext: "Переписка за 3 недели, 2 звонка, пакет первички по поставке.",
      attachments: [],
    },
    {
      company: "ИП СеверЛогистик",
      contact: "Наталья Волкова",
      industry: "Логистика",
      sourceType: "Судебное заседание",
      summary: "Расторжение договора и возврат аванса по ГК РФ",
      rawText:
        "На заседании в 14:15 обсуждалось расторжение. Контрагент обязан вернуть аванс до 21.02.2026. При нарушении срока заявитель подает иск в арбитраж и начисляет неустойку, далее возможна стадия ФССП.",
      meetingNotes: "Запись судебного заседания по возврату аванса.",
      routineContext: "Собраны платежки, допсоглашения и акты выполненных работ.",
      attachments: [],
    },
    {
      company: "ООО Ритейл-Фуд",
      contact: "Марина Егорова",
      industry: "Розничная торговля",
      sourceType: "Переписка",
      summary: "Риск по персональным данным и внутреннему комплаенсу",
      rawText:
        "В переписке от 11.02.2026 указано нарушение конфиденциальности. Компания должна предоставить подтверждение удаления персональных данных и подписать допсоглашение до 20.02.2026. Упоминается 152-ФЗ и риск обращения в Роскомнадзор.",
      meetingNotes: "",
      routineContext: "Почта + Telegram, внутренний аудит обработки ПДн.",
      attachments: [],
    },
  ];

  try {
    for (const item of demoCases) {
      await apiRequest("/api/matters", {
        method: "POST",
        body: {
          ...item,
          disclaimerAccepted: true,
        },
      });
    }

    await refreshMatters();
    render();
  } catch (error) {
    window.alert(`Не удалось загрузить демо-данные: ${error.message}`);
  }
}

function riskClassName(level) {
  if (level === "HIGH") {
    return "risk-high";
  }

  if (level === "MEDIUM") {
    return "risk-medium";
  }

  return "risk-low";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function urgencyLabel(level) {
  return URGENCY_LABELS[level] || level;
}

function severityLabel(level) {
  return URGENCY_LABELS[level] || level;
}

function timelineText(event) {
  if (typeof event === "string") {
    return event;
  }

  return event?.event || "";
}

function renderList(items) {
  if (!items.length) {
    return "<ul><li>Нет данных</li></ul>";
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderAttachmentList(matterId, items) {
  if (!items.length) {
    return "<ul><li>Материалы не загружены</li></ul>";
  }

  return `<ul>${items
    .map((item) => {
      const fileLabel = `${escapeHtml(item.name)} (${escapeHtml(((item.extension || "").toUpperCase() || "FILE"))}, ${item.sizeKb || Math.max(1, Math.round((item.sizeBytes || 0) / 1024))} КБ)`;
      if (item.id && matterId) {
        return `<li>
          <button
            type="button"
            class="action-btn download-attachment"
            data-matter-id="${escapeHtml(matterId)}"
            data-attachment-id="${escapeHtml(item.id)}"
            data-attachment-name="${escapeHtml(item.name)}"
          >Скачать</button>
          ${fileLabel}
        </li>`;
      }

      return `<li>${fileLabel}</li>`;
    })
    .join("")}</ul>`;
}

function renderAuditTrail(items) {
  if (!items.length) {
    return "<ul><li>История пока пуста</li></ul>";
  }

  return `<ul>${items
    .slice(0, 20)
    .map((item) => `<li>${escapeHtml(formatDate(item.at))} · ${escapeHtml(item.actor || "system")} · ${escapeHtml(item.summary || item.type || "Событие")}</li>`)
    .join("")}</ul>`;
}

function renderAssistantMemorySummary(matter) {
  const items = [];
  items.push(`Суть спора: ${matter.summary || "Не указано"}`);
  items.push(`Текущий статус: ${statusLabel(matter.status)}`);
  items.push(`Риск: ${urgencyLabel(matter.analysis.urgency)} (${matter.analysis.riskScore}/100)`);
  items.push(`Ключевых событий в таймлайне: ${(matter.analysis.timeline || []).length}`);
  items.push(`Загруженных материалов: ${(matter.attachments || []).length}`);

  if (matter.meetingNotes) {
    items.push(`Конспект записи: ${matter.meetingNotes.slice(0, 180)}${matter.meetingNotes.length > 180 ? "..." : ""}`);
  }

  if (matter.routineContext) {
    items.push(`Рутинный контекст: ${matter.routineContext.slice(0, 180)}${matter.routineContext.length > 180 ? "..." : ""}`);
  }

  const memoryNotes = (state.assistantMemoryByMatter[matter.id] || []).slice(0, 3);
  memoryNotes.forEach((item, index) => {
    items.push(`Память ассистента ${index + 1}: ${item.text}`);
  });

  return renderList(items);
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `matter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileExtension(fileName) {
  const cleaned = String(fileName || "").trim().toLowerCase();
  const dotIndex = cleaned.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === cleaned.length - 1) {
    return "";
  }

  return cleaned.slice(dotIndex + 1);
}

function findTranscribableFile(files) {
  return files.find((file) => TRANSCRIBE_FILE_EXTENSIONS.has(getFileExtension(file.name)));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function setTranscribeStatus(message, type = "info") {
  if (!els.transcribeStatus) {
    return;
  }

  els.transcribeStatus.textContent = message;
  if (type === "error") {
    els.transcribeStatus.style.color = "#b42318";
  } else if (type === "success") {
    els.transcribeStatus.style.color = "#0f766e";
  } else {
    els.transcribeStatus.style.color = "";
  }
}

function setTranscribeProgress(percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  if (els.transcribeProgressFill) {
    els.transcribeProgressFill.style.width = `${value}%`;
  }

  if (els.transcribeProgressText) {
    els.transcribeProgressText.textContent = `${Math.round(value)}%`;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateReportFromApi(scope) {
  if (!state.user) {
    throw new Error("Сначала выполни вход.");
  }

  const query = new URLSearchParams();
  query.set("scope", scope || "ALL");
  const payload = await apiRequest(`/api/reports?${query.toString()}`);
  state.reportText = payload.markdown || "Нет данных для отчета.";
  els.reportPreview.textContent = state.reportText;
}

async function resetAllMatters() {
  await apiRequest("/api/matters/reset", {
    method: "POST",
    body: {},
  });
  await refreshMatters();
  render();
}

async function downloadMatterAttachment(button) {
  if (!state.authToken) {
    window.alert("Сессия отсутствует. Выполни вход.");
    return;
  }

  const matterId = `${button.dataset.matterId || ""}`.trim();
  const attachmentId = `${button.dataset.attachmentId || ""}`.trim();
  const fallbackName = `${button.dataset.attachmentName || "attachment.bin"}`.trim();
  if (!matterId || !attachmentId) {
    window.alert("Не удалось определить материал для скачивания.");
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Скачиваю...";

  try {
    const response = await fetch(
      `/api/matters/${encodeURIComponent(matterId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${state.authToken}`,
        },
      },
    );

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorPayload = await response.json().catch(() => ({}));
        message = errorPayload.error || message;
      }

      if (response.status === 401) {
        handleLogout();
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") || "";
    const downloadedName = parseDownloadFileName(contentDisposition) || fallbackName;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = downloadedName;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    window.alert(`Не удалось скачать материал: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel || "Скачать";
  }
}

function parseDownloadFileName(contentDisposition) {
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }

  const fallback = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return fallback?.[1] || "";
}

async function apiRequest(url, options = {}) {
  if (!state.authToken) {
    throw new Error("Сессия отсутствует. Выполни вход.");
  }

  const headers = {
    Authorization: `Bearer ${state.authToken}`,
    ...(options.headers || {}),
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    return await rawApiRequest(url, {
      method: options.method || "GET",
      headers,
      body: options.body,
    });
  } catch (error) {
    if (error.message.includes("401")) {
      handleLogout();
    }

    throw error;
  }
}

async function rawApiRequest(url, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    headers: options.headers || {},
  };
  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = payload.error || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
