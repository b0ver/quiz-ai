/* ============================================================
   Какой ты искусственный интеллект? — логика квиза
   Чистый JS, без зависимостей. Данные — в quiz-data.js.
   ============================================================ */

// --- Конфиг бэкенда. Впиши сюда URL воркера после деплоя (раздел README, шаг 4).
//     Пример: "https://ai-quiz-stats.<subdomain>.workers.dev"
//     Пусто => блок общей статистики просто не показывается.
const STATS_API = "https://ai-quiz-stats.b0ver.workers.dev";

// --- Ссылка на мини-апп для шеринга. Пусто => текущий URL страницы.
//     Например: "https://t.me/<bot>/<app>"
const SHARE_URL = "https://t.me/aidaquiz_bot/aidaquizAI";

/* ---------- Telegram WebApp ---------- */
// SDK с CDN определяет window.Telegram.WebApp даже в обычном браузере (degraded-режим,
// platform === "unknown"). Поэтому реальный Telegram-контекст определяем по platform.
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const inTelegram = !!(tg && tg.platform && tg.platform !== "unknown");

function initTelegram() {
  if (!inTelegram) return; // обычный браузер — дефолтная тёмная тема из styles.css
  try {
    tg.ready();
    tg.expand();
    applyTelegramTheme();
    tg.onEvent("themeChanged", applyTelegramTheme);
  } catch (e) { /* fallback на дефолтную тему */ }
}

// Маппинг themeParams -> CSS-переменные. Чего нет — остаётся дефолт из styles.css.
function applyTelegramTheme() {
  if (!tg || !tg.themeParams) return;
  const p = tg.themeParams;
  const root = document.documentElement.style;
  const set = (cssVar, val) => { if (val) root.setProperty(cssVar, val); };

  set("--bg", p.bg_color);
  set("--text", p.text_color);
  set("--hint", p.hint_color);
  set("--accent", p.button_color);
  set("--accent-text", p.button_text_color);
  set("--card", p.secondary_bg_color);
  set("--card-2", p.section_bg_color || p.secondary_bg_color);
  set("--border", p.section_separator_color);

  if (p.bg_color) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", p.bg_color);
  }
}

function haptic(style) {
  if (inTelegram && tg.HapticFeedback) {
    try { tg.HapticFeedback.impactOccurred(style || "light"); } catch (e) {}
  }
}

function notifyHaptic(type) {
  if (inTelegram && tg.HapticFeedback) {
    try { tg.HapticFeedback.notificationOccurred(type || "success"); } catch (e) {}
  }
}

/* ---------- Состояние ---------- */
const state = {
  index: 0,            // текущий вопрос
  answers: [],         // массив score-типов по ответам
  result: null,        // ключ типа-победителя
  scores: null         // объект очков по типам
};

/* ---------- DOM ---------- */
const screens = {
  intro: document.getElementById("screen-intro"),
  quiz: document.getElementById("screen-quiz"),
  result: document.getElementById("screen-result")
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("is-active"));
  screens[name].classList.add("is-active");
  window.scrollTo(0, 0);
}

/* ---------- Подсчёт результата ---------- */
function computeResult(answers) {
  const scores = {};
  Object.keys(ARCHETYPES).forEach((k) => { scores[k] = 0; });
  answers.forEach((type) => { if (scores[type] != null) scores[type] += 1; });

  // Победитель: максимум очков. При равенстве — раньше в TIEBREAK выигрывает.
  // Идём по TIEBREAK со строгим '>': первый встреченный максимум остаётся.
  let winner = null;
  let best = -1;
  TIEBREAK.forEach((type) => {
    if (scores[type] > best) { best = scores[type]; winner = type; }
  });
  return { winner, scores };
}

// Целочисленные проценты, суммирующиеся РОВНО в 100 (метод наибольшего остатка).
// values: объект key->число; total: знаменатель (обычно сумма values).
// Отдаёт объект key->pct. Без этого независимое округление иногда даёт 99/101%.
function percentages(values, total) {
  const keys = Object.keys(values);
  const out = {};
  if (!total) { keys.forEach((k) => { out[k] = 0; }); return out; }
  const parts = keys.map((k) => {
    const exact = (values[k] / total) * 100;
    const floor = Math.floor(exact);
    return { k: k, floor: floor, rem: exact - floor };
  });
  const sumFloor = parts.reduce((s, p) => s + p.floor, 0);
  const sumVals = parts.reduce((s, p) => s + values[p.k], 0);
  const target = Math.round((sumVals / total) * 100); // для нашего случая = 100
  const deficit = Math.max(0, target - sumFloor);
  parts.sort((a, b) => b.rem - a.rem); // больший остаток округляем вверх первым
  parts.forEach((p, i) => { out[p.k] = p.floor + (i < deficit ? 1 : 0); });
  return out;
}

