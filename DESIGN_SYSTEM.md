# DESIGN_SYSTEM — AutoRadar

Статус: **implementation-ready**  
Версия: **1.0**  
Дата: **28 июля 2026**  
Продукт: **AutoRadar** — AI-first агрегатор автозапчастей для Беларуси.

Этот файл является источником истины для визуального языка, UI-компонентов и responsive-поведения. Codex не должен придумывать новые цвета, радиусы, типографические уровни или паттерны без обновления этого документа.

---

## 1. Дизайн-направление

AutoRadar сочетает четыре идеи:

- спокойный, текстоцентричный интерфейс ChatGPT;
- тёплые бумажные нейтрали и уверенная типографика xAI;
- мягкие кремовые поверхности и дружелюбные акценты Family;
- функциональный электрический синий и чёткие состояния Superwhisper.

Итоговый характер:

> **Тёплый нейтральный AI-инструмент с точным синим сигналом.**

Интерфейс должен выглядеть современно, профессионально и спокойно. Он не должен напоминать традиционный перегруженный каталог автозапчастей, маркетплейс с десятками баннеров или игровой AI-продукт.

### Распределение визуального внимания

- 85% — тёплые нейтральные поверхности и текст;
- 10% — Radar Blue для действий, ссылок и активного поиска;
- 5% — семантические цвета состояний и типов предложений.

Не использовать декоративный цвет там, где смысл можно выразить типографикой, расстоянием или границей.

---

## 2. Бренд

### 2.1. Название

Точное написание:

```text
AutoRadar
```

- одно слово;
- латиница;
- заглавные `A` и `R`;
- не писать `AUTORADAR`, `Auto Radar`, `Autoradar` или `autoRadar`;
- не добавлять знак `™` в продуктовый интерфейс;
- в русском тексте название не склонять.

### 2.2. Логотип

Логотип MVP — **только текстовый wordmark `AutoRadar`**.

```text
Font: Inter
Weight: 600
Tracking: -0.035em
Color: foreground / white on dark surface
```

Размеры:

| Контекст               | Размер | Line-height |
| ---------------------- | -----: | ----------: |
| Mobile header          |   18px |        22px |
| Desktop sidebar/header |   20px |        24px |
| Auth/onboarding        |   24px |        28px |

Правила:

- wordmark всегда расположен горизонтально;
- не добавлять автомобиль, руль, шестерёнку, лупу, радарную дугу или молнию;
- не окрашивать отдельные буквы без отдельного решения владельца продукта;
- минимальная свободная зона вокруг wordmark — 50% высоты заглавной `A`;
- не растягивать и не использовать контурную версию;
- favicon/app icon не входит в текущий объём и не должен изобретаться автоматически.

---

## 3. Технологическая основа UI

### Обязательно

- Next.js App Router;
- React 19;
- Tailwind CSS 4;
- shadcn/ui с **Base UI** primitives;
- Inter через `next/font/google`;
- Lucide icons;
- Vercel AI SDK;
- shadcn AI chat components и AI Elements.

Для нового проекта Base UI является выбранной основой. Инициализация:

```bash
pnpm dlx shadcn@latest init -b base
```

В Base UI композиция выполняется через `render`, а не через устаревший `asChild`:

```tsx
<DialogTrigger render={<Button variant="outline" />}>Открыть</DialogTrigger>
```

### Chat layer

Для нового приложения использовать:

**shadcn/ui core chat components**

- `MessageScroller` — прокрутка, anchoring, auto-follow;
- `Message`;
- `Bubble`;
- `Attachment`;
- `Marker` и `shimmer` для потоковых состояний.

**AI Elements — только более высокоуровневые AI-паттерны**

- `PromptInput`;
- `Suggestion` / `Suggestions`;
- `Tool`;
- `Reasoning` — закрытый по умолчанию, если вообще показывается;
- `Sources` — только для информационных ответов, не как доказательство совместимости;
- attachment utilities при необходимости.

Не устанавливать одновременно две конкурирующие реализации одного слоя. Core messages/scrolling берутся из актуальных shadcn chat components; AI Elements используется для инструментов и специальных блоков.

### Базовый набор shadcn

