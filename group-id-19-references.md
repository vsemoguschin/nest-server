# Group ID 19 References (Nest)

Source: `crm/nest/src` (grep by `groupId`/`groupIds`/group constants).

**`crm/nest/src/domains/groups/groups-access.service.ts`**
- [crm/nest/src/domains/groups/groups-access.service.ts:23](crm/nest/src/domains/groups/groups-access.service.ts#L23) — `if (!this.privilegedShortNames.includes(user.role.shortName) || user.groupId === 19) {`
- [crm/nest/src/domains/groups/groups-access.service.ts:35](crm/nest/src/domains/groups/groups-access.service.ts#L35) — `scope.id = { in: [18, 3, 17, 19, 24] };`

**`crm/nest/src/domains/commercial-datas/commercial-datas.service.ts`**
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:253](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L253) — `if (groupId === 19) {`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:257](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L257) — `if (groupId === 19 && role === 'MOV' && period >= '2025-10') {`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:943](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L943) — `m.groupId === 19 && m.role.shortName === 'MOV'`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:948](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L948) — `m.groupId === 19 && m.role.shortName === 'MOV' ? 0.01 : 0;`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1080](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1080) — `m.groupId === 19 && m.role.shortName === 'ROP'`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1357](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1357) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1374](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1374) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1390](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1390) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1406](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1406) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1424](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1424) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1637](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1637) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1654](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1654) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1670](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1670) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1686](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1686) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:1704](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L1704) — `.filter((u) => u.workSpaceId === 3 && u.groupId !== 19)`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:2829](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L2829) — `// groupId: 19`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:2835](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L2835) — `groupId: 19,`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:2991](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L2991) — `(d) => d.user.role.shortName === 'MOV' && d.user.groupId === 19,`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:3020](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L3020) — `groupId: 19,`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:3026](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L3026) — `groupId: 19,`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.ts:3163](crm/nest/src/domains/commercial-datas/commercial-datas.service.ts#L3163) — `(d) => d.user.role.shortName === 'MOP' && d.user.groupId === 19,`

**`crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts`**
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts:365](crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts#L365) — `//         filter: (user) => user.workSpaceId === 3 && user.groupId !== 19,`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts:535](crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts#L535) — `//     if (groupId === 19) {`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts:538](crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts#L538) — `//     if (groupId === 19 && role === 'MOV' && period >= '2025-10') {`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts:1060](crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts#L1060) — `//       m.groupId === 19 && m.role.shortName === 'MOV'`
- [crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts:1065](crm/nest/src/domains/commercial-datas/commercial-datas.service.refactored.ts#L1065) — `//       m.groupId === 19 && m.role.shortName === 'MOV' ? 0.1 : 0;`

**`crm/nest/src/domains/dashboards/dashboards.service.ts`**
- [crm/nest/src/domains/dashboards/dashboards.service.ts:490](crm/nest/src/domains/dashboards/dashboards.service.ts#L490) — `if (m.groupId === 19) {`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:494](crm/nest/src/domains/dashboards/dashboards.service.ts#L494) — `m.groupId === 19 &&`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:601](crm/nest/src/domains/dashboards/dashboards.service.ts#L601) — `if (dop.groupId === 19) {`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:605](crm/nest/src/domains/dashboards/dashboards.service.ts#L605) — `dop.groupId === 19 &&`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1058](crm/nest/src/domains/dashboards/dashboards.service.ts#L1058) — `if (m.groupId === 19) {`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1062](crm/nest/src/domains/dashboards/dashboards.service.ts#L1062) — `m.groupId === 19 &&`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1171](crm/nest/src/domains/dashboards/dashboards.service.ts#L1171) — `.filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1189](crm/nest/src/domains/dashboards/dashboards.service.ts#L1189) — `.filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1206](crm/nest/src/domains/dashboards/dashboards.service.ts#L1206) — `.filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1223](crm/nest/src/domains/dashboards/dashboards.service.ts#L1223) — `.filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)`
- [crm/nest/src/domains/dashboards/dashboards.service.ts:1242](crm/nest/src/domains/dashboards/dashboards.service.ts#L1242) — `.filter((u) => u.workSpace === 'ВК' && u.groupId !== 19)`

**`crm/nest/src/domains/pnl/pnl.service.ts`**
- [crm/nest/src/domains/pnl/pnl.service.ts:451](crm/nest/src/domains/pnl/pnl.service.ts#L451) — `groupId: 19,`
- [crm/nest/src/domains/pnl/pnl.service.ts:575](crm/nest/src/domains/pnl/pnl.service.ts#L575) — `const EASYBOOK_GROUP_IDS = [19];`
- [crm/nest/src/domains/pnl/pnl.service.ts:1305](crm/nest/src/domains/pnl/pnl.service.ts#L1305) — `const EASYBOOK_GROUP_IDS = [19];`

**`crm/nest/src/domains/reports/reports.service.ts`**
- [crm/nest/src/domains/reports/reports.service.ts:56](crm/nest/src/domains/reports/reports.service.ts#L56) — `if (existingUser.groupId === 19 && existingUser.role.shortName == 'MOP') {`
- [crm/nest/src/domains/reports/reports.service.ts:59](crm/nest/src/domains/reports/reports.service.ts#L59) — `if (existingUser.groupId === 19 && existingUser.role.shortName == 'MOV') {`

**`crm/nest/src/notifications/notification-scheduler.service.ts`**
- [crm/nest/src/notifications/notification-scheduler.service.ts:1696](crm/nest/src/notifications/notification-scheduler.service.ts#L1696) — `{ project: 'book', adSourceId: 19, workSpaceId: 3, groupId: 19 },`

**`crm/nest/src/seeds/seed-update-deals-group-id.ts`**
- [crm/nest/src/seeds/seed-update-deals-group-id.ts:9](crm/nest/src/seeds/seed-update-deals-group-id.ts#L9) — `const targetGroupId = 19;`

---

# Group ID 19 References (Nuxt)

Source: `crm/nuxt` (grep by `groupId`/`groupIds`/group constants).

**`crm/nuxt/components/my/deals/EditDealForm.vue`**
- [crm/nuxt/components/my/deals/EditDealForm.vue:117](crm/nuxt/components/my/deals/EditDealForm.vue) — `v-if="dealData.groupId !== 16 && dealData.groupId !== 19"`
- [crm/nuxt/components/my/deals/EditDealForm.vue:160](crm/nuxt/components/my/deals/EditDealForm.vue#L160) — `<div v-if="dealData.groupId !== 19" class="relative">`
- [crm/nuxt/components/my/deals/EditDealForm.vue:180](crm/nuxt/components/my/deals/EditDealForm.vue#L180) — `v-if="dealData.groupId !== 16 && dealData.groupId !== 19"`
- [crm/nuxt/components/my/deals/EditDealForm.vue:250](crm/nuxt/components/my/deals/EditDealForm.vue#L250) — `<div v-if="dealData.groupId === 19" class="relative">`
- [crm/nuxt/components/my/deals/EditDealForm.vue:278](crm/nuxt/components/my/deals/EditDealForm.vue#L278) — `<div v-if="dealData.groupId === 19" class="relative">`
- [crm/nuxt/components/my/deals/EditDealForm.vue:305](crm/nuxt/components/my/deals/EditDealForm.vue#L305) — `<div v-if="dealData.groupId === 19" class="relative">`

---

# Group ID 17 References (Nest)

Source: `crm/nest/src` (grep by `groupId`/`groupIds`/group constants).

**`crm/nest/src/domains/groups/groups-access.service.ts`**
- [crm/nest/src/domains/groups/groups-access.service.ts:35](crm/nest/src/domains/groups/groups-access.service.ts#L35) — `scope.id = { in: [18, 3, 17, 19, 24] };`

**`crm/nest/src/seeds/seed-rename-group-17.ts`**
- [crm/nest/src/seeds/seed-rename-group-17.ts:7](crm/nest/src/seeds/seed-rename-group-17.ts#L7) — `const groupId = 17;`

---

# Group ID 17 References (Nuxt)

Source: `crm/nuxt` (grep by `groupId`/`groupIds`/group constants).

Совпадений не найдено.
