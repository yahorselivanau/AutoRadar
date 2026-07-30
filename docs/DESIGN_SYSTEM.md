# DESIGN_SYSTEM — Авто Радар

Статус: **source of truth**

Версия: **1.2**

Дата: **29 июля 2026**

Этот файл задаёт визуальный язык и responsive-поведение «Авто Радар». Точные
значения находятся в `../packages/ui/styles/design-tokens.css`. Не добавлять случайные
цвета,
радиусы, тени и типографические уровни без обновления этих двух файлов.

## 1. Направление

> **Тихий content-first AI-инструмент с точным синим сигналом.**

«Авто Радар» объединяет спокойную композицию современных AI-чатов, мягкие
нейтральные поверхности и рабочую плотность агрегатора. Интерфейс не должен
выглядеть как перегруженный каталог, рекламный маркетплейс или игровой AI.

Основные принципы:

1. **Сначала задача.** Запрос, уточнение и результат важнее application chrome.
2. **Progressive disclosure.** На экране только следующий полезный шаг;
   активность, источники и фильтры раскрываются по запросу.
3. **Одно сильное действие.** В каждой зоне один визуально доминирующий CTA.
4. **Воздух, не пустота.** Узкая колонка текста, широкая рабочая выдача.
5. **Доверие через данные.** Цена, источник, состояние и совместимость
   читаются раньше декоративных деталей.
6. **Одна сущность на всех экранах.** Desktop panel превращается в mobile
   sheet; смысл и состояние не меняются.

Распределение внимания: около 90% нейтрали и текст, 8% Radar Blue, 2%
семантические цвета. Цвет не заменяет заголовок, spacing или иконку.

Не переносить из референсов буквально:

- lifestyle-фото как фон рабочего приложения;
- чужие логотипы, медицинские сценарии и fashion-serif;
- чёрный вместо Radar Blue для продуктового CTA;
- плотную каталожную сетку с постоянной синей заливкой;
- скрытый chain-of-thought в панели активности.

## 2. Бренд

Название и wordmark в интерфейсе — только **Авто Радар**: кириллица, пробел
между словами, без транслитерации и сокращений. `AutoRadar` допустим только во
внутренних технических идентификаторах. Тон: спокойный, точный, полезный.

Wordmark:

- только текст, без иконки, точки, дуги или automotive-мотива;
- Inter Variable 650, optical sizing on;
- 20px на desktop, 18px на mobile, line-height 1;
- tracking `-0.045em` на desktop и `-0.04em` на mobile;
- основной цвет `foreground`;
- одна строка, не переносить и не растягивать;
- без gradient, glow, chrome и декоративных эффектов.

Логотип-иконка не используется. Единственное исключение — системный favicon:
Radar Blue Signal `#0A84FF` и белая кириллическая «А».

## 3. Технологическая база

- Next.js App Router, Server Components по умолчанию;
- Tailwind CSS v4;
- shadcn/ui для primitives;
- Lucide icons;
- AI Elements допустим как headless/composition reference;
- Base UI допустим для сложных drawer/dialog primitives;
- официальный Inter 4.1 Variable из `rsms/inter`, normal и italic, локально
  через `next/font/local`; Latin и Cyrillic обязательны, CDN запрещён;
- light theme only до отдельной продуктовой задачи.

Компоненты сторонних библиотек всегда приводить к токенам AutoRadar.

## 4. Цвет

### Core

| Role             | Token                       | Value     |
| ---------------- | --------------------------- | --------- |
| canvas           | `--ar-canvas`               | `#F8F8F6` |
| surface          | `--ar-surface`              | `#FFFFFF` |
| subtle surface   | `--ar-surface-subtle`       | `#F4F4F2` |
| selected/chip    | `--ar-surface-muted`        | `#ECECEA` |
| pressed/disabled | `--ar-surface-strong`       | `#E4E3DF` |
| inverse neutral  | `--ar-surface-inverse`      | `#211E1B` |
| text             | `--ar-foreground`           | `#211E1B` |
| secondary text   | `--ar-foreground-secondary` | `#67625D` |
| muted text       | `--ar-foreground-muted`     | `#756F69` |
| border           | `--ar-border`               | `#E6E5E2` |
| strong border    | `--ar-border-strong`        | `#D7D5D1` |

