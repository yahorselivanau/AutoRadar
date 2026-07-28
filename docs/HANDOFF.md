# Codex handoff

Дата: 2026-07-28

## Что готово

- Создан pnpm/Turborepo monorepo.
- Создано Next.js App Router приложение с mobile-first shell.
- Реализован реальный AI-разбор запроса через Vercel AI Gateway:
  DeepSeek → Zod-схема → подтверждение распознанных параметров.
- Реализованы страницы `/chat`, `/garage`, `/search/demo`,
  `/auth/sign-in`, `/privacy`, `/terms`.
- Создан `packages/domain` с Zod-схемами и нормализацией артикула.
- Создан локальный mock adapter с тестом без сети.
- Добавлен начальный Supabase migration и RLS-каркас.
- Добавлены unit и Playwright smoke tests.
- Токены перенесены в `packages/ui/styles/design-tokens.css`.

## Важные ограничения текущей версии

- Фиктивные предложения удалены; реальная выдача пока недоступна.
- Реальные сайты не исследовались и адаптеры не заявлены рабочими.
- Supabase и Apify не подключены к runtime приложения.
- AI Gateway подключён через Vercel OIDC, модель задаётся `AI_MODEL`.
- DeepSeek runtime заблокирован до пополнения AI Gateway credits или
  подключения DeepSeek BYOK; это подтверждено реальным запросом с HTTP 403.
- Auth-форма визуальная; отправка email пока не реализована.
- VIN не сохраняется: форма демонстрирует UX и маскирование.

## Следующий приоритетный шаг

1. Создать dev-проекты Supabase и Apify и заполнить `.env.local`.
2. Завершить search job lifecycle через Route Handlers и БД.
3. Исследовать Bamper строго по лестнице из `AGENTS.md`.
4. Создать `actors/search/src/adapters/bamper/DISCOVERY.md`.
5. Сохранить обезличенные fixtures успешной и пустой выдачи.
6. Реализовать и протестировать Bamper adapter.
7. Подключить AI tool calling к `start_parts_search` после работающего job lifecycle.

## Необходимые решения владельца

- Предоставить dev credentials Supabase и Apify.
- Настроить бюджет и rate limits AI Gateway перед публичным тестом.
- Подтвердить юридический контакт/название для User-Agent адаптеров.
- Подтвердить способ входа: magic link email или телефон.
