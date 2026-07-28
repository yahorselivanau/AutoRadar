# Codex handoff

Дата: 2026-07-28

## Что готово

- Создан pnpm/Turborepo monorepo.
- Создано Next.js App Router приложение с mobile-first shell.
- Реализован реальный AI-разбор запроса через Vercel AI Gateway:
  `openai/gpt-5.4-nano` → Zod-схема → подтверждение распознанных параметров.
- Реализованы страницы `/chat`, `/garage`, `/search/demo`,
  `/auth/sign-in`, `/privacy`, `/terms`.
- Создан `packages/domain` с Zod-схемами и нормализацией артикула.
- Создан fixture-first Remzona adapter: публичный XHR → HTML + Cheerio →
  нормализованные реальные товарные карточки.
- Добавлен `POST /api/search/remzona` и подключён к кнопке поиска в чате.
- Подтверждены live success, empty и HTTP 429; добавлены typed errors, pacing,
  feature flag и ручной smoke.
- Полный локальный production flow `AI → /api/search/remzona → 8 карточек`
  проверен в браузере на desktop и mobile 390×844.
- Развёрнут private Apify Actor `autoradar-search` (`tzkyHgzrHkaHDJkHI`);
  cloud build и mock dataset run успешно проверены.
- Добавлен начальный Supabase migration и RLS-каркас.
- Добавлены unit и Playwright smoke tests.
- Токены перенесены в `packages/ui/styles/design-tokens.css`.

## Важные ограничения текущей версии

- Фиктивные предложения удалены; реальная выдача Remzona доступна без
  регистрации и без стороннего scraping API.
- Search XHR не содержит цену и наличие, поэтому AutoRadar показывает их только
  на исходной карточке и не выдумывает значения.
- Bamper отложен и удалён из рабочего runtime.
- Supabase persistence ещё не подключён к runtime поиска.
- `APIFY_TOKEN` сохранён в Vercel как production Sensitive env,
  `APIFY_SEARCH_ACTOR_ID` — во всех окружениях.
- AI Gateway подключён через Vercel OIDC, модель задаётся `AI_MODEL`.
- `openai/gpt-5.4-nano` отвечает через текущий Free Credit; реальный smoke
  AI Gateway завершился HTTP 200.
- Auth-форма визуальная; отправка email пока не реализована.
- VIN не сохраняется: форма демонстрирует UX и маскирование.

## Следующий приоритет

- Протестировать Remzona через `/chat` на production-like окружении.
- Подключить ещё один простой источник новых деталей.
- Перевести web-поиск на persisted search job lifecycle после стабилизации двух
  источников.
