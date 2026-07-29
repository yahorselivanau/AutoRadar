# Design reference synthesis

Проверено 29 июля 2026 по 28 desktop/mobile референсам пользователя.
`DESIGN_SYSTEM.md` остаётся источником правил; этот файл хранит только
обоснование, чтобы не раздувать основную дизайн-систему.

| Референсная группа | Берём                                                                                                            | Не берём                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ChatGPT / xAI      | узкая prose-колонка, quiet chrome, плавающий composer, right activity panel → mobile sheet, сохранение контекста | чужую IA sidebar, чёрный продуктовый CTA, показ приватного reasoning                |
| Nolla              | мягкие крупные поверхности, filled inputs, drawer/sheet на mobile, один следующий шаг                            | lifestyle-фон, medical copy, phone-first auth до первой пользы                      |
| Daydream           | conversational refinement, chips, визуальные product cards, detail overlay                                       | serif как основной шрифт, fashion-риторику, пустые карточки без рабочих данных      |
| Idealo             | приоритет цены, наличия, продавца и фильтров                                                                     | постоянный filter rail на mobile, синюю каталожную плотность, четыре тесные колонки |

Итог для AutoRadar:

1. чат собирает и уточняет запрос;
2. активность объясняет безопасные этапы федеративного поиска;
3. выдача становится рабочим сравнением, а не продолжением длинного текста;
4. desktop использует sidebar/right panel, mobile — drawer/bottom sheet;
5. Radar Blue остаётся единственным сильным продуктовым акцентом;
6. данные источника важнее декоративной классификации.

Полезные инженерные детали:

- концентрические радиусы для вложенных поверхностей;
- layered shadow-ring вместо жёсткой рамки на плавающих элементах;
- pure-black 10% inset outline на product images;
- tabular numerals для цены, таймеров, года, OEM/VIN;
- 44px touch target и 40px dense desktop target;
- interruptible transitions, `scale(0.96)` on press, no `transition: all`;
- balanced headings, pretty short body copy, root font smoothing.
