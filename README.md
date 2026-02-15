# ЮрШтаб AI для SMB (Prototype)

Прототип платформы для legal operations в российском SMB: intake кейсов, приоритизация рисков, RAG по локальной юридической базе и role-based backend API.

Архитектура бренда:
- `Master-brand`: `ЮрШтаб AI`
- `Product persona`: `Младший Юрист AI 24/7`

## Что реализовано

- Frontend MVP (dashboard, intake, канбан, отчеты).
- Постоянный UX-слой персоны `Младший Юрист AI 24/7`: быстрые команды, контекст по выбранному кейсу, память заметок по делу.
- Упрощенный intake в стиле `quick start`: для старта достаточно `Компания + Что случилось + материалы` (остальные поля в блоке «Дополнительно»).
- Backend API на Node.js (`http` без внешних зависимостей).
- Авторизация и роли: `OWNER`, `LEGAL_MANAGER`, `ANALYST`, `VIEWER`.
- Self-signup: регистрация пользователя из UI (`Регистрация`) и API (`POST /api/auth/register`), роль по умолчанию `ANALYST`.
- Расшифровка записей закрыта авторизацией и RBAC, добавлены rate-limit и лимит параллельных задач на пользователя.
- Анализ кейса:
  - с OpenAI (`/v1/responses`) при наличии `OPENAI_API_KEY`;
  - fallback на heuristic-анализ, если ключ не задан или API недоступен.
- Авторасшифровка записей заседаний/звонков через OpenAI (`/api/transcribe`), включая большие файлы через серверную нарезку на части.
- RAG retrieval по локальной базе `backend/data/rag_documents.json` (ГК РФ, АПК РФ, 152-ФЗ, ФССП, досудебка).
- Чат-ассистент с multi-turn контекстом: учитывает историю диалога, выбранный кейс и прикрепленные материалы.
- Для вложений `pdf/doc/docx/rtf/txt/md/csv/json/log` выполняется извлечение текста и добавление в контекст ответа с блоком «Опора ответа».
- Генерация управленческого юротчета по портфелю или одному кейсу.
- Реальное хранилище материалов дела: бинарные вложения сохраняются в `backend/data/attachments/*`, доступны через API с аудитом скачиваний.
- Юридические дисклеймеры и журнал изменений по каждому кейсу (`auditTrail` + глобальные `audit_logs.json`).
- Коммуникационный контур для маркетинга и продаж: «не заменяет юриста, снимает рутину, держит сроки и память кейса».
- Интерфейс и рекомендации адаптированы под российский деловой контекст: фокус на сроки, претензионный порядок, доказательства и ответственность.

## Быстрый запуск

```bash
cd /Users/dmitriy/Documents/Codex/ai-legal-ops-prototype
cp .env.example .env
node backend/server.js
```

Открой в браузере:

- [http://localhost:8787](http://localhost:8787)

Сервер также отдает frontend статику (`index.html`, `app.js`, `styles.css`).

## Деплой на Vercel

Проект подготовлен под Vercel через serverless entrypoint `api/index.js` и `vercel.json`.

```bash
cd /Users/dmitriy/Documents/Codex/ai-legal-ops-prototype
npx vercel
```

Для прод-ссылки:

```bash
npx vercel --prod
```

Обязательно добавь переменные окружения в Vercel Project Settings:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TRANSCRIBE_MODEL`
- `JWT_SECRET`
- OCR-параметры при необходимости (`OCR_*`)

Примечание для Vercel:
- файловая система read-only, поэтому проект автоматически переключается на volatile-режим (данные в памяти + `/tmp` для вложений);
- это подходит для демо и пилотных показов, но для production нужна внешняя БД/объектное хранилище.

## Переменные окружения

Файл `.env`:

- `PORT=8787`
- `OPENAI_API_KEY=`
- `OPENAI_MODEL=gpt-4.1-mini`
- `OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe`
- `TRANSCRIPTION_MAX_BYTES=536870912`
- `TRANSCRIPTION_DIRECT_MAX_BYTES=20971520`
- `TRANSCRIPTION_SEGMENT_SECONDS=900`
- `TRANSCRIBE_RATE_LIMIT=8`
- `TRANSCRIBE_RATE_WINDOW_MS=900000`
- `TRANSCRIBE_MAX_CONCURRENT_JOBS=2`
- `MATTER_ATTACHMENT_MAX_BYTES=104857600`
- `MATTER_ATTACHMENTS_TOTAL_MAX_BYTES=262144000`
- `JSON_BODY_MAX_BYTES=314572800`
- `RAG_TOP_K=4`
- `OCR_MAX_PAGES=6`
- `OCR_IMAGE_DPI=220`
- `OCR_TESSERACT_LANG=rus+eng`
- `OCR_OPENAI_FALLBACK=1`
- `OCR_OPENAI_MAX_PAGES=3`
- `JWT_SECRET=change-me`

## Демо-логины

- `owner@demo.legalops / owner123` (OWNER)
- `manager@demo.legalops / manager123` (LEGAL_MANAGER)
- `analyst@demo.legalops / analyst123` (ANALYST)
- `viewer@demo.legalops / viewer123` (VIEWER)

## Основные API

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/me`
- `GET /api/health`
- `GET /api/kpis`
- `GET /api/matters`
- `GET /api/matters/:id`
- `GET /api/matters/:id/audit`
- `GET /api/matters/:id/attachments`
- `GET /api/matters/:id/attachments/:attachmentId/download`
- `POST /api/matters`
- `POST /api/matters/reset` (только OWNER)
- `PATCH /api/matters/:id/status`
- `POST /api/matters/:id/reanalyze`
- `GET /api/reports?scope=ALL|:id`
- `GET /api/rag/documents`
- `POST /api/rag/documents`
- `POST /api/transcribe`
- `POST /api/transcribe/start`
- `GET /api/transcribe/status/:jobId`
- `POST /api/assistant/query`

## Быстрый smoke test через curl

```bash
# 1) login
curl -s -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@demo.legalops","password":"owner123"}'

# 2) create matter (подставь token)
curl -s -X POST http://localhost:8787/api/matters \
  -H "Authorization: Bearer <TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{
    "company":"ООО СтройТех",
    "contact":"Иван Петров",
    "industry":"Строительство",
    "sourceType":"Переговоры",
    "summary":"Спор по неустойке",
    "rawText":"Контрагент заявил о просрочке и требует штраф. До 20.02.2026 обязаны закрыть задолженность.",
    "disclaimerAccepted": true,
    "attachments": []
  }'
```

## Как расшифровать запись в UI

1. Запусти backend (`node backend/server.js`) и убедись, что в `.env` задан `OPENAI_API_KEY`.
2. В разделе `Новый кейс` загрузи файл `mp3/wav/m4a/ogg/mp4/mov`.
3. Нажми `Расшифровать запись ИИ`.
4. Наблюдай прогресс-бар (для больших файлов отображается прогресс по частям).
5. Текст автоматически добавится в поле `Текст/транскрипт`, после чего можно создать кейс.

Примечание: для длинных записей сервер автоматически режет файл через `ffmpeg` и расшифровывает по частям. Убедись, что `ffmpeg` установлен в системе.

Для качества чата по документам:
- На macOS используется `textutil` для извлечения текста из `doc/docx/rtf` (и части `pdf`).
- Для `docx` есть fallback через `unzip` (`word/document.xml`).
- Для `pdf` есть fallback-парсер текстовых потоков.
- Для сканированных PDF включена OCR-цепочка: рендер страниц (`pdftoppm`/`pdftocairo`/`sips`) -> OCR (`tesseract`).
- Если `tesseract` недоступен, при `OCR_OPENAI_FALLBACK=1` используется OCR через OpenAI Vision (нужен `OPENAI_API_KEY`).

## Минимум полей для создания кейса

- Обязательно: `Компания`, `Что случилось (rawText)`, подтверждение дисклеймера.
- Опционально: `Контакт`, `Сфера`, `Источник`, `Краткое название кейса`, `Конспект`, `Рутинный контекст`, вложения.

## Безопасность и комплаенс в MVP

- Все `/api/*` маршруты (кроме `health` и `auth/login`) требуют Bearer-токен.
- Для создания кейса обязателен `disclaimerAccepted=true`.
- Скачивание вложений требует авторизацию и попадает в аудит (`attachment.download`).
- История действий по кейсу пишется в `matter.auditTrail`, системный журнал в `backend/data/audit_logs.json`.

## Структура

- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/index.html`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/styles.css`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/app.js`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/backend/server.js`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/backend/lib/*`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/backend/data/*`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/FIGMA_PITCH_PROMPT_RU.md`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/GO_TO_MARKET_MLADSHIY_YURIST_AI_24_7_RU.md`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/TONE_OF_VOICE_MLADSHIY_YURIST_AI_24_7_RU.md`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/COMMERCIAL_OFFER_PILOT_RU.md`
- `/Users/dmitriy/Documents/Codex/ai-legal-ops-prototype/docs/IP_TRACK_NAME_CHECKLIST_RU.md`
