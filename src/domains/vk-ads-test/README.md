# VK Ads Test Domain

## 1. Что это

`vk-ads-test` — новый изолированный домен для быстрого MVP-контура VK Ads tests.

Цель домена:
- создавать и хранить собственные тесты, аудитории, креативы, варианты и их статистику;
- работать с VK Ads API как с отдельной системой поверх CRM account ownership;
- не вмешиваться в legacy VK Ads statistics contour.

Почему домен изолирован:
- legacy `crm/nest/src/domains/vk-ads/*` уже завязан на текущий statistics flow;
- новый контур не должен делить с ним state, runtime-объекты, tracking и storage;
- новый контур проектируется как отдельная система внутри одного домена.

## 2. Boundary / ограничения

Запрещено:
- использовать `crm/nest/src/domains/vk-ads/*` как runtime dependency;
- использовать `VkAdsDailyStat`;
- использовать `refs / utm / Deal.adTag linkage`;
- переиспользовать существующие боевые `ad_plans / ad_groups / banners`;
- менять текущий callback / CRM flow.

Разрешено:
- читать legacy-код только как read-only reference;
- использовать только общую инфраструктуру проекта: Nest, Prisma, `CrmAccount`;
- создавать, обновлять и удалять только новые runtime-объекты нового контура.

Практический инвариант:
- всё, что создаёт новый контур в VK Ads, должно принадлежать только новому контуру;
- новый код живёт только внутри `crm/nest/src/domains/vk-ads-test/`.

Подробный boundary-файл:
- [README.boundary.md](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/README.boundary.md)

## 3. Ownership model

Текущий контракт ownership:
- `accountId` — primary owner нового контура;
- `projectId` — только optional business context;
- `integrationId` — отдельный auth/runtime context.

Почему owner не `Project`:
- `Project` не нужен для выбора auth context;
- в домене уже зафиксирован account-centric подход;
- `projectId` оставлен только как дополнительный контекст для будущей бизнес-логики, фильтрации и отчётности;
- relation-level зависимости `VkAdsTest -> Project` нет.

Практический смысл:
- тест принадлежит CRM account;
- integration выбирается отдельно;
- project не участвует в маршрутизации во внешний VK Ads API.

## 4. Что уже реализовано

Структура домена:
- [vk-ads-test.module.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/vk-ads-test.module.ts)
- [vk-ads-test.repository.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/repositories/vk-ads-test.repository.ts)
- [README.boundary.md](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/README.boundary.md)
- этот `README.md`

Уже есть:
- отдельный Nest module;
- отдельный Prisma-backed repository;
- отдельные Prisma-модели нового контура;
- отдельная integration model для VK Ads auth/runtime foundation;
- standalone client [vk-ads-test.client.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/clients/vk-ads-test.client.ts);
- auth resolver [vk-ads-test-auth.service.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/services/vk-ads-test-auth.service.ts);
- минимальный one-variant builder [vk-ads-test-builder.service.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/services/vk-ads-test-builder.service.ts);
- smoke script [vk-ads-test-smoke.ts](/Users/mac/code/EASY-CRM/crm/nest/src/scripts/vk-ads-test-smoke.ts) для controlled проверки нового client на одном конкретном integration.

## 5. Модели домена

### `VkAdsAccountIntegration`

Foundation-модель для будущего VK Ads auth/runtime context.

Назначение:
- привязать VK Ads integration к CRM account;
- хранить базовый конфиг integration, не смешивая его с callback/group semantics;
- быть точкой входа для будущего VK Ads client.

Текущее содержимое:
- `accountId`
- `isActive`
- `baseUrl`
- `tokenEnvKey`
- `vkAdsAccountId`
- `vkAdsCabinetId`
- `defaultPackageId`

Важно:
- это runtime foundation-модель нового контура;
- auth context уже резолвится через `tokenEnvKey -> process.env[...]`;
- `defaultPackageId` не используется smoke script как selection fallback для текущего MVP-сценария.

