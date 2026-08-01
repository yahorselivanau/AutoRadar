# AutoRadar — AI-поиск автозапчастей в Беларуси

Mobile-first приложение, которое понимает запрос пользователя, уточняет
автомобиль и деталь, запускает поиск по белорусским источникам и показывает
нормализованные предложения со ссылкой на продавца.

## Документация

- [`docs/PRD.md`](docs/PRD.md) — продукт, пользователи и сценарии.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — текущая архитектура.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — дизайн-система и UX.
- [`docs/SOURCE_ADAPTERS.md`](docs/SOURCE_ADAPTERS.md) — источники и порядок их
  исследования.
- `actors/search/src/adapters/<source>/DISCOVERY.md` — проверенные детали
  конкретного адаптера.

Правила работы Codex находятся в [`AGENTS.md`](AGENTS.md). Остальная
документация подключается только по необходимости текущей задачи.

## Текущее состояние

- Web: Next.js App Router, TypeScript, Tailwind CSS и Vercel AI SDK.
- Data/Auth: Supabase.
- Поиск: общий контракт адаптеров в `packages/domain`.
- Zap.by и Motorland.by подключены к приватному MVP.
- Auto1.by проверен по fixtures и ожидает opt-in live smoke.
- Remzona сохранён, но по умолчанию выключен.
- AI работает через Vercel AI SDK и официальный Google provider: основная
  модель — `gemini-3.5-flash-lite`, fallback —
  `gemini-3.1-flash-lite`; обе используют один серверный `GEMINI_API_KEY`.

## Быстрый старт

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Перед запуском заполните `GEMINI_API_KEY` в `.env.local`.

Приложение откроется на `http://localhost:3000`.

## Основные проверки

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Команды адаптеров:

```bash
pnpm actor:test
pnpm auto1:smoke
pnpm motorland:smoke
pnpm remzona:discover
pnpm remzona:smoke
pnpm zap:smoke
```

Live smoke-тесты включаются соответствующими переменными окружения; точные
условия описаны в `DISCOVERY.md` нужного источника.

## Структура

```text
apps/web       Next.js-приложение
actors/search  адаптеры и оркестрация поиска
packages       доменные схемы и общий UI
supabase       migrations и локальная конфигурация
docs           продуктовая и техническая документация
```

Production: [autoradar.vercel.app](https://autoradar.vercel.app)
