/**
 * Архив неиспользуемых кандидатов, вынесенных из рабочих файлов planfact.
 *
 * Зачем файл:
 * - Nuxt является единственным клиентом PlanfactController
 * - PATCH /planfact/operation/:operationId не используется
 * - hourly синхронизация T-Bank выполняется через TbankSyncService, а не через PlanfactService
 * - удалённые из PlanfactService методы сохранены здесь как список/сигнатуры "на всякий случай"
 *
 * ВАЖНО:
 * - файл не подключается в module
 * - это архив-справка, а не исполняемый код
 * - точные реализации доступны в git history/diff
 */

export const PLANFACT_UNUSED_CANDIDATES_ARCHIVE = {
  removedFromController: [
    {
      file: 'src/domains/planfact/planfact.controller.ts',
      reason:
        'Nuxt не вызывает PATCH /planfact/operation/:operationId; операции не редактируются вручную',
      route: 'PATCH /planfact/operation/:operationId',
      method: 'updateOperation(operationId: string, updateOperationDto: UpdateOperationDto)',
      relatedImportRemoved: './dto/update-operation.dto',
    },
  ],
  removedFromService: [
    {
      file: 'src/domains/planfact/planfact.service.ts',
      reason:
        'не используется после удаления PATCH endpoint редактирования manual Operation',
      methods: [
        'updateOperation(operationId: string, dto: UpdateOperationDto)',
      ],
      relatedImportRemoved: './dto/update-operation.dto',
    },
    {
      file: 'src/domains/planfact/planfact.service.ts',
      reason:
        'локальный helper не вызывался внутри PlanfactService (дублировал логику других сервисов/сидов)',
      methods: [
        'getOrCreateCounterParty(counterPartyData: { account; inn; kpp; name; bankName; bankBic })',
      ],
    },
    {
      file: 'src/domains/planfact/planfact.service.ts',
      reason:
        'legacy цепочка синхронизации T-Bank внутри PlanfactService не является точкой входа; актуальная hourly синхронизация идёт через TbankSyncService',
      typesAndHelpers: [
        'OperationFromApi',
        'CounterPartyFromApi',
        'OriginalOperationFromTbankPayload',
        'ExtendedPrismaClient (вариант с upsert/update/delete/tbankSyncStatus)',
        'normalizeTbankCompareValue(value)',
        'buildOriginalOperationFromTbankPayload(op, accountId)',
        'mergeOriginalOperationFromTbankPayload(existing, incoming)',
        'getTbankSemanticDuplicateScore(existing, incoming)',
        'findSemanticDuplicateOriginalOperationFromTbank(incoming)',
      ],
      methods: [
        'getOrCreateCounterPartyWithCategories(counterPartyData)',
        'fetchOperationsFromTbankWithCategories(accountNumber, from, to, limit?, categories?, inns?)',
        'saveOriginalOperationsWithCategories(operations, accountId)',
        'updateSyncStatus(accountId, lastOperationDate, totalOperations, status, errorMessage?)',
        'syncTbankOperations(from?, to?)',
      ],
      notes: [
        'Логика семантического дедупа и удаления неактуальных дублей была добавлена именно в этот legacy-путь, но он не используется hourly синхронизацией',
        'Перенос дедупа в TbankSyncService отложен отдельно (важная следующая задача)',
      ],
    },
  ],
} as const;

