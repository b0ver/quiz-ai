# Какой ты искусственный интеллект?

Telegram Mini App — квиз из 12 вопросов, который по ответам определяет один из 8 типов
(= языковая модель: Claude, ChatGPT, YandexGPT, GigaChat, Kimi, DeepSeek, Grok, Gemini).
Показывает личный результат, расклад процентов по психотипам и общую статистику всех прошедших.

Работает как Telegram Mini App и просто в браузере. Фронт — статика на GitHub Pages,
бэкенд статистики — Cloudflare Worker + KV.

## Коллекция квизов

Репозиторий — коллекция квизов-мини-аппов. Каждый квиз в своей папке; общие шрифты
(самохостинг) и Telegram-слой лежат в [`shared/`](shared/) и переиспользуются всеми.

| Квиз | Папка | Live | Бэкенд |
|------|-------|------|--------|
| Какой ты ИИ? (этот README) | `/` (корень) | https://b0ver.github.io/quiz-ai/ | Cloudflare Worker |
| Какой ты промптер? | [`prompter/`](prompter/) | https://b0ver.github.io/quiz-ai/prompter/ | нет (статика) |

Деплой промптера и постинг в канал — в [prompter/README.md](prompter/README.md).
Оба квиза обслуживает один бот **@aidaquiz_bot** (по мини-аппу на квиз через `/newapp`).

## Live

- Фронт: **https://b0ver.github.io/quiz-ai/**
- Бэкенд статистики: **https://ai-quiz-stats.b0ver.workers.dev** (`/stats`, `/vote`)

`STATS_API` в `app.js` уже указывает на воркер. Раздел «Деплой» ниже — на случай
повторной настройки/переноса. Остаётся только привязать Web App URL к боту в BotFather.

## Стек

- Чистый HTML/CSS/JS. Без фреймворков, npm и сборки — файлы отдаются статикой как есть.
- Telegram WebApp SDK с CDN: `https://telegram.org/js/telegram-web-app.js`.
- Бэкенд статистики — Cloudflare Worker + KV.

## Структура

```
/
  index.html      разметка + подключения
  styles.css      стили, темизация через CSS-переменные
  quiz-data.js    данные (вопросы, типы, тай-брейк)
  app.js          логика квиза, Telegram, статистика
  /worker
    worker.js     Cloudflare Worker
    wrangler.toml конфиг
  README.md
```

## Локальный запуск

Достаточно любого статик-сервера (нельзя открывать `index.html` через `file://` — не сработает fetch):

```bash
cd quiz-ai
python3 -m http.server 8000
# открыть http://localhost:8000
```

Без настроенного бэкенда (`STATS_API` пуст) приложение работает полностью, кроме блока
«Как у всех остальных» — он просто не показывается.

## Деплой

### 1. GitHub Pages (фронт)

1. Запушить репозиторий на GitHub.
2. Settings → Pages → Source: ветка `main`, папка `/ (root)`.
3. Получить URL вида `https://<user>.github.io/<repo>/`.

### 2. KV namespace

Из папки `worker/` (нужен установленный и залогиненный `wrangler`):

```bash
cd worker
wrangler kv namespace create QUIZ_STATS
```

Команда вернёт `id` — вписать его в `wrangler.toml` вместо `<KV_NAMESPACE_ID>`.

### 3. Деплой воркера

```bash
cd worker
wrangler deploy
```

Получить URL воркера, например `https://ai-quiz-stats.<subdomain>.workers.dev`.

### 4. Связать фронт с бэком

В начале `app.js` вписать URL воркера:

```js
const STATS_API = "https://ai-quiz-stats.<subdomain>.workers.dev";
```

Опционально — ссылку на мини-апп для шеринга:

```js
const SHARE_URL = "https://t.me/<bot>/<app>";
```

Закоммитить, запушить — GitHub Pages обновится автоматически.

### 5. Бот (BotFather)

В BotFather задать Web App URL (кнопка меню или кнопка в группе) на адрес GitHub Pages.

## API воркера

- `POST /vote` — тело `{ "type": "<КОД>" }`, где код из
  `CLA, GPT, YA, GIGA, KIMI, DS, GROK, GEM`. Инкрементит счётчик типа и общий.
- `GET /stats` — возвращает `{ "counts": { ... }, "total": N }`.

Проценты считаются на фронте из `counts` и `total`.

## Анти-накрутка (MVP)

Один `POST /vote` на завершённое прохождение. Повторная отправка после refresh
страхуется флагом в `localStorage` (ключ `quiz_voted`, привязан к текущему результату).

## Заметки и TODO

- **KV не атомарен.** Счётчик `read-modify-write` и лимит KV ~1 запись/сек на ключ.
  Для квиза это ок. Если пойдёт реально вирально — мигрировать счётчики на
  **Durable Objects**. В MVP не делаем.
- CORS в воркере открыт (`ORIGIN = "*"`). На проде сузить до origin GitHub Pages.
- Возможные доработки: картинка-результат через canvas для шеринга, rate-limit по IP
  в воркере, заготовка под i18n (сейчас только RU).

## Что делает заказчик

- Деплой воркера и создание KV (`wrangler deploy`, логин wrangler) — на стороне владельца
  Cloudflare-аккаунта.
- Бот через BotFather и привязка Web App URL.