### `VkAdsTest`

Корневая сущность теста.

Назначение:
- хранить параметры теста верхнего уровня;
- связывать тест с owner (`accountId`), business context (`projectId`) и integration (`integrationId`).

### `VkAdsTestAudience`

Сегмент аудитории внутри теста.

Назначение:
- хранить таргетинг/гео/возраст/интересы/поисковый лист;
- быть источником для будущего VK Ads ad group build.

### `VkAdsTestCreative`

Креатив внутри теста.

Назначение:
- хранить текстовые и content-ссылки для будущего banner build;
- быть отдельной осью вариативности.

### `VkAdsTestVariant`

Комбинация audience + creative.

Назначение:
- быть основной runtime-единицей запуска;
- хранить внешние VK ids (`vkCampaignId`, `vkAdGroupId`, `vkBannerId`, `vkPrimaryUrlId`);
- быть основной единицей для статс-сбора и action log.

### `VkAdsTestDailyStat`

Отдельная daily stat таблица нового контура.

Назначение:
- хранить метрики варианта по дням;
- не зависеть от legacy `VkAdsDailyStat`;
- быть самостоятельным storage для Phase 3+.

### `VkAdsTestActionLog`

История действий над тестом/вариантом.

Назначение:
- фиксировать lifecycle и системные действия;
- быть основой для audit/debug.

## 6. Текущее состояние Prisma-схемы

Текущее состояние:
- `VkAdsTest.accountId` — optional relation на `CrmAccount`;
- `VkAdsTest.projectId` — scalar only, без relation к `Project`;
- `VkAdsTest.integrationId` — optional relation на `VkAdsAccountIntegration`;
- `VkAdsAccountIntegration.accountId` — обязательная relation на `CrmAccount`;
- один `accountId` сейчас может иметь несколько integrations.

Практический смысл:
- owner теста = account;
- integration = отдельный runtime/auth context;
- проект не управляет auth routing;
- новый контур не зависит от legacy storage и legacy рекламных сущностей.

## 7. Текущий MVP contract

Зафиксированный MVP-контракт:
- `integrationId` должен передаваться явно при создании `VkAdsTest`;
- fallback на “первую активную integration аккаунта” не является бизнес-контрактом;
- текущий `findActiveIntegrationByAccountId(accountId)` в repository — только временный foundation helper;
- MVP ориентирован на один конкретный integration context и один конкретный рекламный сценарий за раз.

Это означает:
- Phase 2 не должна строиться вокруг неявного выбора integration;
- client phase должна принимать уже определённый integration context.

## 8. Что сознательно НЕ реализовано

На текущем этапе отсутствуют:
- stats sync;
- cron / background jobs;
- controller / UI endpoints;
- default integration selection;
- multi-cabinet policy;
- token refresh;
- runtime create/update/delete logic для VK Ads API.

Осознанно уже реализовано:
- standalone VK Ads client;
- auth/env resolution для `integrationId`;
- controlled smoke script без builder и без production flow.
- package read-step внутри smoke/builder;
- минимальный one-variant builder без matrix generation, stats sync, optimizer и UI.

## 9. Точки входа в код

Ключевые файлы:
- [schema.prisma](/Users/mac/code/EASY-CRM/crm/nest/prisma/schema.prisma)
- [README.boundary.md](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/README.boundary.md)
- [README.md](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/README.md)
- [vk-ads-test.module.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/vk-ads-test.module.ts)
- [vk-ads-test.repository.ts](/Users/mac/code/EASY-CRM/crm/nest/src/domains/vk-ads-test/repositories/vk-ads-test.repository.ts)

## 10. Что должно идти следующим этапом

Текущий следующий шаг:
- использовать новый standalone client в controlled smoke path;
- проверять один конкретный `integrationId` и один конкретный рекламный сценарий;
- не строить builder и production launch flow раньше smoke-first валидации.