// Личный расклад: типы со score > 0, по убыванию. Проценты — методом наибольшего остатка.
function personalBreakdown(scores) {
  const pcts = percentages(scores, QUESTIONS.length); // знаменатель = 12
  return Object.keys(scores)
    .filter((k) => scores[k] > 0)
    .map((k) => ({ key: k, score: scores[k], pct: pcts[k] }))
    .sort((a, b) => b.score - a.score);
}

/* ---------- Рендер вопроса ---------- */
function renderQuestion() {
  const q = QUESTIONS[state.index];
  document.getElementById("q-current").textContent = String(state.index + 1);
  document.getElementById("q-total").textContent = String(QUESTIONS.length);
  document.getElementById("q-progress-fill").style.width =
    ((state.index) / QUESTIONS.length) * 100 + "%";
  document.getElementById("q-text").textContent = q.q;

  const box = document.getElementById("q-options");
  box.innerHTML = "";
  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.textContent = opt.text;
    btn.addEventListener("click", () => pickOption(opt.score, btn));
    box.appendChild(btn);
  });
}

function pickOption(scoreType, btn) {
  haptic("light");
  btn.classList.add("is-picked");
  state.answers[state.index] = scoreType;

  // небольшая пауза, чтобы успел проиграться визуальный отклик
  setTimeout(() => {
    if (state.index < QUESTIONS.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      finishQuiz();
    }
  }, 140);
}

/* ---------- Завершение ---------- */
function finishQuiz() {
  const { winner, scores } = computeResult(state.answers);
  state.result = winner;
  state.scores = scores;
  renderResult();
  showScreen("result");
  notifyHaptic("success");
  setupResultMainButton();
  submitVoteOnce(winner);
  loadStats(winner);
}

function renderResult() {
  const a = ARCHETYPES[state.result];
  document.getElementById("r-emoji").textContent = a.emoji;
  document.getElementById("r-name").textContent = a.name;
  document.getElementById("r-psychotype").textContent = a.psychotype;
  document.getElementById("r-desc").textContent = a.desc;
  document.getElementById("r-tagline").textContent = a.tagline;
  document.getElementById("r-team").textContent = a.team;

  // Личный расклад
  const breakdown = personalBreakdown(state.scores);
  const host = document.getElementById("r-breakdown");
  host.innerHTML = "";
  breakdown.forEach((row) => {
    host.appendChild(barRow({ key: row.key, pct: row.pct, isMe: row.key === state.result }));
  });
}

// Одна строка-полоска. Длина полосы = реальному проценту (честно, без нормировки к максимуму).
function barRow({ key, pct, isMe }) {
  const a = ARCHETYPES[key];
  const wrap = document.createElement("div");
  wrap.className = "bar" + (isMe ? " is-me" : "");
  wrap.innerHTML =
    '<div class="bar__head">' +
      '<span class="bar__name"><span class="bar__emoji">' + a.emoji + "</span>" + a.name + "</span>" +
      '<span class="bar__pct">' + pct + "%</span>" +
    "</div>" +
    '<div class="bar__track"><div class="bar__fill"></div></div>';
  // анимируем ширину после вставки
  const fill = wrap.querySelector(".bar__fill");
  requestAnimationFrame(() => { fill.style.width = pct + "%"; });
  return wrap;
}

/* ---------- Статистика (бэкенд) ---------- */
async function loadStats(winner) {
  if (!STATS_API) return; // бэкенд не настроен — блок скрыт
  try {
    const resp = await fetch(STATS_API.replace(/\/$/, "") + "/stats", { method: "GET" });
    if (!resp.ok) throw new Error("stats " + resp.status);
    const data = await resp.json();
    renderStats(data, winner);
  } catch (e) {
    // graceful degradation: блок просто не показываем
  }
}