```bash
pnpm dlx shadcn@latest add \
  button button-group card badge avatar separator skeleton spinner sonner \
  field input input-group textarea select native-select combobox command \
  tabs toggle-group tooltip dropdown-menu popover dialog drawer sheet \
  sidebar scroll-area progress empty item message message-scroller bubble \
  attachment marker

pnpm dlx shadcn@latest add \
  @ai-elements/prompt-input \
  @ai-elements/suggestion \
  @ai-elements/tool \
  @ai-elements/reasoning \
  @ai-elements/sources
```

Использовать только реально нужные части добавленных компонентов. Код shadcn находится в репозитории и должен адаптироваться под токены AutoRadar, а не оставаться в дефолтном стиле.

---

## 4. Цветовая система

### 4.1. Core neutrals

| Token                  | Hex                      | Назначение                          |
| ---------------------- | ------------------------ | ----------------------------------- |
| `canvas`               | `#FBFAF8`                | общий фон приложения, тёплая бумага |
| `surface`              | `#FFFFFF`                | основной чат, карточки, dialog      |
| `surface-subtle`       | `#F6F4F0`                | sidebar, вторичные панели           |
| `surface-muted`        | `#F0EDE8`                | hover, выбранные строки, chips      |
| `foreground`           | `#171717`                | заголовки, основной текст, wordmark |
| `foreground-secondary` | `#56534F`                | вторичный текст                     |
| `foreground-muted`     | `#7C7872`                | metadata, placeholder, helper copy  |
| `foreground-disabled`  | `#A8A39B`                | disabled text/icons                 |
| `border`               | `#E5E1DA`                | основной hairline border            |
| `border-strong`        | `#D4CFC6`                | inputs, выделенные границы          |
| `overlay`              | `rgba(17, 17, 17, 0.48)` | modal/drawer scrim                  |

### 4.2. Brand

| Token                   | Hex       | Назначение                      |
| ----------------------- | --------- | ------------------------------- |
| `radar-blue`            | `#0A84FF` | главный брендовый и action-цвет |
| `radar-blue-hover`      | `#0077E6` | hover primary action            |
| `radar-blue-active`     | `#0068CC` | pressed state                   |
| `radar-blue-soft`       | `#EAF4FF` | selected/active background      |
| `radar-blue-soft-hover` | `#DCEEFF` | hover на soft surface           |
| `radar-blue-border`     | `#B9DAFF` | border branded soft components  |
| `radar-blue-foreground` | `#075DAA` | текст на blue-soft              |

`Radar Blue` используется для:

- главной кнопки «Найти» / «Продолжить»;
- активной ссылки;
- focus ring;
- прогресса поиска;
- активного автомобиля или выбранного режима;
- verified exact-match indicator;
- небольших AI/tool call accents.

Не использовать его как большой фон страницы или всех карточек.

### 4.3. Supporting accents

| Token                | Hex       | Назначение                              |
| -------------------- | --------- | --------------------------------------- |
| `signal-violet`      | `#7664E8` | новый аналог, AI-assisted tag           |
| `signal-violet-soft` | `#F0EEFF` | фон violet badge                        |
| `signal-yellow`      | `#F2BE3E` | предупреждение, ожидание, б/у категория |
| `signal-yellow-soft` | `#FFF5D8` | фон warning/used badge                  |
| `signal-green`       | `#1A9B5B` | success, доступно, источник завершён    |
| `signal-green-soft`  | `#E9F8F0` | success surface                         |
| `signal-orange`      | `#D97706` | предупреждение о совместимости          |
| `signal-orange-soft` | `#FFF1E3` | warning surface                         |
| `signal-red`         | `#D63C4A` | ошибка, destructive action              |
| `signal-red-soft`    | `#FDECEE` | error surface                           |

### 4.4. Типы предложений

Цвет всегда сопровождается текстом и/или иконкой.

| Тип            | Badge background     | Text/icon               |
| -------------- | -------------------- | ----------------------- |
| Новый оригинал | `radar-blue-soft`    | `radar-blue-foreground` |
| Новый аналог   | `signal-violet-soft` | `#5949C7`               |
| Б/у оригинал   | `signal-yellow-soft` | `#8A6100`               |
| Не определено  | `surface-muted`      | `foreground-secondary`  |

### 4.5. Семантические состояния

| Состояние                         | Цвет         |
| --------------------------------- | ------------ |
| Success / найдено                 | green        |
| Running / активный поиск          | blue         |
| Waiting / queued                  | yellow       |
| Warning / проверить совместимость | orange       |
| Failed / ошибка                   | red          |
| Disabled / источник выключен      | neutral gray |