Что уже проверяется через smoke script:
- auth resolution по `integrationId`;
- `getPackages`;
- `createUrl` + polling `getUrl`;
- `createAdPlan` одиночным campaign object без wrapper `campaigns`;
- fallback normalization ответа `createAdPlan`: если API возвращает только campaign `id`, client дочитывает `ad_groups` через `_ad_plan_id`;
- pragmatic banner create через подтверждённый runtime template для `package_id=3127`;
- best-effort cleanup.

Подтверждённый MVP smoke-сценарий:
- live smoke-run прошёл с `scriptSucceeded=true`, `technicalVerdict=passed`, `productVerdict=passed`;
- `package_id=3127` используется как подтверждённый рабочий сценарий для быстрого MVP;
- retry на `429` подтверждён live-run;
- cleanup подтверждён live-run: `delete banner`, `delete adGroup`, `block adPlan`;
- banner создаётся на основе runtime template, найденного в аккаунте, а не на основе универсального builder по документации;
- при создании banner из template сохраняются только подтверждённые роли `urls.primary`, `content.icon_256x256`, `content.video_portrait_9_16_180s`, `content.video_portrait_9_16_30s`, `textblocks.about_company_115`, `textblocks.cta_community_vk`, `textblocks.text_2000`, `textblocks.title_40_vkads`;
- smoke заменяет только `name` и `urls.primary.id`;
- `DELETE banner` не обязан приводить к `404`: VK Ads переводит banner в `status=deleted`, и cleanup считается успешным при подтверждённом `status=deleted`.

Текущий builder-flow:
- entrypoint: `VkAdsTestBuilderService.buildOneVariant(input)`;
- создаёт один URL, одну campaign с nested ad_group, один banner из runtime template;
- сохраняет `VkAdsTest`, `VkAdsTestAudience`, `VkAdsTestCreative`, `VkAdsTestVariant`, `VkAdsTestActionLog`;
- не делает массовую матрицу тестов, stats sync, optimizer, CRM attribution, controller или UI.

## 11. Как проверять текущий этап

Базовая проверка:

```bash
cd crm/nest && npx prisma generate
cd crm/nest && npm run build
```

Smoke script:

```bash
cd crm/nest
VK_ADS_TEST_SMOKE_ENABLED=1 \
VK_ADS_TEST_SMOKE_INTEGRATION_ID=123 \
VK_ADS_TEST_SMOKE_LANDING_URL=https://example.com \
npm run vk-ads-test:smoke
```

Обязательные env:
- `VK_ADS_TEST_SMOKE_ENABLED=1`
- `VK_ADS_TEST_SMOKE_INTEGRATION_ID`
- `VK_ADS_TEST_SMOKE_LANDING_URL`

Опциональные env:
- `VK_ADS_TEST_SMOKE_CAMPAIGN_NAME_PREFIX`
- `VK_ADS_TEST_SMOKE_AD_GROUP_NAME_PREFIX`
- `VK_ADS_TEST_SMOKE_URL_CHECK_TIMEOUT_MS`
- `VK_ADS_TEST_SMOKE_URL_CHECK_INTERVAL_MS`
- `VK_ADS_TEST_SMOKE_CLEANUP_ENABLED`

Ограничение:
- `prisma db push` зависит от доступности локальной БД;
- если локальная PostgreSQL недоступна, это нужно просто фиксировать отдельно, без расширения scope текущего этапа.

## 12. Коротко

Текущее состояние домена:
- schema foundation есть;
- ownership зафиксирован;
- integration foundation есть;
- repository foundation есть;
- standalone client реализован;
- auth/env resolution реализован;
- smoke-first path реализован отдельным script.
- one-variant builder реализован как internal service.

Готовность к следующему шагу:
- можно подключать controlled orchestration/controller вокруг `buildOneVariant()` либо продолжать вручную валидировать builder на конкретной integration.