function renderStats(data, winner) {
  const counts = (data && data.counts) || {};
  const total = (data && data.total) || 0;
  if (!total) return;

  // Нормализуем counts по всем типам и считаем проценты методом наибольшего остатка.
  const norm = {};
  Object.keys(ARCHETYPES).forEach((k) => { norm[k] = counts[k] || 0; });
  const pcts = percentages(norm, total);

  const rows = Object.keys(ARCHETYPES)
    .map((k) => ({ key: k, count: norm[k], pct: pcts[k] || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!rows.length) return;

  const myPct = pcts[winner] || 0; // согласовано с полоской твоего типа

  document.getElementById("r-stats-summary").innerHTML =
    "Всего прошли: <b>" + total + "</b>. Ты в числе <b>" + myPct + "%</b> таких же.";

  const host = document.getElementById("r-stats-bars");
  host.innerHTML = "";
  rows.forEach((r) => {
    host.appendChild(barRow({ key: r.key, pct: r.pct, isMe: r.key === winner }));
  });

  document.getElementById("r-stats-block").hidden = false;
}

// Один POST на завершённое прохождение. Защита от повторной отправки на refresh.
function submitVoteOnce(winner) {
  if (!STATS_API || !winner) return;
  const runId = currentRunId();
  const guardKey = "quiz_voted";
  try {
    if (localStorage.getItem(guardKey) === runId) return; // уже голосовали за этот прогон
  } catch (e) { /* localStorage недоступен — голосуем без guard */ }

  fetch(STATS_API.replace(/\/$/, "") + "/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: winner })
  })
    .then(() => { try { localStorage.setItem(guardKey, runId); } catch (e) {} })
    .catch(() => { /* graceful: статистика просто не пополнится */ });
}

// Идентификатор текущего прохождения: тип + хэш последовательности ответов.
// Refresh не запускает прохождение заново (стейт сбрасывается на интро),
// но этот guard страхует от повторного POST для одного и того же результата.
function currentRunId() {
  return state.result + ":" + state.answers.join("");
}

/* ---------- Шеринг ---------- */
function shareUrl() {
  if (SHARE_URL) return SHARE_URL;
  return window.location.origin + window.location.pathname;
}

function shareText() {
  const a = ARCHETYPES[state.result];
  return "Я — " + a.name + " " + a.emoji + "! " + a.psychotype + ".\n" +
    a.tagline + "\n\nА ты какой искусственный интеллект? Проверь:";
}

function doShare() {
  haptic("medium");
  const url = shareUrl();
  const text = shareText();

  if (inTelegram && typeof tg.openTelegramLink === "function") {
    const link = "https://t.me/share/url?url=" + encodeURIComponent(url) +
      "&text=" + encodeURIComponent(text);
    tg.openTelegramLink(link);
    return;
  }

  // Вне Telegram: системный шеринг или копирование ссылки + тост.
  if (navigator.share) {
    navigator.share({ text: text, url: url }).catch(() => {});
    return;
  }
  copyToClipboard(text + " " + url).then((ok) => {
    showToast(ok ? "Ссылка скопирована" : "Не удалось скопировать");
  });
}

function copyToClipboard(str) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(str).then(() => true).catch(() => fallbackCopy(str));
  }
  return Promise.resolve(fallbackCopy(str));
}

function fallbackCopy(str) {
  try {
    const ta = document.createElement("textarea");
    ta.value = str;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-shown"), 2200);
}

/* ---------- MainButton (Telegram) ---------- */
function setupResultMainButton() {
  if (!inTelegram || !tg.MainButton) return;
  try {
    tg.MainButton.setText("Поделиться");
    tg.MainButton.show();
    tg.MainButton.offClick(doShare);
    tg.MainButton.onClick(doShare);
  } catch (e) {}
}

function hideMainButton() {
  if (inTelegram && tg.MainButton) { try { tg.MainButton.hide(); } catch (e) {} }
}

/* ---------- Управление ---------- */
function startQuiz() {
  haptic("light");
  state.index = 0;
  state.answers = [];
  state.result = null;
  state.scores = null;
  renderQuestion();
  showScreen("quiz");
  hideMainButton();
}

function restart() {
  haptic("light");
  hideMainButton();
  document.getElementById("r-stats-block").hidden = true;
  startQuiz();
}

/* ---------- Инициализация ---------- */
function init() {
  initTelegram();
  document.getElementById("q-total").textContent = String(QUESTIONS.length);
  document.getElementById("btn-start").addEventListener("click", startQuiz);
  document.getElementById("btn-share").addEventListener("click", doShare);
  document.getElementById("btn-restart").addEventListener("click", restart);
  showScreen("intro");
  hideMainButton();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