### 4.6. Правила цвета

- основной текст никогда не синий;
- цена обычно `foreground`, не green;
- зелёный означает статус, а не «дешёвая цена»;
- красный применяется только для ошибки/destructive;
- акцентные цвета не используются в больших декоративных градиентах;
- интерфейс не должен становиться разноцветным из-за большого числа badges;
- не использовать opacity ниже уровня, при котором текст проходит WCAG AA.

---

## 5. CSS theme tokens

Полная готовая версия находится в `DESIGN_TOKENS.css`. Семантические shadcn tokens должны ссылаться на AutoRadar palette:

```css
:root {
  --background: var(--ar-canvas);
  --foreground: var(--ar-foreground);
  --card: var(--ar-surface);
  --card-foreground: var(--ar-foreground);
  --popover: var(--ar-surface);
  --popover-foreground: var(--ar-foreground);
  --primary: var(--ar-brand);
  --primary-foreground: #ffffff;
  --secondary: var(--ar-surface-subtle);
  --secondary-foreground: var(--ar-foreground);
  --muted: var(--ar-surface-muted);
  --muted-foreground: var(--ar-foreground-muted);
  --accent: var(--ar-brand-soft);
  --accent-foreground: var(--ar-brand-foreground);
  --destructive: var(--ar-red);
  --border: var(--ar-border);
  --input: var(--ar-border-strong);
  --ring: var(--ar-brand);
}
```

MVP создаётся только в светлой теме. Не реализовывать dark mode, пока это не станет отдельной продуктовой задачей.

---

## 6. Типографика

### 6.1. Font family

```text
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Использовать Inter через `next/font/google`, variable font:

```tsx
import { Inter } from "next/font/google";