### Brand and state

- Radar Blue `#0A84FF`: focus and active-search signal.
- Radar Blue Strong `#0072DC`: accessible main CTA with white text.
- Green: success/available/confirmed.
- Yellow: clarification/attention.
- Orange: partial/limited.
- Red: error/destructive only.
- Violet: AI-generated signal only when a neutral treatment is insufficient.

Use soft backgrounds for badges; never turn a result list into a rainbow.
Original/analog/new/used are labels backed by source data, not decoration.

## 5. Typography

Font stack:

```text
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif
```

Источник: официальный `rsms/inter`, версия 4.1. Используются variable axes
`wght` 100–900 и `opsz` 14–32. Включены kerning, standard ligatures и
contextual alternates; `font-optical-sizing: auto`. Не имитировать
отсутствующие начертания (`font-synthesis: none`).

| Style   | Mobile / desktop | Weight | Line-height | Use              |
| ------- | ---------------- | ------ | ----------- | ---------------- |
| display | 36 / 48          | 600    | 1.04        | onboarding only  |
| h1      | 28 / 32          | 600    | 1.15        | page title       |
| h2      | 23 / 26          | 600    | 1.22        | section/dialog   |
| h3      | 19 / 20          | 600    | 1.30        | card title       |
| body-lg | 17 / 18          | 400    | 1.55        | chat emphasis    |
| body    | 16               | 400    | 1.50        | default          |
| body-sm | 14               | 400    | 1.45        | cards/metadata   |
| label   | 13               | 500    | 1.35        | labels/badges    |
| caption | 12               | 400    | 1.40        | helper/timestamp |
| price   | 20 / 22          | 700    | 1.10        | BYN price        |

Rules:

- text below 12px is forbidden;
- body 400, интерфейсные labels 500–550, headings 600–650, цены 700;
- отрицательный tracking допустим только в крупных заголовках и wordmark;
- headings use `text-wrap: balance`;
- short paragraphs/descriptions use `text-wrap: pretty`;
- prose/chat width is 720–760px;
- price, timers, years, OEM and VIN fragments use tabular numerals;
- do not turn OEM/VIN into a monospace visual theme;
- uppercase is reserved for short technical identifiers.

## 6. Spacing and layout

Base unit: 4px. Preferred steps: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
Avoid one-off spacing unless required by safe areas or optical alignment.

| Constant           |  Value |
| ------------------ | -----: |
| desktop sidebar    |  256px |
| collapsed sidebar  |   72px |
| activity panel     |  376px |
| chat/prose column  |  760px |
| composer           |  840px |
| structured results | 1040px |
| quiet app header   |   56px |

Desktop content starts 48–72px below the header. Mobile horizontal padding is
20–24px; dense offer cards may use 16px. Composer must reserve bottom
safe-area and must never cover the last message.

Breakpoints:

- `<768px`: mobile;
- `768–1279px`: tablet/compact desktop;
- `≥1280px`: wide desktop with optional side panels.

Validate at 360, 390, 430, 768, 1024, 1280 and 1440px.

## 7. Shape, depth and icons

Radius scale: 6, 8, 12, 16, 20, 24, 30px and full pill.

- controls: 12px;
- cards: 16–20px;
- user bubble/sheet: 24px;
- floating composer/large mobile sheet: 24–30px.

Nested close surfaces use concentric geometry:
`outer radius = inner radius + padding`. If padding exceeds 24px, treat the
layers independently.

Depth rules:

- ordinary content blocks are flat;
- dividers use hairline borders;
- cards/buttons use a subtle layered shadow-ring when depth is needed;
- floating composer, popover and modal are the only common elevated layers;
- never add heavy shadow to every offer card.

Product images use a 1px inset outline of pure black at 10% opacity, not a
tinted neutral. This keeps white product photos visible without dirty edges.

Icons:

- Lucide, 1.75–2px stroke;
- 16px inline, 18–20px navigation, 20–24px primary actions;
- icon-only actions need `aria-label`;
- visually asymmetric arrows/triangles are aligned optically;
- visible icon may be small, but hit area is 44×44px on touch and 40×40px on
  dense desktop.

