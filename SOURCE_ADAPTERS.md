# SOURCE_ADAPTERS

Дата публичного исследования: 28 июля 2026.

## 1. Приоритетная матрица

| Источник                      | Тип                       | Публичные возможности, найденные при исследовании                                        | Приоритет MVP | Комментарий                                                                                               |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- | ------------: | --------------------------------------------------------------------------------------------------------- |
| `armtek.by`                   | новые оригиналы и аналоги | поиск по VIN, номеру и автомобилю; официальный web-service доступен после договора       |            P0 | Для MVP исследовать публичный розничный поиск; конечная цель — официальный договор/API.                   |
| `remzona.by`                  | новые детали              | публичный XHR разрешает категорию; SSR-каталог возвращает карточки, цены и наличие       |            P0 | HTTP + Cheerio основной режим; Playwright только opt-in fallback/discovery, без proxy.                    |
| `zap.by`                      | новые детали              | SSR-каталог по марке/модели; цены, наличие и сроки без логина                            |            P0 | HTTP + Cheerio; `/search` временно включён только для закрытого MVP, VIN и query/XHR picker отключены.    |
| `motorland.by`                | б/у детали                | robots-разрешённый SSR-текстовый поиск; цены, фото и характеристики без логина           |            P0 | HTTP + Cheerio; первый источник б/у, без cookies/Playwright/proxy, совместимость только `possible`.       |
| `auto1.by`                    | новые детали              | robots-разрешённая GET-форма `/Search`; SSR-карточки и BYN schema.org microdata           |            P0 | HTTP + Cheerio; подключён офлайн по файлам владельца, fixture-tested до opt-in live smoke.                |
| `av-parts.by`                 | агрегатор новых деталей   | поиск по артикулу/названию, каталог и предложения зарегистрированных магазинов           |         P0/P1 | Возможны дубли поставщиков и конкуренция с самим продуктом. Не терять исходного продавца, если он указан. |
| `uparts.by`                   | новые детали              | публично заявлены поиск по артикулу, OEM, названию, автомобилю и VIN; есть гараж         |            P1 | Сильный кандидат вместо технически недоступного P0-источника.                                             |
| `1000km.by`                   | новые детали              | строка поиска по артикулу, детали или VIN; выбор автомобиля                              |            P1 | Проверить качество выдачи и доступность цены без регистрации.                                             |
| `1ak-auto.by`                 | новые детали              | поиск по автомобилю, номеру и VIN; кузов, двигатель, модификация                         |            P1 | Хороший кандидат для vehicle-based сценария.                                                              |
| `belautoparts.by`             | новые детали              | заявлен каталог, поиск по номеру/VIN, аналоги, цены и сроки                              |            P1 | Проверить реальную публичную выдачу.                                                                      |
| `pro-auto.by`                 | новые детали              | поиск по коду детали или VIN, каталог                                                    |            P2 | Проверить покрытие Беларуси и доступность карточек.                                                       |
| `shate-mag.by` / `shate-m.by` | новые детали              | официальный розничный подбор, большой ассортимент; основной сайт указывает retail-сервис |            P2 | Проверить домен магазина и необходимость регистрации.                                                     |

Дополнительные кандидаты:

- `avtoparts.by`
- `megaservice.by`
- `mgbox.by`
- `ilan.by`
- `etc.by`
- `autozap.by`

## 2. Рекомендуемый набор первого релиза

Не пытаться одновременно стабилизировать десять адаптеров.

### Release gate

- Remzona;
- ещё два источника новых деталей, выбранных после discovery;
- четвёртый источник как beta.

Предварительный порядок исследования:

1. Remzona.
2. AV-parts.
3. uParts.
4. ARMTEK.
5. 1000km.
6. 1ak-auto.
7. Belautoparts.
8. Pro-auto.
9. Shate retail.

## 3. Что подтверждено публичными страницами

### ARMTEK

Публичный сайт заявляет:

- подбор по VIN;
- поиск по номеру;
- подбор по марке/модели;
- оригиналы и аналоги.

Официальная оптовая страница сообщает, что прайс-лист и web-services доступны после заключения договора. Значит scraper является только временным MVP-адаптером.

### AV-parts

Сайт прямо называет себя агрегатором и показывает каталог с миллионами позиций. Результат может уже объединять предложения магазинов. Необходимо:

- сохранять `source = av-parts`;
- сохранять фактического продавца, если он виден;
- не выдавать одинакового продавца дважды, если он также подключён напрямую;
- не заявлять, что AV-parts является отдельным складом.

### Remzona