export const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});
```

Поддерживаемые веса:

- 400 — основной текст;
- 500 — labels, navigation, metadata emphasis;
- 600 — headings, buttons, wordmark;
- 700 — только цены и единичные сильные показатели.

### 6.2. Type scale

| Token     | Mobile | Desktop | Line height | Weight | Tracking | Назначение                |
| --------- | -----: | ------: | ----------: | -----: | -------: | ------------------------- |
| `display` |   36px |    48px |        1.04 |    600 | -0.045em | marketing/onboarding only |
| `h1`      |   28px |    32px |        1.15 |    600 | -0.035em | page title                |
| `h2`      |   23px |    26px |        1.22 |    600 | -0.025em | section/modal title       |
| `h3`      |   19px |    20px |         1.3 |    600 | -0.018em | card title                |
| `body-lg` |   17px |    18px |        1.55 |    400 |  -0.01em | welcome/chat emphasis     |
| `body`    |   16px |    16px |         1.5 |    400 | -0.008em | основной текст            |
| `body-sm` |   14px |    14px |        1.45 |    400 |        0 | cards/metadata            |
| `label`   |   13px |    13px |        1.35 |    500 |        0 | labels/badges             |
| `caption` |   12px |    12px |         1.4 |    400 |   0.01em | timestamps/helper         |
| `price`   |   20px |    22px |         1.1 |    700 | -0.025em | цена предложения          |

Правила:

- не использовать текст интерфейса меньше 12px;
- основной чат — 16px;
- длинные AI-ответы имеют максимальную ширину 720px;
- не использовать uppercase для целых labels;
- tabular numbers включать для цены, года, VIN-фрагментов и артикулов;
- OEM/VIN показывать с `font-variant-numeric: tabular-nums`, но не переводить весь UI в monospace.

---

## 7. Spacing system

Базовая единица — 4px.

| Token      | Value |
| ---------- | ----: |
| `space-0`  |     0 |
| `space-1`  |   4px |
| `space-2`  |   8px |
| `space-3`  |  12px |
| `space-4`  |  16px |
| `space-5`  |  20px |
| `space-6`  |  24px |
| `space-8`  |  32px |
| `space-10` |  40px |
| `space-12` |  48px |
| `space-16` |  64px |
| `space-20` |  80px |

Применение:

- icon + label: 8px;
- элементы внутри компактной карточки: 8–12px;
- card padding mobile: 16px;
- card padding desktop: 20px;
- chat message vertical gap: 20px;
- section gap mobile: 24–32px;
- section gap desktop: 40–48px;
- page horizontal padding mobile: 16px;
- mobile small screen ≤360px: 12px;
- desktop main padding: 24–32px.

Не использовать случайные значения `13px`, `18px`, `22px`, если это не типографика или расчёт безопасной зоны.

---

## 8. Shapes, borders and elevation

### 8.1. Radius

| Token         |  Value | Компоненты                         |
| ------------- | -----: | ---------------------------------- |
| `radius-xs`   |    6px | compact badge, code/OEM chip       |
| `radius-sm`   |    8px | icon button, small input           |
| `radius-md`   |   12px | buttons, fields, menu items        |
| `radius-lg`   |   16px | cards, chat composer               |
| `radius-xl`   |   20px | result summary, prominent panels   |
| `radius-2xl`  |   24px | full result panel, onboarding card |
| `radius-full` | 9999px | chips, avatar, status pill         |

Главный рабочий радиус — 12px. Карточки — 16px. Не смешивать 8, 10, 12 и 14px в одной группе.

### 8.2. Borders

- стандарт: `1px solid var(--ar-border)`;
- strong/input: `1px solid var(--ar-border-strong)`;
- selected: `1px solid var(--ar-brand-border)`;
- focus: `0 0 0 3px rgba(10,132,255,.22)`;
- inset hairline допустим для карточек, но не вместе с тяжёлой тенью.

### 8.3. Shadows

Система преимущественно плоская.

| Token       | Value                            | Назначение             |
| ----------- | -------------------------------- | ---------------------- |
| `shadow-xs` | `0 1px 2px rgba(23,23,23,.04)`   | input/card subtle      |
| `shadow-sm` | `0 4px 14px rgba(23,23,23,.06)`  | floating composer/menu |
| `shadow-md` | `0 18px 48px rgba(23,23,23,.12)` | desktop results dialog |

Не использовать heavy shadows на каждой карточке. Основной способ отделения поверхности — тон, border и spacing.

---

## 9. Iconography

- библиотека: Lucide;
- stroke: 1.75px по умолчанию;
- размеры: 16, 18, 20, 24px;
- toolbar: 18px;
- primary action: 18px;
- empty state: максимум 32px;
- иконка всегда сопровождается label или accessible name;
- не использовать заполненные разноцветные иконки;
- логотипы сайтов-продавцов показывать только при наличии разрешённого/корректного asset, иначе использовать текстовое имя источника.

---

## 10. Motion

| Token         |                      Value |
| ------------- | -------------------------: |
| `motion-fast` |                      120ms |
| `motion-base` |                      180ms |
| `motion-slow` |                      240ms |
| easing        | `cubic-bezier(.2,.8,.2,1)` |

Использование:

- hover/focus: 120ms;
- menu/popover: 180ms;
- drawer/dialog: 240ms;
- появление частичного результата: opacity + translateY 4px, 180ms;
- progress/shimmer допускается только во время реального ожидания.

Учитывать `prefers-reduced-motion`: отключать shimmer, transform и инерционные декоративные анимации.

---

## 11. Responsive foundation

### Breakpoints

| Name    |        Width |
| ------- | -----------: |
| mobile  |    `< 768px` |
| tablet  | `768–1023px` |
| desktop |   `≥ 1024px` |
| wide    |   `≥ 1280px` |

Компоненты проектируются сначала для 360–430px. Desktop — расширение мобильной логики, а не отдельный продукт.

### Safe areas

На iOS учитывать:

```css
padding-bottom: max(12px, env(safe-area-inset-bottom));
```

Для Base UI Drawer добавить:

```css
body {
  position: relative;
}
```

Это требуется для корректного overlay на прокрученном iOS Safari.

---

## 12. Application shell

### 12.1. Desktop

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar 272px │                Main                          │
│               │                                              │
│ AutoRadar     │     centered chat column 760–820px           │
│ New search    │                                              │
│ Conversations │     messages / structured blocks             │
│ Garage        │                                              │
│               │     sticky composer                          │
│ Account       │                                              │
└──────────────────────────────────────────────────────────────┘
```

- sidebar background: `surface-subtle`;
- sidebar border-right: `border`;
- width: 272px, collapsible to 72px;
- main background: `surface`;
- chat column max-width: 820px;
- structured results may expand to 1040px inside dialog;
- main content never прижимается к краям viewport.

