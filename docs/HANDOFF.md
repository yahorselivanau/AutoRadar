# Codex handoff

Дата: 2026-07-28

## Что готово

- Создан pnpm/Turborepo monorepo.
- Создано Next.js App Router приложение с mobile-first shell.
- Реализован демонстрационный путь:
  чат → подтверждение запроса → mock search progress → результаты.
- Реализованы страницы `/chat`, `/garage`, `/search/demo`,
  `/auth/sign-in`, `/privacy`, `/terms`.
- Создан `packages/domain` с Zod-схемами и нормализацией артикула.
- Создан локальный mock adapter с тестом без сети.
- Добавлен начальный Supabase migration и RLS-каркас.
- Добавлены unit и Playwright smoke tests.
- Токены перенесены в `packages/ui/styles/design-tokens.css`.

## Важные ограничения текущей версии

- Все предложения в UI — явно помеченные demo-данные.
- Реальные сайты не исследовались и адаптеры не заявлены рабочими.
- Supabase, Apify и AI-провайдер не подключены к внешним проектам:
  для этого нужны ключи владельца.
- Auth-форма визуальная; отправка email пока не реализована.
- VIN не сохраняется: форма демонстрирует UX и маскирование.

## Следующий приоритетный шаг

1. Создать dev-проекты Supabase и Apify и заполнить `.env.local`.
2. Завершить search job lifecycle через Route Handlers и БД.
3. Исследовать Bamper строго по лестнице из `AGENTS.md`.
4. Создать `actors/search/src/adapters/bamper/DISCOVERY.md`.
5. Сохранить обезличенные fixtures успешной и пустой выдачи.
6. Реализовать и протестировать Bamper adapter.
7. Подключить Vercel AI SDK только после работающего job lifecycle.

## Необходимые решения владельца

- Предоставить dev credentials Supabase и Apify.
- Выбрать AI provider/model после проверки доступности и стоимости.
- Подтвердить юридический контакт/название для User-Agent адаптеров.
- Подтвердить способ входа: magic link email или телефон.
