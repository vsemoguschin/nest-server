# VK Ads Test Boundary

`vk-ads-test` — полностью изолированный контур.

Что не используем:
- `crm/nest/src/domains/vk-ads/*`
- `VkAdsDailyStat`
- `refs / utm / Deal.adTag`
- существующие боевые `ad_plans / ad_groups / banners`
- текущий callback / CRM flow

Что допускается:
- читать существующий код только как reference
- использовать только системные объекты VK Ads: `package_id`, справочники, `banner fields`, `targetings`
- создавать, обновлять и удалять только новые объекты, принадлежащие новому контуру

Инвариант:
- вся дальнейшая реализация идёт только внутри `crm/nest/src/domains/vk-ads-test/`
- любой runtime create/update/delete в новом контуре работает только со своими новыми объектами
- primary owner нового контура — `accountId`
- `projectId` — только optional business context
- VK Ads auth/runtime context живёт в отдельной integration model нового домена