### 12.2. Mobile

```text
┌────────────────────────────┐
│ Menu  Active car     User  │ 56px
├────────────────────────────┤
│                            │
│ Chat / cards               │
│                            │
│                            │
├────────────────────────────┤
│ sticky PromptInput         │
└────────────────────────────┘
```

- app header: 56px;
- active vehicle appears as compact chip or centered selector;
- conversation fills available height;
- composer sticky, not fixed over content without reserved space;
- sidebar becomes Base UI `Drawer` from left;
- detailed search results become full-screen `Drawer`/page layer;
- mobile back gesture and visible close button must work;
- no horizontal table scrolling in primary flow: use cards.

---

## 13. Pages

### 13.1. `/chat`

Основной экран.

#### Empty state

- wordmark in header, not duplicated as giant logo;
- heading: «Что нужно найти?»;
- helper text: один короткий абзац;
- 3–4 suggestion chips:
  - «Найти по номеру детали»;
  - «Подобрать для моей машины»;
  - «Добавить автомобиль по VIN»;
  - пример естественного запроса;
- PromptInput находится в нижней части доступной зоны и затем становится sticky.

#### Active conversation

- assistant responses are mostly borderless text blocks;
- user message uses warm neutral bubble;
- structured data is shown in cards;
- vehicle context always visible in top bar;
- AI asks one high-value clarification at a time;
- buttons/suggestions appear immediately beneath relevant assistant message.

### 13.2. `/garage`

- page title + primary button «Добавить автомобиль»;
- cards vehicles in one column mobile, two columns desktop;
- active vehicle visually indicated blue-soft background + check;
- VIN masked in list: `VF3••••••••1234`;
- actions через Dropdown Menu;
- edit opens responsive Dialog/Drawer;
- empty state offers VIN or manual form.

### 13.3. `/search/[id]`

- deep-linkable and restorable search result;
- same content as results overlay;
- progress remains visible while sources complete;
- filters remain sticky under header;
- mobile uses cards; desktop may use compact list/table hybrid;
- external source opens in a new tab.

### 13.4. Auth

- минимальная centered card;
- wordmark;
- no marketing illustration;
- social/email actions if implemented;
- registration is not shown before the first search unless user wants garage/history.

---

## 14. Chat UI specification

### 14.1. Message layout

#### Assistant

- no colored avatar required;
- no persistent bubble for ordinary prose;
- max width 720px;
- text `body`;
- structured cards may span full chat column;
- source/tool metadata visually secondary.

#### User

- background: `surface-muted`;
- border: optional hairline;
- radius: 16px 16px 4px 16px;
- max width: 82% mobile, 72% desktop;
- padding: 10px 14px;
- aligned right.

### 14.2. PromptInput

- based on AI Elements `PromptInput`, restyled;
- background: white;
- border: `border-strong`;
- radius: 18px;
- shadow: `shadow-sm`;
- min height: 52px collapsed;
- textarea auto-grow: max 160px mobile / 220px desktop;
- submit button: 36×36px blue circle/squircle;
- microphone: secondary icon button;
- attachment button is hidden until feature exists;
- keyboard shortcut shown only desktop;
- Enter sends, Shift+Enter newline;
- while AI is responding, submit becomes stop action.

### 14.3. Suggestions

- use AI Elements `Suggestions` as horizontally wrapping chips;
- radius full;
- border hairline;
- white or surface-subtle background;
- selected uses blue-soft;
- minimum height 36px;
- never show more than four primary options at once;
- always allow free text.

### 14.4. Vehicle context bar

Desktop:

```text
[Peugeot icon] Peugeot 308 · 2008 · 1.6 · 3 двери    [Сменить]
```

Mobile:

```text
[Peugeot 308 · 2008 ▾]
```

Specs:

- height: 40px compact / 48px expanded;
- neutral surface by default;
- blue-soft when active in a search;
- incomplete vehicle gets amber dot + «Нужно уточнить»;
- full VIN never shown in bar.

### 14.5. Extracted request card

AI must show what it understood before expensive search when confidence is insufficient.

Fields:

- автомобиль;
- деталь;
- положение;
- сторона;
- OEM/VIN if provided;
- desired condition.

Each field:

- label 12–13px muted;
- value 14–16px medium;
- edit icon button;
- unknown field displays «Не указано», not invented value.

Primary action: «Искать».  
Secondary: «Изменить».