## 8. Motion and interaction

Motion explains state; it does not decorate.

- hover/focus: 120ms;
- ordinary state change: 180ms;
- drawer/dialog: 240ms;
- interactive open/close uses interruptible CSS transitions;
- exit is shorter and subtler than enter;
- press feedback is `scale(0.96)`;
- never use `transition: all`;
- `will-change` only after observed stutter and only for transform/opacity/filter;
- contextual icon swaps use opacity `0→1`, scale `.25→1`, blur `4px→0`;
- dynamic content may enter in 2–3 semantic groups with about 90–100ms stagger;
- no first-load animation for controls already in their default state;
- fully support `prefers-reduced-motion`.

Loading:

- skeleton for unknown layout;
- spinner for a short action;
- source progress for federated search;
- prefer stable dimensions over shifting placeholders.

## 9. Application shell

### Desktop

- sidebar uses `surface-subtle`, active row uses `surface-muted`;
- sidebar is quiet: one primary «Новый поиск» action, garage/history below;
- header is borderless until content scrolls under it;
- conversation stays in the 760px column;
- composer may be wider at 840px;
- activity/sources may open in a 376px right panel;
- structured comparison may expand to 1040px.

### Mobile

- compact 56px header with menu, wordmark and account action;
- navigation is a drawer `min(88vw, 360px)` with scrim;
- composer floats 16–20px from the sides;
- activity, sources, auth and filters use bottom/full-height sheets;
- sheets have a visible close action; grabber is supplementary, not the only
  dismissal control;
- primary content never relies on horizontal tables.

Opening drawer, activity, results or auth preserves chat content, scroll,
composer draft, active vehicle and focus return target.

## 10. Core product compositions

### Chat

Empty state:

- short title and one sentence;
- composer is the visual anchor;
- 3–4 example prompts maximum;
- optional entry modes: description, OEM, VIN, vehicle;
- no decorative dashboard cards.

Assistant message:

- ordinary prose has no avatar or persistent bubble;
- Markdown uses the shared `Typeset` rhythm for headings, lists, links, code
  and tables instead of exposing raw syntax;
- tool/source metadata is muted and collapsible;
- structured content may use cards across the chat column.

User message:

- right aligned;
- `surface-muted`;
- radius `24px 24px 6px 24px`;
- max width 82% mobile / 72% desktop.

### Floating composer

- white surface, quiet shadow-ring, radius 26–30px;
- collapsed height at least 64px;
- textarea auto-grows to 160px mobile / 220px desktop;
- the top context rail contains the active-vehicle switcher and guest
  AI-request balance; both open lightweight anchored popovers;
- secondary tools live in the lower toolbar row;
- send is a 40×40px Radar Blue Strong circle; empty/disabled is neutral;
- Enter sends, Shift+Enter adds newline;
- while responding, send becomes stop;
- attachment control is absent until the feature exists.

Chat primitives use shadcn-style local wrappers with Base UI behavior:
`Message`, `Bubble`, `Marker`, `MessageScroller` and `Popover`. Vehicle and
quota popovers remain keyboard accessible, return focus to their trigger and
adapt to the narrow mobile composer without becoming full-screen dialogs.

### Request confirmation

Show only extracted fields that affect search:

- vehicle;
- part and OEM;
- side/position;
- condition and other verified constraints.

Each field is editable. Unknown stays unknown. One button starts search.
Clarifications use 2–5 large chips/buttons; never bury a critical choice in
assistant prose.

### Search activity and sources

Activity is user-safe operational status, never private reasoning:

- normalized request;
- source queued/running/completed/empty/timeout/failed;
- result count and elapsed time;
- final partial/completed state.

Desktop: closable 376px right panel.

Tablet: large drawer/dialog.

Mobile: bottom sheet up to 88dvh with sticky title and 52px source rows.

### Results

Chat first shows a compact summary: counts, price range, partial failures and
one «Открыть результаты» action.

Full results:

- mobile: full-screen layer/cards;
- tablet: large drawer/dialog;
- wide desktop: structured workspace up to 1040px;
- preserves chat and returns to the same scroll position;
- filters become wrapping chips + sheet, never a permanent mobile rail.