Публичный JavaScript выполняет `POST /` с `typerequest=search` и `q`. Ответ
содержит server-rendered карточки бренда, артикула, названия и исходной ссылки.
Маршрут `/search` запрещён в `robots.txt` и адаптер его не вызывает. Полное
доказательство, fixtures и ограничения находятся в
`actors/search/src/adapters/remzona/DISCOVERY.md`.

### Zap.by

Path-based страницы `/carparts/...` возвращают SSR-карточки с брендом,
артикулом, BYN-ценой, наличием, сроком и исходной ссылкой. Адаптер разрешает
реальные ID поколения/двигателя через picker, обогащает кандидатов
характеристиками и применяемостью карточек, затем детерминированно проверяет
сторону, положение, число дверей и остальные структурированные ограничения.
Конфликтующие предложения удаляются; нехватка критичного признака вызывает
структурированный вопрос пользователю. `/*search` запрещён в `robots.txt`, но владелец
проекта временно разрешил этот маршрут для закрытого MVP через
`ZAP_EXPERIMENTAL_SEARCH_ENABLED`; перед публичным production флаг нужно
выключить и перейти на официальный фид. VIN не вызывается.
Полное доказательство и ограничения:
`actors/search/src/adapters/zap/DISCOVERY.md`.

Проверка сохранённой страницы BMW 3 F30 показала, что Zap.by может навязать
карточкам название текущей категории: фильтры/поддоны АКПП были подписаны как
«Масляный насос». Адаптер поэтому сверяет product `h1`, сохраняет ID категории
и модификации и использует общую категорию как fallback к точной
engine-странице. Запрещённые live-robots query XHR не вызываются.

### Motorland.by

`GET /auto-parts/?Filter.TextSearch=...` возвращает SSR-карточки с внутренним
артикулом, названием, брендом, BYN-ценой, фото и характеристиками. Robots.txt
явно разрешает `Filter.TextSearch`; логин, cookies, proxy и браузер не нужны.
Каталог и публичная оферта прямо описывают автозапчасти как б/у. OEM и VIN не
подтверждены. Полное доказательство и ограничения:
`actors/search/src/adapters/motorland/DISCOVERY.md`.

### Auto1.by

Предоставленные владельцем HTML, JavaScript и свежий `robots.txt` подтверждают
публичную GET-форму `/Search?pattern=...`, SSR-шаблон `.catalog-list-card`,
BYN-цену, `NewCondition`, наличие, продавца и исходную ссылку в schema.org
microdata. Адаптер использует только HTTP + Cheerio, первую страницу и не
вызывает найденные autocomplete/AJAX endpoints. VIN, применяемость и
original/analog не заявляются. Поскольку по прямой инструкции сайт не
запрашивался, live search и реальный empty state ещё не проверены. Полный
отчёт: `actors/search/src/adapters/auto1/DISCOVERY.md`.

## 4. Обязательный отчёт по каждому источнику

```md
# <SOURCE> discovery

Checked at:
Researcher:

## Access

- Public without login:
- robots.txt:
- Terms:
- CAPTCHA:
- Rate-limit observations:
- Proxy required:
- Proxy region:
- TLS/CA requirements:

## Search modes

- OEM:
- VIN:
- Vehicle:
- Text:

## Network

- Server-rendered HTML:
- Form method/action:
- XHR/fetch:
- Session/cookies:

## Chosen implementation

- Mode:
- Reason:
- Timeout:
- Pagination:
- Result limit:

## Data mapping

- external id:
- title:
- brand:
- part number:
- condition:
- original/analog:
- price:
- availability:
- seller:
- location:
- URL:

## Fixtures

- success:
- empty:
- error:
```

## 5. Общие ограничения

- Не обходить CAPTCHA, авторизацию, paywall и явно запрещённый доступ.
- Не маскировать автоматический трафик под пользователя.
- Не использовать чужие аккаунты.
- Не отключать TLS verification.
- Не загружать весь каталог: только живой поиск пользователя.
- Уважать rate limits и feature flag каждого источника.

## 6. Публичные источники исследования

- https://remzona.by/
- https://remzona.by/robots.txt
- https://zap.by/
- https://zap.by/robots.txt
- https://zap.by/publichnaja-oferta
- https://motorland.by/
- https://motorland.by/robots.txt
- https://motorland.by/pokupatelyam/publichnaya-oferta/
- https://auto1.by/
- https://auto1.by/robots.txt
- https://armtek.by/
- https://armtek.by/catalog/identification-auto
- https://armtek.by/wholesale
- https://av-parts.by/
- https://av-parts.by/catalog
- https://uparts.by/
- https://1000km.by/
- https://1ak-auto.by/
- https://belautoparts.by/
- https://pro-auto.by/
- https://shate-m.by/
- https://megaservice.by/shop/
- https://avtoparts.by/