### 14.6. Search progress card

- background white;
- border hairline;
- radius 16px;
- progress bar blue;
- list of sources collapsible on mobile;
- each source row shows status icon, name and found count;
- errors use human language;
- no technical stack traces;
- partial results button appears immediately after first offers.

Source statuses:

- queued — neutral dot;
- searching — blue spinner/shimmer;
- completed — green check;
- empty — neutral minus;
- timeout — amber clock;
- failed — red warning;
- disabled — muted.

### 14.7. Result summary card

Three compact sections:

- Новый оригинал;
- Новый аналог;
- Б/у оригинал.

Each section:

- semantic badge;
- number of offers;
- minimum price;
- primary delivery/availability summary;
- chevron/open action.

On mobile sections stack. On desktop they may form three equal columns.

---

## 15. Search results experience

### 15.1. Responsive container

Use one responsive component:

- `<768px`: Base UI Drawer, full-height, swipe direction down only for closing;
- `≥768px`: Dialog, width `min(1120px, calc(100vw - 48px))`, height up to `calc(100vh - 48px)`;
- preserve chat state and scroll;
- URL may update to `/search/[id]` without full navigation;
- closing returns focus to the button that opened results.

### 15.2. Header

- title: normalized part name;
- vehicle subtitle;
- result count and refreshed time;
- close button always visible;
- `Обновить` is secondary and rate-limited;
- mobile header sticky.

### 15.3. Filters

Initial filters:

- Все;
- Новый оригинал;
- Новый аналог;
- Б/у;
- В наличии;
- Город;
- цена.

Use Tabs for the main four categories and Popover/Drawer filters for secondary criteria. Do not render a desktop-style left filter rail on mobile.

### 15.4. Offer card

Order of information:

1. classification badge;
2. brand and normalized title;
3. price;
4. part/OEM number;
5. availability/delivery/location;
6. seller/source;
7. compatibility note;
8. external CTA.

#### Mobile

- one-column card;
- padding 16px;
- price visible without scrolling;
- CTA full-width or strongly visible;
- card image optional and small; absence must not break layout.

#### Desktop

- compact horizontal row/card;
- left: title/number;
- middle: availability/seller;
- right: price + CTA;
- no dense legacy HTML table by default.

External CTA:

- label: «На сайт продавца»;
- external-link icon;
- primary blue only for best/recommended exact match; others may use outline to avoid ten blue buttons on screen;
- never hide actual source domain/name.

### 15.5. Compatibility warning

If compatibility is not verified:

- orange-soft surface;
- icon `TriangleAlert`;
- text:

> Совместимость не подтверждена каталогом. Перед покупкой проверьте деталь по VIN у продавца.

Do not use a blocking modal.

---

## 16. Components

### 16.1. Button

Base radius: 12px. Height includes touch target.

| Size   |  Height | Padding |      Text |
| ------ | ------: | ------: | --------: |
| `sm`   |    36px |    12px |  13px/600 |
| `md`   |    40px |    16px |  14px/600 |
| `lg`   |    48px |    20px |  15px/600 |
| `icon` | 40×40px |       — | 18px icon |

Variants:

#### Primary

- blue background;
- white text;
- hover blue-hover;
- active blue-active;
- focus blue ring;
- disabled 45% opacity, no pointer events.

#### Secondary

- surface-subtle;
- foreground;
- border transparent;
- hover surface-muted.

#### Outline

- white background;
- border;
- hover surface-subtle;

#### Ghost

- transparent;
- hover surface-muted;
- used for toolbar/navigation only.

#### Destructive

- red background;
- white text;
- only destructive confirmation.

#### Link

- blue text;
- no background;
- underline on hover/focus.

Loading state preserves width and uses Spinner. Do not replace label with three bouncing dots.

### 16.2. Input / Textarea

- height 44px;
- radius 12px;
- white background;
- 1px border-strong;
- placeholder muted;
- focus blue ring;
- error red border + visible error text;
- disabled muted background;
- labels use shadcn `Field` components;
- no floating labels.

VIN/OEM inputs:

- uppercase transformation only visually or during normalization;
- tabular numerals;
- paste preserved;
- clear button optional;
- validation does not erase original input.

### 16.3. Select / Combobox

Use:

- Native Select for short, stable mobile lists when appropriate;
- Combobox for make/model/generation/engine;
- Command for searchable large lists;
- items minimum 44px high;
- selected item includes check;
- no nested modal inside Drawer unless focus behavior is tested.

### 16.4. Badge

- height 24–28px;
- radius full;
- 12–13px/500;
- no all-caps;
- semantic variants from color system;
- outline badge for source names;
- maximum two badges in offer-card title row; overflow moves to metadata.

### 16.5. Card

Base:

- white;
- 1px border;
- 16px radius;
- no shadow by default;
- hover shadow only if card is clickable;
- padding 16px mobile / 20px desktop.

Clickable card must also have keyboard focus and explicit accessible role/link.

### 16.6. Tooltip

- dark foreground background;
- white text;
- 12px;
- radius 8px;
- desktop pointer only;
- never place critical information only in Tooltip.

### 16.7. Toast

Use Sonner:

- success: saved garage vehicle;
- error: action failed;
- external transition not required;
- search progress is never communicated only by toast;
- maximum one visible routine toast stack.

### 16.8. Empty state

- simple monochrome icon;
- heading 18–20px;
- body 14–16px;
- one primary and optional secondary action;
- no stock illustration;
- optional tiny blue accent line/dot, not a gradient hero.

### 16.9. Skeleton

Skeleton must mirror final component shape. Use neutral warm gray. Avoid full-page shimmer longer than necessary. Search progress should use real statuses as soon as available.

---

## 17. Navigation

### Desktop sidebar

- use shadcn Sidebar;
- wordmark at top;
- primary `Новый поиск` action;
- groups: conversations, garage;
- conversation rows have one-line title + optional muted preview;
- active row uses surface-muted, not a strong blue block;
- icons 18px;
- account menu at bottom;
- sidebar supports keyboard shortcut and collapse.

### Mobile navigation

- menu button opens Drawer;
- recent conversations and garage inside same drawer;
- wordmark in drawer header;
- drawer width `min(88vw, 340px)`;
- overlay required;
- selected vehicle can be changed without opening full garage.

---

## 18. Voice input

MVP visual behavior:

- microphone button in PromptInput;
- idle: neutral icon;
- listening: blue-soft surface + blue icon + timer/label;
- processing: spinner and «Распознаю…»;
- transcript is placed into editable textarea before send unless user enables auto-send later;
- recording state must have an obvious stop button;
- no cinematic waveform required for MVP;
- never rely on color alone to indicate recording.

---

## 19. Accessibility

- WCAG 2.2 AA target;
- touch targets at least 44×44px;
- visible focus on every interactive element;
- keyboard navigation in Dialog, Drawer, Menu, Combobox and Sidebar;
- `aria-live="polite"` for search progress and new partial results;
- loading indicators have text alternatives;
- focus returns to trigger after overlays close;
- no critical status represented only by color;
- error copy is adjacent to field;
- animated content respects reduced motion;
- mobile zoom must not be disabled;
- input font size minimum 16px on mobile to prevent iOS zoom.

Base UI primitives already provide accessibility foundations, but Codex must test final composition, labels, portals and focus order.

---

## 20. Content style

Основной язык MVP — русский.

Тон:

- спокойный;
- компетентный;
- короткий;
- без чрезмерной уверенности;
- без канцелярита;
- без автомобильного жаргона, если пользователь его не использует.

Предпочтительно:

- «Нашёл 18 предложений»;
- «Уточните сторону»;
- «Проверить совместимость у продавца»;
- «Источник не ответил, остальные результаты доступны».

Не использовать:

- «Идеально подходит» без подтверждения;
- «100% совместимо»;
- «Мы нашли лучший товар» без прозрачных критериев;
- технические слова `scraper`, `adapter timeout`, `job failed` в пользовательском UI.

---

## 21. Design rules for Codex

### Обязательно

- использовать только semantic tokens;
- не писать hex напрямую в компонентах;
- использовать `cn()` и variants, а не копировать длинные className между файлами;
- адаптировать shadcn code в `packages/ui`;
- использовать Base UI versions;
- использовать `render` composition;
- применять `data-slot` и `data-*` states для styling;
- mobile layout проверять при 360, 390 и 430px;
- desktop проверять при 1024, 1280 и 1440px;
- сохранять состояние чата при открытии results overlay;
- все loading/empty/error/partial states реализовывать до отметки feature done.

### Запрещено