Offer card information order:

1. image and title;
2. price in BYN;
3. source/seller and availability;
4. condition, original/analog and match confidence only when evidenced;
5. OEM/article and delivery/location;
6. compatibility warning;
7. one external action naming the source.

Mobile cards stack. Desktop uses 2–3 columns or a dense list; never shrink
cards merely to imitate a four-column marketplace. A source failure does not
hide other offers. Partial results are explicit.

### Garage and auth

Garage list shows vehicle name, make/model/year, masked VIN, active state and
edit action. Full VIN is never a decorative identifier.

Search starts without registration. Let a guest complete several real searches
before showing quota pressure. Warn softly when two searches remain; at the
limit keep history and results readable and ask for account only in the area
where the next new search is blocked. Account is also offered for
saving/syncing:

- desktop dialog 480–560px;
- mobile bottom/full-height sheet;
- filled neutral fields;
- helper/legal copy stays near the submit action;
- disabled action until valid;
- visible close and «Продолжить без входа» when policy allows.
- quota copy states exactly what remains available and never disguises the
  limit as a technical error.

## 11. Component rules

Buttons:

- primary: Radar Blue Strong fill, white text;
- neutral strong: `surface-inverse`, only for shell/local navigation actions;
- secondary: `surface-muted`;
- outline: shadow-ring or quiet border;
- ghost: no background until hover;
- destructive: red only after destructive intent;
- text labels use verbs; disabled state must not look active.

Inputs:

- minimum 44px high;
- neutral filled surface for low-risk forms;
- explicit border/focus ring for editable search constraints;
- errors use text + icon, not color alone;
- labels remain visible when value is present.

Cards:

- 16–20px radius;
- 16px padding mobile, 20px desktop;
- no shadow by default;
- hover elevation only when the whole card is clickable.

Badges:

- one line, 12–13px, semibold;
- semantic soft fill;
- no more than 2–3 prominent badges per card.

Dialogs/sheets:

- title, description, scrollable content, clear actions;
- close is always visible;
- destructive confirmation names the object and consequence.

Toasts:

- for completed background actions, not validation;
- concise and dismissible;
- never the only place where an error is explained.

## 12. Accessibility and content

- WCAG AA contrast;
- keyboard access and visible Radar Blue focus ring;
- semantic buttons/links/labels before ARIA patches;
- touch targets 44×44px;
- focus trap and focus restoration for dialog/drawer/sheet;
- Escape closes non-destructive overlays;
- loading/status updates use appropriate live regions;
- color is never the only status signal;
- Russian UI is primary; allow long words/OEM to wrap or truncate with copy;
- external action names the source: «Открыть на Motorland»;
- compatibility copy is factual: «Совместимость не подтверждена источником»;
- never say «точно подходит» without source evidence.

## 13. Rules for Codex

Before UI work:

1. read this file and `../packages/ui/styles/design-tokens.css`;
2. reuse an existing component/composition;
3. use semantic tokens, not raw palette values;
4. implement loading, empty, error and partial states;
5. verify mobile and desktop;
6. preserve chat/search state across overlays;
7. add or update at least one relevant test.

Forbidden:

- unapproved gradients, glassmorphism, glow and heavy shadows;
- blue fills on large content areas;
- random radii/spacing/type sizes;
- generic «Подробнее» when the destination can be named;
- hover-only essential actions;
- full VIN in logs or ordinary list UI;
- animation that blocks input or ignores reduced motion;
- `transition: all`;
- fabricated compatibility, OEM, condition or original/analog status.

## 14. Definition of Done

- responsive at the required widths;
- keyboard and touch flows work;
- long Russian text and OEM do not overflow;
- prices/timers do not shift;
- composer does not cover content or keyboard;
- overlays preserve chat, draft, scroll and focus;
- same activity information exists in desktop panel and mobile sheet;
- every offer shows source before external transition;
- loading, empty, error and partial states are tested;
- reduced motion works;
- no secret or full VIN is exposed.

Implementation values are kept in
`../packages/ui/styles/design-tokens.css`.