- создавать новый цвет без добавления token;
- добавлять градиенты в основной продуктовый интерфейс;
- использовать blur/glassmorphism как основной surface style;
- использовать heavy shadow на каждой карточке;
- делать все кнопки pill;
- смешивать Radix и Base UI реализации одного компонента;
- использовать `asChild` в новой Base UI реализации;
- строить mobile results как широкую таблицу;
- придумывать визуальный логотип или mascot;
- добавлять dark mode в MVP;
- копировать брендовый UI ChatGPT/xAI/Superwhisper один в один.

---

## 22. Component ownership

```text
packages/ui/
├── components/ui/            # shadcn/Base UI primitives, themed
├── components/ai/            # adapted shadcn chat + AI Elements
├── components/brand/         # AutoRadarWordmark only
├── components/chat/          # product compositions
├── components/garage/        # product compositions
├── components/search/        # product compositions
├── styles/design-tokens.css
└── lib/variants.ts
```

Primitive components may be edited. Product-specific components must not be placed inside `components/ui`.

---

## 23. Recommended product compositions

| Product component      | Building blocks                          |
| ---------------------- | ---------------------------------------- |
| `AutoRadarWordmark`    | text + Inter                             |
| `AppSidebar`           | Sidebar, ScrollArea, DropdownMenu        |
| `MobileNavigation`     | Drawer, Button, Separator                |
| `VehicleContextBar`    | Button, Badge, Popover/Drawer            |
| `ChatThread`           | MessageScroller, Message, Bubble, Marker |
| `ChatComposer`         | AI Elements PromptInput, Button, Tooltip |
| `ClarificationCard`    | Card, Suggestions, ButtonGroup           |
| `ExtractedRequestCard` | Card, Item, Badge, Button                |
| `SearchProgressCard`   | Card, Progress, Collapsible, Spinner     |
| `SearchResultSummary`  | Card, Tabs, Badge                        |
| `SearchResultsOverlay` | responsive Dialog/Drawer                 |
| `OfferCard`            | Card/Item, Badge, Button, Separator      |
| `CompatibilityWarning` | Alert-style composition                  |
| `VehicleEditor`        | Field, Combobox, Input, Select           |
| `GarageCard`           | Card, Badge, DropdownMenu                |

---

## 24. QA checklist

Перед merge UI-задачи проверить:

- [ ] используется Inter;
- [ ] wordmark написан `AutoRadar`;
- [ ] нет hardcoded non-token colors;
- [ ] Base UI component selected;
- [ ] mobile-first at 360px;
- [ ] touch targets ≥44px;
- [ ] keyboard focus visible;
- [ ] loading state;
- [ ] empty state;
- [ ] error state;
- [ ] partial search state;
- [ ] long Russian text does not overflow;
- [ ] long OEM/VIN wraps or truncates safely with copy action;
- [ ] price aligns using tabular numbers;
- [ ] results overlay preserves chat;
- [ ] no horizontal page scroll;
- [ ] full VIN absent from logs and ordinary list UI;
- [ ] source is visible before external transition;
- [ ] reduced motion supported.

---

## 25. Reference synthesis

Использованные референсы:

- ChatGPT — compact chat shell, white conversation surface, restrained grayscale and hairline separation;
- xAI — warm cream surfaces, confident near-black ink, generous but controlled hierarchy;
- Family — warm paper background, inset borders, friendly accent semantics and Inter utility typography;
- Superwhisper — Inter throughout, precise electric blue and restrained accent palette.

AutoRadar intentionally не перенимает:

- полностью ахроматический интерфейс ChatGPT;
- крупную маркетинговую типографику xAI;
- мультяшные иллюстрации Family;
- тёмный cinematic/aurora интерфейс Superwhisper.

### Official implementation references

- shadcn/ui Base UI default and changelog: `https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default`
- shadcn chat components: `https://ui.shadcn.com/docs/changelog/2026-06-chat-components`
- shadcn components: `https://ui.shadcn.com/docs/components`
- shadcn CLI: `https://ui.shadcn.com/docs/cli`
- Base UI quick start: `https://base-ui.com/react/overview/quick-start`
- Base UI accessibility: `https://base-ui.com/react/overview/accessibility`
- AI Elements: `https://elements.ai-sdk.dev/docs`
- AI Elements setup: `https://elements.ai-sdk.dev/docs/setup`
