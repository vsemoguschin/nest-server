import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CrmCustomerCommunicationsService } from '../crm-customers/crm-customer-communications.service';
import { BrainWorkspaceService } from './brain-workspace.service';
import { CuratorAnalyzeDto } from './dto/curator-analyze.dto';
import {
  LearningBatchRunRequestDto,
  LearningConversationAnalysisRecord,
  LearningCoverageStatus,
  LearningFindingRecord,
  LearningManagerPatternCandidateRecord,
  LearningManagerPatternCandidateType,
  LearningImprovementType,
  LearningManagerCandidateRecord,
  LearningOutcomeStatus,
  LearningPaymentStage,
  LearningPhaseAnalysisRecord,
  LearningPhaseType,
  LearningRunFiltersRecord,
  LearningRunReportRecord,
  LearningSuggestedArtifactType,
  LearningSuccessfulPatternRecord,
} from './dto/learning-analysis.dto';
import {
  CuratorArtifactType,
  CuratorChangeType,
  CuratorProposalRecord,
} from './dto/curator-proposal.dto';
import { LearningFindingCreateProposalDto } from './dto/learning-finding-proposal.dto';
import { CuratorAssistantService } from './curator-assistant.service';
import {
  LEARNING_ANALYSIS_STORAGE,
  LearningAnalysisStorage,
} from './learning-analysis.storage';

type VkHistoryItem = {
  id?: number;
  date?: number;
  text?: string;
  out?: 0 | 1;
};

type VkHistoryResponse = {
  response?: {
    items?: VkHistoryItem[];
  };
  error?: {
    error_code?: number;
    error_msg?: string;
  };
};

type LearningCategoryDefinition = {
  key: string;
  improvementType: Exclude<LearningImprovementType, 'successful_pattern'>;
  title: string;
  summary: string;
  recommendation: string;
  defaultArtifacts: string[];
  keywords: string[];
};

type LearningCandidateRule = {
  key: string;
  category: string;
  improvementType: 'knowledge_gap' | 'process_gap' | 'followup_gap' | 'script_gap';
  title: string;
  summary: string;
  recommendation: string;
  suspectedArtifacts: string[];
  detectionKeywords: string[];
  searchKeywords: string[];
};

type SuccessfulPatternRule = {
  key: string;
  title: string;
  summary: string;
  phaseTypes: LearningPhaseType[];
  detectionKeywords: string[];
  suggestedArtifacts: string[];
  searchKeywords: string[];
  recommendedAction: string;
};

type ManagerPatternRule = {
  key: string;
  candidateType: LearningManagerPatternCandidateType;
  title: string;
  triggerSituation: string;
  summary: string;
  whyItWorked: string;
  phaseTypes: LearningPhaseType[];
  detectionKeywords: string[];
  searchKeywords: string[];
  suggestedArtifactPath: string;
  suggestedArtifactType: LearningSuggestedArtifactType;
  confidence: 'low' | 'medium' | 'high';
  operationalImportance?: string;
};

type BrainArtifactIndexRecord = {
  section: string;
  key: string;
  relativePath: string;
  title: string;
  summary: string | null;
  purpose: string | null;
  usedWhen: string[] | null;
};

type CoverageAssessment = {
  coverageStatus: LearningCoverageStatus;
  suggestedArtifacts: string[];
  note: string;
};

type LearningIssueEvidence = {
  groupKey: string;
  category: string;
  improvementType: LearningImprovementType;
  title: string;
  summary: string;
  conversationId: string;
  phaseType: LearningPhaseType | null;
  isSuccessful: boolean;
  exampleManagerMessage: string | null;
  suspectedArtifacts: string[];
  suggestedArtifacts: string[];
  coverageStatus: LearningCoverageStatus;
  whyNotCovered: string | null;
  recommendation: string;
  recommendedAction: string;
};

type ConversationPhaseSegment = {
  phaseType: LearningPhaseType;
  startMessageIndex: number;
  endMessageIndex: number;
  messages: Array<{
    id?: string;
    role: 'customer' | 'manager';
    text: string;
    createdAt?: string;
  }>;
};

type OutcomeDetectionResult = {
  outcomeStatus: LearningOutcomeStatus;
  isSuccessful: boolean;
  isCompleted: boolean;
  paymentStage: LearningPaymentStage;
  notes: string[];
};

const DEFAULT_SOURCE = 'easybook';
const DEFAULT_MAX_CONVERSATIONS = 10;
const DEFAULT_HISTORY_COUNT = 14;
const MAX_HISTORY_COUNT = 200;
const LEARNING_LIMITATIONS = [
  'MVP использует реальные VK-диалоги CRM-клиентов и фильтры source/status/tag/manager/customerIds.',
  'Фильтр по date range пока не реализован: текущий batch selector основан на CRM customer selection и orderBy updatedAt desc.',
  'Learning runs и reports пока хранятся in-memory в crm/nest и переживают только текущий процесс.',
  'Outcome и phase detection пока heuristic: CRM status, history text и manager behavior patterns используются как best-effort signals.',
];

const PHASE_ORDER: LearningPhaseType[] = [
  'lead_intake',
  'qualification',
  'pricing',
  'payment_conversion',
  'photo_collection',
  'design_approval',
  'production_delivery',
  'post_delivery_feedback',
  'post_purchase_marketing',
];

const LEARNING_CATEGORIES: LearningCategoryDefinition[] = [
  {
    key: 'qualification_gap',
    improvementType: 'script_gap',
    title: 'Провал квалификации',
    summary:
      'Ассистент слабо выясняет задачу клиента, формат, бюджет или количество фото.',
    recommendation:
      'Проверить qualification scripts и правила обязательных уточнений, чтобы диалог быстрее выходил на осмысленное предложение.',
    defaultArtifacts: ['knowledge/scripts/qualification.json'],
    keywords: ['квалиф', 'уточн', 'потребност', 'формат', 'бюджет', 'количеств'],
  },
  {
    key: 'pricing_issue',
    improvementType: 'knowledge_gap',
    title: 'Проблема с ценовым объяснением',
    summary:
      'Ассистент неуверенно объясняет стоимость, путает pricing flow или не доводит до следующего шага.',
    recommendation:
      'Проверить pricing FAQ и pricing-offers script, чтобы ответ о стоимости был конкретным и конверсионным.',
    defaultArtifacts: [
      'knowledge/faq/pricing.json',
      'knowledge/scripts/pricing-offers.json',
    ],
    keywords: ['цен', 'стоим', 'прайс', 'pricing'],
  },
  {
    key: 'examples_not_offered',
    improvementType: 'followup_gap',
    title: 'Проблема с примерами и референсами',
    summary:
      'Ассистент не предлагает безопасный следующий шаг, когда клиент просит примеры, фото или образцы.',
    recommendation:
      'Усилить scripts/FAQ для asset requests и убрать внутренние мета-реплики.',
    defaultArtifacts: [
      'knowledge/scripts/qualification.json',
      'knowledge/media/media-catalog.json',
    ],
    keywords: ['пример', 'референс', 'образц', 'галере', 'показат'],
  },
  {
    key: 'delivery_payment_issue',
    improvementType: 'knowledge_gap',
    title: 'Проблема с объяснением доставки или оплаты',
    summary:
      'Ассистент не даёт уверенного customer-facing ответа по доставке или оплате.',
    recommendation:
      'Проверить профильные FAQ и сценарии payment/delivery, чтобы снять типовые возражения коротко и точно.',
    defaultArtifacts: [
      'knowledge/faq/delivery.json',
      'knowledge/faq/payment.json',
      'knowledge/scripts/payment-flow.json',
    ],
    keywords: ['достав', 'оплат', 'срок', 'платеж'],
  },
  {
    key: 'tone_policy_issue',
    improvementType: 'script_gap',
    title: 'Проблема тона или policy',
    summary:
      'Ассистент уходит в служебные мета-реплики, внутренние процессы или неподходящий клиентский тон.',
    recommendation:
      'Проверить sales rules и prompts, чтобы сохранить customer-facing тон без внутренних пояснений.',
    defaultArtifacts: [
      '.agent/SALES_MANAGER_RULES.md',
      'knowledge/prompts/system-prompts.json',
    ],
    keywords: ['тон', 'мета', 'внутрен', 'полит', 'база знаний', 'инструкц'],
  },
  {
    key: 'script_mismatch',
    improvementType: 'script_gap',
    title: 'Несоответствие скрипту',
    summary:
      'Ассистент отвечает способом, который не совпадает с ожидаемым sales script или handoff flow.',
    recommendation:
      'Проверить ключевые scripts и prompts, чтобы путь диалога соответствовал текущей модели продаж.',
    defaultArtifacts: [
      'knowledge/scripts/first-contact.json',
      'knowledge/scripts/handoff.json',
      'knowledge/prompts/system-prompts.json',
    ],
    keywords: ['скрипт', 'сценар', 'handoff', 'flow'],
  },
  {
    key: 'weak_progression',
    improvementType: 'followup_gap',
    title: 'Слабое продвижение диалога',
    summary:
      'Ассистент отвечает безопасно, но не двигает разговор к следующему полезному шагу.',
    recommendation:
      'Усилить правила next-step и follow-up, чтобы каждый ответ продвигал диалог вперёд.',
    defaultArtifacts: [
      'knowledge/scripts/follow-ups.json',
      '.agent/CUSTOMER_PLAYBOOK.md',
    ],
    keywords: ['следующ', 'продвин', 'follow-up', 'не продвинул', 'слаб'],
  },
];

const MANAGER_CANDIDATE_RULES: LearningCandidateRule[] = [
  {
    key: 'payment_stages',
    category: 'payment_stage_explanation',
    improvementType: 'knowledge_gap',
    title: 'Не хватает объяснения этапов оплаты',
    summary:
      'Менеджер объясняет, когда и какими частями проходит оплата, а brain может покрывать это не полностью.',
    recommendation:
      'Проверить и при необходимости усилить описание payment stages и момента каждой оплаты.',
    suspectedArtifacts: [
      'knowledge/faq/payment.json',
      'knowledge/scripts/payment-flow.json',
    ],
    detectionKeywords: ['оплат', 'предоплат', 'этап', 'част', 'остат', 'доплат'],
    searchKeywords: ['оплата', 'предоплата', 'доплата', 'этап', 'часть'],
  },
  {
    key: 'post_approval_process',
    category: 'post_approval_process',
    improvementType: 'process_gap',
    title: 'Не хватает шага после утверждения макета',
    summary:
      'Менеджер объясняет, что происходит после согласования/утверждения, но это может быть неявно отражено в brain.',
    recommendation:
      'Уточнить post-approval process, чтобы ассистент мог объяснять следующий шаг после согласования.',
    suspectedArtifacts: [
      'knowledge/scripts/photo-upload.json',
      'knowledge/scripts/payment-flow.json',
      'knowledge/faq/payment.json',
    ],
    detectionKeywords: ['утверж', 'согласов', 'после утверж', 'макет'],
    searchKeywords: ['утверждение', 'согласование', 'макет', 'после утверждения'],
  },
  {
    key: 'order_process',
    category: 'order_process',
    improvementType: 'process_gap',
    title: 'Не хватает объяснения хода заказа',
    summary:
      'Менеджер раскладывает клиенту порядок действий по заказу, а процесс может быть недостаточно явно представлен в assistant brain.',
    recommendation:
      'Добавить более явное описание order flow и customer journey steps.',
    suspectedArtifacts: [
      'knowledge/scripts/first-contact.json',
      'knowledge/scripts/photo-upload.json',
      'knowledge/faq/delivery.json',
    ],
    detectionKeywords: ['заказ', 'далее', 'следующ', 'этап', 'потом'],
    searchKeywords: ['заказ', 'этап', 'далее', 'следующий шаг'],
  },
  {
    key: 'materials_followup',
    category: 'materials_followup',
    improvementType: 'followup_gap',
    title: 'Не хватает follow-up после отправки материалов',
    summary:
      'Менеджер после отправки материалов проверяет, посмотрел ли клиент и готов ли двигаться дальше.',
    recommendation:
      'Усилить follow-up logic после отправки примеров, материалов и расчётов.',
    suspectedArtifacts: [
      'knowledge/scripts/follow-ups.json',
      'knowledge/media/media-catalog.json',
      '.agent/CUSTOMER_PLAYBOOK.md',
    ],
    detectionKeywords: ['успели', 'посмотр', 'примеры', 'материал', 'ознаком'],
    searchKeywords: ['посмотрели', 'примеры', 'материалы', 'ознакомились'],
  },
  {
    key: 'choice_after_pricing',
    category: 'choice_after_pricing',
    improvementType: 'script_gap',
    title: 'Не хватает шага выбора после pricing/examples',
    summary:
      'Менеджер после отправки цены или примеров уточняет, какой вариант ближе клиенту.',
    recommendation:
      'Добавить явный next-step после pricing/examples: попросить клиента выбрать предпочитаемый вариант.',
    suspectedArtifacts: [
      'knowledge/scripts/pricing-offers.json',
      'knowledge/scripts/follow-ups.json',
      'knowledge/scripts/qualification.json',
    ],
    detectionKeywords: ['какой вариант', 'какой формат', 'что ближе', 'какой стиль', 'какой больше'],
    searchKeywords: ['какой вариант', 'какой формат', 'что ближе', 'какой стиль'],
  },
  {
    key: 'readiness_confirmation',
    category: 'readiness_confirmation',
    improvementType: 'followup_gap',
    title: 'Не хватает проверки готовности продолжить',
    summary:
      'Менеджер подтверждает, всё ли понятно клиенту и готов ли он идти дальше по процессу.',
    recommendation:
      'Усилить progression logic: после объяснения шагов ассистент должен проверять готовность продолжить.',
    suspectedArtifacts: [
      'knowledge/scripts/follow-ups.json',
      '.agent/SALES_MANAGER_RULES.md',
    ],
    detectionKeywords: ['всё ли понятно', 'все ли понятно', 'готовы', 'удобно', 'понятно ли', 'если все понятно'],
    searchKeywords: ['всё ли понятно', 'готовы', 'удобно', 'понятно'],
  },
];

const SUCCESSFUL_PATTERN_RULES: SuccessfulPatternRule[] = [
  {
    key: 'payment_stage_explained',
    title: 'Успешное объяснение этапов оплаты',
    summary:
      'Менеджер конвертирует клиента через понятное объяснение этапов оплаты и момента каждого платежа.',
    phaseTypes: ['payment_conversion'],
    detectionKeywords: ['предоплат', 'остат', 'доплат', 'этап оплаты'],
    suggestedArtifacts: [
      'knowledge/faq/payment.json',
      'knowledge/scripts/payment-flow.json',
    ],
    searchKeywords: ['предоплата', 'доплата', 'этап оплаты'],
    recommendedAction:
      'Проверить, может ли assistant brain так же ясно объяснять payment stages в успешных диалогах.',
  },
  {
    key: 'price_ladder_after_resistance',
    title: 'Успешная ценовая вилка после сопротивления',
    summary:
      'Менеджер после ценового сопротивления предлагает более подходящий вариант и сохраняет движение диалога.',
    phaseTypes: ['pricing'],
    detectionKeywords: ['дешевле', 'бюджетн', 'вариант', 'подешевле'],
    suggestedArtifacts: [
      'knowledge/scripts/pricing-offers.json',
      'knowledge/faq/pricing.json',
    ],
    searchKeywords: ['дешевле', 'вариант', 'бюджетный'],
    recommendedAction:
      'Усилить pricing ladder и cheaper-option handling на основе успешных продаж.',
  },
  {
    key: 'clear_order_flow_explained',
    title: 'Успешное объяснение порядка работы',
    summary:
      'Менеджер понятно раскладывает клиенту последовательность шагов заказа и снимает неопределённость.',
    phaseTypes: ['qualification', 'photo_collection', 'design_approval'],
    detectionKeywords: ['сначала', 'далее', 'потом', 'после этого'],
    suggestedArtifacts: [
      'knowledge/scripts/first-contact.json',
      'knowledge/scripts/photo-upload.json',
    ],
    searchKeywords: ['сначала', 'далее', 'после этого'],
    recommendedAction:
      'Сохранить и формализовать удачные order-flow explanations в scripts и FAQ.',
  },
  {
    key: 'handoff_to_designer',
    title: 'Успешный handoff к следующему этапу',
    summary:
      'Менеджер мягко передаёт клиента в следующий процессный этап без потери контекста.',
    phaseTypes: ['design_approval', 'production_delivery'],
    detectionKeywords: ['дизайнер', 'макет', 'передам', 'передаю'],
    suggestedArtifacts: [
      'knowledge/scripts/handoff.json',
      'knowledge/scripts/photo-upload.json',
    ],
    searchKeywords: ['дизайнер', 'макет', 'передам'],
    recommendedAction:
      'Проверить и усилить handoff logic для перехода между этапами заказа.',
  },
  {
    key: 'post_delivery_review_request',
    title: 'Успешный запрос обратной связи после выполнения',
    summary:
      'После завершения заказа менеджер корректно просит отзыв или уточняет впечатления клиента.',
    phaseTypes: ['post_delivery_feedback'],
    detectionKeywords: ['отзыв', 'понрав', 'получили', 'как вам'],
    suggestedArtifacts: [
      'knowledge/scripts/follow-ups.json',
      '.agent/CUSTOMER_PLAYBOOK.md',
    ],
    searchKeywords: ['отзыв', 'понравилось', 'как вам'],
    recommendedAction:
      'Сохранить удачные пост-доставочные follow-up паттерны в scripts и rules.',
  },
];

const MANAGER_PATTERN_RULES: ManagerPatternRule[] = [
  {
    key: 'qualification_prompt_unlocks_pricing',
    candidateType: 'script_candidate',
    title: 'Квалификационный вопрос, который открывает pricing',
    triggerSituation:
      'Клиент ещё не дал достаточно вводных, и менеджер коротко уточняет формат, событие или количество фото.',
    summary:
      'Менеджер задаёт короткий customer-facing qualification prompt и быстро переводит диалог в осмысленный pricing step.',
    whyItWorked:
      'Такой prompt снимает неопределённость и позволяет дать конкретное предложение вместо общего ответа.',
    phaseTypes: ['qualification'],
    detectionKeywords: ['какой формат', 'сколько фото', 'для какого', 'какой бюджет'],
    searchKeywords: ['какой формат', 'сколько фото', 'бюджет', 'для какого'],
    suggestedArtifactPath: 'knowledge/scripts/qualification.json',
    suggestedArtifactType: 'knowledge_script',
    confidence: 'high',
  },
  {
    key: 'pricing_followup_after_silence',
    candidateType: 'followup_candidate',
    title: 'Мягкий follow-up после pricing',
    triggerSituation:
      'После отправки цены или вариантов клиент замолкает, и менеджер мягко возвращает диалог к выбору.',
    summary:
      'Менеджер не давит, а предлагает выбрать более близкий вариант или задать вопрос по цене.',
    whyItWorked:
      'Мягкий follow-up после pricing снижает трение и возвращает клиента к следующему решению без давления.',
    phaseTypes: ['pricing'],
    detectionKeywords: ['какой вариант', 'что ближе', 'если будут вопросы', 'какой формат вам'],
    searchKeywords: ['какой вариант', 'что ближе', 'если будут вопросы'],
    suggestedArtifactPath: 'knowledge/scripts/follow-ups.json',
    suggestedArtifactType: 'followup_rule',
    confidence: 'medium',
  },
  {
    key: 'cheaper_option_after_price_resistance',
    candidateType: 'objection_candidate',
    title: 'Более доступный вариант после ценового возражения',
    triggerSituation:
      'Клиент сомневается из-за цены, и менеджер предлагает более лёгкий entry option.',
    summary:
      'Менеджер сохраняет движение вперёд через более доступный формат вместо тупика на возражении.',
    whyItWorked:
      'Смягчённый price ladder помогает не терять лид и сохранить конверсию в следующий шаг.',
    phaseTypes: ['pricing'],
    detectionKeywords: ['подешевле', 'более бюджет', 'дешевле', 'вариант поменьше'],
    searchKeywords: ['подешевле', 'бюджетный вариант', 'вариант поменьше'],
    suggestedArtifactPath: 'knowledge/scripts/pricing-offers.json',
    suggestedArtifactType: 'knowledge_script',
    confidence: 'high',
  },
  {
    key: 'deposit_request_framing',
    candidateType: 'script_candidate',
    title: 'Формулировка запроса на предоплату',
    triggerSituation:
      'Клиент готов двигаться дальше, и менеджер переводит согласие в понятный следующий шаг оплаты.',
    summary:
      'Менеджер объясняет, что предоплата запускает работу и является нормальной точкой перехода к заказу.',
    whyItWorked:
      'Чёткая framing предоплаты уменьшает тревожность и помогает перейти от интереса к реальному заказу.',
    phaseTypes: ['payment_conversion'],
    detectionKeywords: ['предоплат', 'чтобы запустить', 'для старта работы', 'внести оплат'],
    searchKeywords: ['предоплата', 'для старта работы', 'запустить в работу'],
    suggestedArtifactPath: 'knowledge/scripts/payment-flow.json',
    suggestedArtifactType: 'knowledge_script',
    confidence: 'high',
    operationalImportance:
      'Поддерживает переход от pricing к order launch и снижает drop-off на payment step.',
  },
  {
    key: 'payment_stage_explanation_operational',
    candidateType: 'operational_knowledge_candidate',
    title: 'Операционное объяснение этапов оплаты',
    triggerSituation:
      'Клиенту нужно понять, когда вносится предоплата и когда оплачивается остаток.',
    summary:
      'Менеджер объясняет payment stages как часть реального order flow, а не просто как цену.',
    whyItWorked:
      'Это снимает неопределённость по процессу и делает оплату предсказуемой для клиента.',
    phaseTypes: ['payment_conversion'],
    detectionKeywords: ['предоплат', 'остаток', 'доплат', 'перед отправкой', 'после утверждения'],
    searchKeywords: ['предоплата', 'остаток', 'после утверждения', 'перед отправкой'],
    suggestedArtifactPath: 'knowledge/faq/payment.json',
    suggestedArtifactType: 'knowledge_faq',
    confidence: 'high',
    operationalImportance:
      'Критично для прохождения payment stage и снижения блокеров перед запуском заказа.',
  },
  {
    key: 'payment_link_after_readiness',
    candidateType: 'followup_candidate',
    title: 'Ссылка на оплату после подтверждения готовности',
    triggerSituation:
      'Клиент подтверждает готовность, и менеджер сразу отправляет payment action без лишней паузы.',
    summary:
      'Менеджер использует readiness confirmation как триггер для мгновенного next step к оплате.',
    whyItWorked:
      'Такой переход уменьшает потерю импульса и закрепляет намерение клиента действием.',
    phaseTypes: ['payment_conversion'],
    detectionKeywords: ['отправлю ссылку', 'пришлю ссылку', 'как будете готовы', 'ссылку на оплату'],
    searchKeywords: ['ссылка на оплату', 'пришлю ссылку', 'как будете готовы'],
    suggestedArtifactPath: 'knowledge/scripts/payment-flow.json',
    suggestedArtifactType: 'followup_rule',
    confidence: 'medium',
    operationalImportance:
      'Помогает быстро конвертировать readiness в реальную оплату без лишней задержки.',
  },
  {
    key: 'photo_upload_flow',
    candidateType: 'process_candidate',
    title: 'Пояснение процесса загрузки фотографий',
    triggerSituation:
      'После оплаты или подтверждения клиенту нужно понять, как и куда передать материалы.',
    summary:
      'Менеджер объясняет practical next step для photo upload и передачи материалов в работу.',
    whyItWorked:
      'Без этого шага заказ зависает между оплатой и реальным production flow.',
    phaseTypes: ['photo_collection'],
    detectionKeywords: ['загрузить фотографии', 'ссылку на загрузку', 'отправьте фото', 'присылайте фото'],
    searchKeywords: ['загрузить фотографии', 'ссылка на загрузку', 'отправьте фото'],
    suggestedArtifactPath: 'knowledge/scripts/photo-upload.json',
    suggestedArtifactType: 'knowledge_script',
    confidence: 'high',
    operationalImportance:
      'Это обязательный operational bridge между оплатой и запуском дизайна/производства.',
  },
  {
    key: 'alternative_file_transfer',
    candidateType: 'objection_candidate',
    title: 'Альтернативный способ передачи файлов при проблеме загрузки',
    triggerSituation:
      'Клиент не может загрузить файлы стандартным способом, и нужен рабочий fallback.',
    summary:
      'Менеджер предлагает альтернативный file-transfer path и не даёт процессу застрять.',
    whyItWorked:
      'Operational fallback снимает технический blocker и сохраняет движение заказа.',
    phaseTypes: ['photo_collection'],
    detectionKeywords: ['если не получается', 'через облако', 'архивом', 'диском'],
    searchKeywords: ['если не получается', 'через облако', 'архивом'],
    suggestedArtifactPath: 'knowledge/scripts/photo-upload.json',
    suggestedArtifactType: 'knowledge_script',
    confidence: 'medium',
    operationalImportance:
      'Убирает sales blocker на этапе передачи материалов и не даёт потерять уже оплаченный заказ.',
  },
  {
    key: 'design_handoff_process',
    candidateType: 'process_candidate',
    title: 'Пояснение handoff после передачи материалов',
    triggerSituation:
      'После фото upload клиенту нужно понять, что будет делать дизайнер и когда ждать макет.',
    summary:
      'Менеджер явно описывает переход заказа в дизайн и следующую точку контакта с клиентом.',
    whyItWorked:
      'Клиент видит понятный следующий этап и не теряется после отправки материалов.',
    phaseTypes: ['design_approval'],
    detectionKeywords: ['дизайнер', 'макет', 'на согласование', 'отправим макет'],
    searchKeywords: ['дизайнер', 'макет', 'на согласование'],
    suggestedArtifactPath: 'knowledge/scripts/handoff.json',
    suggestedArtifactType: 'knowledge_script',
    confidence: 'medium',
    operationalImportance:
      'Поддерживает handoff в design stage и снижает неопределённость после photo upload.',
  },
  {
    key: 'shipping_data_collection',
    candidateType: 'operational_knowledge_candidate',
    title: 'Сбор данных для доставки',
    triggerSituation:
      'Перед отправкой заказа менеджер собирает конкретные shipping details.',
    summary:
      'Менеджер знает, какие данные нужны для доставки и когда их запрашивать.',
    whyItWorked:
      'Без корректного shipping data collection заказ не может перейти к финальной отправке.',
    phaseTypes: ['production_delivery'],
    detectionKeywords: ['адрес', 'получатель', 'телефон', 'для доставки'],
    searchKeywords: ['адрес доставки', 'получатель', 'телефон'],
    suggestedArtifactPath: 'knowledge/faq/delivery.json',
    suggestedArtifactType: 'knowledge_faq',
    confidence: 'medium',
    operationalImportance:
      'Критично для финального delivery stage и завершения заказа без ручных уточнений.',
  },
];

@Injectable()
export class LearningAnalysisService {
  private brainArtifactIndexPromise: Promise<BrainArtifactIndexRecord[]> | null = null;
  private readonly brainArtifactDetails = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly communicationsService: CrmCustomerCommunicationsService,
    private readonly brainWorkspaceService: BrainWorkspaceService,
    private readonly curatorAssistantService: CuratorAssistantService,
    @Inject(LEARNING_ANALYSIS_STORAGE)
    private readonly storage: LearningAnalysisStorage,
  ) {}

  async runBatch(
    payload: LearningBatchRunRequestDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<LearningRunReportRecord> {
    const filters = this.normalizeFilters(payload);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const customers = await this.selectCustomers(filters);
    const conversationAnalyses: LearningConversationAnalysisRecord[] = [];
    const evidences: LearningIssueEvidence[] = [];
    const extractedManagerPatterns: LearningManagerPatternCandidateRecord[] = [];

    for (const customer of customers) {
      try {
        const conversationInput = await this.buildConversationInput(
          customer.id,
          filters.historyCount,
        );
        const outcome = this.detectOutcome(
          conversationInput.crmStatusName,
          conversationInput.messages,
        );
        const phaseSegments = this.detectPhases(conversationInput.messages);
        const managerCandidates = await this.detectManagerDerivedCandidates(
          conversationInput.messages,
        );
        const successfulPatterns = await this.extractSuccessfulPatterns(
          phaseSegments,
          outcome,
        );

        const analysis = await this.curatorAssistantService.analyzeConversation(
          conversationInput.dto,
          actor,
        );

        const phaseAnalyses = this.buildPhaseAnalyses(
          phaseSegments,
          outcome,
          successfulPatterns,
        );
        const managerPatternCandidates = await this.extractManagerPatternCandidates({
          conversationId: analysis.conversationId,
          phaseSegments,
          phaseAnalyses,
          outcome,
        });

        const conversationAnalysis = this.buildConversationAnalysisRecord({
          customerId: customer.id,
          customerName: customer.fullName ?? '',
          sourceAnalysisId: analysis.analysisId,
          conversationId: analysis.conversationId,
          summary: analysis.structuredRecommendation.summary,
          improvementFocus: analysis.structuredRecommendation.improvementFocus,
          proposalDrafts: analysis.structuredRecommendation.proposalDrafts,
          whyAssistantAnsweredThisWay:
            analysis.structuredRecommendation.whyAssistantAnsweredThisWay,
          managerCandidates,
          outcome,
          phaseAnalyses,
          successfulPatterns,
          managerPatternCandidates,
        });

        conversationAnalyses.push(conversationAnalysis);
        extractedManagerPatterns.push(...conversationAnalysis.managerPatternCandidates);
        evidences.push(
          ...this.buildAssistantWeaknessEvidences(conversationAnalysis),
          ...this.buildManagerCandidateEvidences(conversationAnalysis),
          ...this.buildManagerPatternGapEvidences(conversationAnalysis),
          ...this.buildSuccessfulPatternEvidences(conversationAnalysis),
          ...this.buildPostSaleMarketingEvidences(conversationAnalysis),
        );
      } catch (error) {
        conversationAnalyses.push({
          conversationId: customer.vk?.externalId?.trim() || `customer:${customer.id}`,
          customerId: customer.id,
          customerName: customer.fullName ?? '',
          sourceAnalysisId: `failed:${randomUUID()}`,
          outcomeStatus: 'unknown',
          isSuccessful: false,
          isCompleted: false,
          paymentStage: 'none',
          shortSummary: 'Не удалось проанализировать диалог',
          extractedIssues: [],
          successfulPatterns: [],
          phaseAnalyses: [],
          managerPatternCandidates: [],
          notes: [
            error instanceof Error
              ? error.message
              : 'Conversation analysis failed',
          ],
          suspectedArtifacts: [],
          managerKnowledgeCandidates: [],
          managerProcessCandidates: [],
          managerFollowUpCandidates: [],
        });
      }
    }

    const findings = this.aggregateFindings(evidences);
    const managerPatternCandidates = this.aggregateManagerPatternCandidates(
      extractedManagerPatterns,
    );
    const finishedAt = new Date().toISOString();
    const report: LearningRunReportRecord = {
      runId,
      status: 'completed',
      startedAt,
      finishedAt,
      filters,
      conversationCount: customers.length,
      analyzedCount: conversationAnalyses.filter(
        (item) => !item.sourceAnalysisId.startsWith('failed:'),
      ).length,
      successfulConversationCount: conversationAnalyses.filter(
        (item) => item.isSuccessful,
      ).length,
      completedConversationCount: conversationAnalyses.filter(
        (item) => item.isCompleted,
      ).length,
      failedConversationCount: conversationAnalyses.filter(
        (item) => item.outcomeStatus === 'lost' || item.outcomeStatus === 'stalled',
      ).length,
      findingsCount: findings.length,
      findings,
      conversationAnalyses,
      managerPatternCandidates,
      limitations: LEARNING_LIMITATIONS,
    };

    return this.storage.save(report);
  }

  async getReport(runId: string): Promise<LearningRunReportRecord> {
    const report = await this.storage.getById(runId);
    if (!report) {
      throw new NotFoundException({
        message: 'Learning analysis report not found',
        runId,
      });
    }

    return report;
  }

  async createProposalFromFinding(
    findingId: string,
    payload: LearningFindingCreateProposalDto,
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<CuratorProposalRecord> {
    const report = await this.getReport(payload.sourceLearningRunId);
    const finding = report.findings.find((item) => item.findingId === findingId);

    if (!finding) {
      throw new NotFoundException({
        message: 'Learning finding not found in the specified run',
        findingId,
        sourceLearningRunId: payload.sourceLearningRunId,
      });
    }

    const targetPath =
      payload.targetArtifactOverride?.trim() ||
      finding.suggestedArtifacts[0] ||
      finding.suspectedArtifacts[0] ||
      null;
    const artifactType = this.resolveArtifactType(targetPath, finding.category);
    const targetKey = targetPath ? null : finding.category;
    const changeType = payload.changeType ?? 'clarify';

    return this.curatorAssistantService.createProposalDraft(
      {
        conversationId: `learning:${report.runId}:${finding.findingId}`,
        targetWorkspace: 'assistant-dev',
        artifactType,
        targetKey: targetKey ?? undefined,
        targetPath: targetPath ?? undefined,
        changeType,
        reason: this.buildProposalReason(finding),
        proposedContent: this.buildProposalContent(report, finding, {
          targetPath,
          artifactType,
          changeType,
        }),
        sourceLearningRunId: report.runId,
        sourceFindingId: finding.findingId,
      },
      actor,
    );
  }

  private normalizeFilters(
    payload: LearningBatchRunRequestDto,
  ): LearningRunFiltersRecord {
    const source = payload.source?.trim().toLowerCase() || null;
    const customerIds = (payload.customerIds ?? []).filter((value) => value > 0);

    if (!source && customerIds.length === 0) {
      throw new BadRequestException({
        message:
          'Learning batch analysis requires either source or explicit customerIds',
      });
    }

    return {
      source: source ?? DEFAULT_SOURCE,
      customerIds,
      statusIds: (payload.statusIds ?? []).filter((value) => value > 0),
      managerIds: (payload.managerIds ?? []).filter((value) => value > 0),
      tagIds: (payload.tagIds ?? []).filter((value) => value > 0),
      maxConversations: payload.maxConversations ?? DEFAULT_MAX_CONVERSATIONS,
      historyCount: Math.min(
        payload.historyCount ?? DEFAULT_HISTORY_COUNT,
        MAX_HISTORY_COUNT,
      ),
    };
  }

  private async selectCustomers(filters: LearningRunFiltersRecord) {
    const where: Prisma.CrmCustomerWhereInput = {
      AND: [
        filters.customerIds.length
          ? { id: { in: filters.customerIds } }
          : {
              account: {
                is: {
                  code: filters.source,
                },
              },
            },
        {
          vk: {
            is: {
              externalId: {
                not: '',
              },
            },
          },
        },
        filters.statusIds.length ? { crmStatusId: { in: filters.statusIds } } : {},
        filters.managerIds.length ? { managerId: { in: filters.managerIds } } : {},
        filters.tagIds.length
          ? {
              tags: {
                some: {
                  tagId: {
                    in: filters.tagIds,
                  },
                },
              },
            }
          : {},
      ],
    };

    return this.prisma.crmCustomer.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: filters.maxConversations,
      select: {
        id: true,
        fullName: true,
        shortNotes: true,
        comments: true,
        updatedAt: true,
        account: {
          select: {
            code: true,
            name: true,
          },
        },
        manager: {
          select: {
            fullName: true,
          },
        },
        crmStatus: {
          select: {
            name: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        vk: {
          select: {
            externalId: true,
            name: true,
          },
        },
      },
    });
  }

  private async buildConversationInput(customerId: number, historyCount: number) {
    const customer = await this.prisma.crmCustomer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        shortNotes: true,
        comments: true,
        account: {
          select: {
            code: true,
            name: true,
          },
        },
        manager: {
          select: {
            fullName: true,
          },
        },
        crmStatus: {
          select: {
            name: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        vk: {
          select: {
            externalId: true,
            name: true,
          },
        },
      },
    });

    if (!customer?.vk?.externalId?.trim()) {
      throw new BadRequestException(
        'Customer VK dialog is unavailable for learning analysis',
      );
    }

    const historyResult = await this.communicationsService.getVkDialogHistory(
      customerId,
      {
        count: String(historyCount),
      },
    );

    if (historyResult.status >= 400) {
      throw new BadGatewayException({
        message: 'Не удалось получить историю VK-диалога для learning analysis',
        customerId,
        vkServiceStatus: historyResult.status,
      });
    }

    const historyData = (historyResult.data || {}) as VkHistoryResponse;
    if (historyData.error) {
      throw new BadGatewayException({
        message: 'VK API returned an error during learning analysis',
        customerId,
        vkError: historyData.error,
      });
    }

    const items = Array.isArray(historyData.response?.items)
      ? historyData.response?.items ?? []
      : [];

    if (!items.length) {
      throw new BadGatewayException({
        message: 'VK history is empty for learning analysis',
        customerId,
      });
    }

    const messages = [...items]
      .sort((left, right) => (left.date ?? 0) - (right.date ?? 0))
      .filter((item) => (item.text ?? '').trim().length > 0)
      .map((item) => ({
        id: item.id ? String(item.id) : undefined,
        role: item.out === 1 ? ('manager' as const) : ('customer' as const),
        text: (item.text ?? '').trim(),
        createdAt: item.date
          ? new Date(item.date * 1000).toISOString()
          : undefined,
      }));

    const tagNames = customer.tags
      .map((entry) => entry.tag?.name ?? '')
      .filter(Boolean);

    const dto: CuratorAnalyzeDto = {
      conversationId: customer.vk.externalId.trim(),
      conversationContext: {
        messages,
        summary: this.buildConversationSummary(messages),
        crmContext: {
          customerId: customer.id,
          customerName: customer.fullName ?? '',
          accountCode: customer.account?.code ?? '',
          accountName: customer.account?.name ?? '',
          managerName: customer.manager?.fullName ?? '',
          crmStatusName: customer.crmStatus?.name ?? '',
          vkName: customer.vk?.name ?? '',
          tags: tagNames,
          shortNotes: customer.shortNotes ?? '',
          comments: customer.comments ?? '',
        },
      },
      curatorQuestion:
        'Проанализируй этот реальный клиентский диалог для phase-aware learning analysis. Учитывай общий outcome, внутренние фазы диалога, отличай успешный core sales/service flow от post-sale marketing и не обесценивай успешные core phases из-за поздних промо-сообщений. Если draft уместен, верни structured proposalDrafts по текущей схеме.',
    };

    return {
      dto,
      messages,
      crmStatusName: customer.crmStatus?.name ?? '',
    };
  }

  private detectOutcome(
    crmStatusName: string,
    messages: Array<{ role: 'customer' | 'manager'; text: string }>,
  ): OutcomeDetectionResult {
    const status = crmStatusName.toLowerCase();
    const fullText = messages.map((item) => item.text.toLowerCase()).join(' ');

    const statusHas = (...parts: string[]) => parts.some((part) => status.includes(part));
    const textHas = (...parts: string[]) => parts.some((part) => fullText.includes(part));
    const managerHas = (...parts: string[]) =>
      messages.some(
        (item) => item.role === 'manager' && parts.some((part) => item.text.toLowerCase().includes(part)),
      );
    const customerHas = (...parts: string[]) =>
      messages.some(
        (item) => item.role === 'customer' && parts.some((part) => item.text.toLowerCase().includes(part)),
      );

    if (
      statusHas('выполн', 'заверш', 'достав', 'выдан', 'получ') ||
      (textHas('достав', 'получили', 'получил', 'забрали') &&
        customerHas('спасибо', 'получили', 'понрав'))
    ) {
      return {
        outcomeStatus: 'completed',
        isSuccessful: true,
        isCompleted: true,
        paymentStage: 'fully_paid',
        notes: ['Detected completed outcome from CRM status or delivery/final confirmation messages.'],
      };
    }

    if (
      statusHas('полная оплата', 'вторая оплата', 'оплач', 'полностью') ||
      textHas('полностью оплат', 'остаток оплат', 'вторую оплат', 'доплат')
    ) {
      return {
        outcomeStatus: 'fully_paid',
        isSuccessful: true,
        isCompleted: false,
        paymentStage: 'fully_paid',
        notes: ['Detected full payment stage from CRM status or payment messages.'],
      };
    }

    if (
      statusHas('предоплат', 'аванс', 'первая оплата') ||
      textHas('предоплат', 'аванс', 'внесли оплату', 'первую оплат')
    ) {
      return {
        outcomeStatus: 'deposit_paid',
        isSuccessful: true,
        isCompleted: false,
        paymentStage: 'deposit_paid',
        notes: ['Detected deposit payment stage from CRM status or dialog messages.'],
      };
    }

    if (
      statusHas('потер', 'отказ', 'неакту', 'не интересно') ||
      customerHas('не интересно', 'неактуально', 'не будем', 'отказываюсь')
    ) {
      return {
        outcomeStatus: 'lost',
        isSuccessful: false,
        isCompleted: false,
        paymentStage: 'none',
        notes: ['Detected lost outcome from CRM status or explicit customer refusal.'],
      };
    }

    if (
      textHas('цена', 'стоимость', 'сколько стоит', 'стоит') ||
      managerHas('стоимость', 'вариант', 'формат', 'журналь')
    ) {
      return {
        outcomeStatus: 'price_discussed',
        isSuccessful: false,
        isCompleted: false,
        paymentStage: 'none',
        notes: ['Detected pricing discussion in the dialog.'],
      };
    }

    if (
      managerHas('сколько фотографий', 'какой формат', 'для какого повода', 'какой бюджет') ||
      textHas('фотограф', 'формат', 'бюджет')
    ) {
      return {
        outcomeStatus: 'qualified',
        isSuccessful: false,
        isCompleted: false,
        paymentStage: 'none',
        notes: ['Detected qualification stage in the dialog.'],
      };
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'manager' && messages.length > 4) {
      return {
        outcomeStatus: 'stalled',
        isSuccessful: false,
        isCompleted: false,
        paymentStage: 'none',
        notes: ['Conversation currently looks stalled: the latest visible step is a manager message without further customer movement.'],
      };
    }

    return {
      outcomeStatus: 'lead_only',
      isSuccessful: false,
      isCompleted: false,
      paymentStage: 'none',
      notes: ['No reliable deeper outcome signal detected; treating the dialog as early-stage lead communication.'],
    };
  }

  private detectPhases(
    messages: Array<{
      id?: string;
      role: 'customer' | 'manager';
      text: string;
      createdAt?: string;
    }>,
  ): ConversationPhaseSegment[] {
    if (!messages.length) {
      return [];
    }

    const labels = messages.map((message, index) =>
      this.detectPhaseTypeForMessage(message.text, index, messages),
    );

    const segments: ConversationPhaseSegment[] = [];
    let currentType = labels[0];
    let startIndex = 0;

    for (let index = 1; index <= labels.length; index += 1) {
      const nextType = labels[index];
      if (index === labels.length || nextType !== currentType) {
        segments.push({
          phaseType: currentType,
          startMessageIndex: startIndex,
          endMessageIndex: index - 1,
          messages: messages.slice(startIndex, index),
        });
        currentType = nextType;
        startIndex = index;
      }
    }

    return segments;
  }

  private detectPhaseTypeForMessage(
    text: string,
    index: number,
    messages: Array<{ role: 'customer' | 'manager'; text: string }>,
  ): LearningPhaseType {
    const normalized = text.toLowerCase();
    const laterInDialog = index > Math.floor(messages.length * 0.6);

    if (
      this.matchesAny(normalized, [
        'скидк',
        'акци',
        'повтор',
        'еще одну',
        'ещё одну',
        'новый заказ',
        'промокод',
      ]) &&
      laterInDialog
    ) {
      return 'post_purchase_marketing';
    }

    if (
      this.matchesAny(normalized, [
        'понрав',
        'отзыв',
        'как вам',
        'получили',
        'получил',
        'доволь',
      ]) &&
      laterInDialog
    ) {
      return 'post_delivery_feedback';
    }

    if (
      this.matchesAny(normalized, [
        'доставка',
        'отправ',
        'производств',
        'печать',
        'трек',
        'получите',
      ])
    ) {
      return 'production_delivery';
    }

    if (
      this.matchesAny(normalized, [
        'макет',
        'утверж',
        'согласов',
        'правк',
        'дизайнер',
      ])
    ) {
      return 'design_approval';
    }

    if (
      this.matchesAny(normalized, [
        'фотограф',
        'фото',
        'загруз',
        'отправьте',
        'присылайте',
      ])
    ) {
      return 'photo_collection';
    }

    if (
      this.matchesAny(normalized, [
        'оплат',
        'предоплат',
        'аванс',
        'доплат',
        'перевод',
      ])
    ) {
      return 'payment_conversion';
    }

    if (
      this.matchesAny(normalized, [
        'стоим',
        'цена',
        'вариант',
        'формат',
        '20×20',
        '20x20',
      ])
    ) {
      return 'pricing';
    }

    if (
      this.matchesAny(normalized, [
        'сколько фотографий',
        'для какого повода',
        'какой бюджет',
        'какой формат',
        'какая книга',
      ])
    ) {
      return 'qualification';
    }

    if (index <= 1) {
      return 'lead_intake';
    }

    return 'qualification';
  }

  private buildPhaseAnalyses(
    segments: ConversationPhaseSegment[],
    outcome: OutcomeDetectionResult,
    successfulPatterns: LearningSuccessfulPatternRecord[],
  ): LearningPhaseAnalysisRecord[] {
    return segments.map((segment) => {
      const segmentText = segment.messages
        .map((message) => message.text.toLowerCase())
        .join(' ');
      const positivePatterns = successfulPatterns
        .filter((pattern) =>
          segment.messages.some((message) =>
            message.text.includes(pattern.exampleManagerMessage),
          ),
        )
        .map((pattern) => pattern.title);
      const issues: string[] = [];
      const notes: string[] = [];

      if (
        segment.phaseType === 'post_purchase_marketing' &&
        this.matchesAny(segmentText, ['акци', 'скидк', 'повтор', 'еще одну', 'новый заказ'])
      ) {
        issues.push(
          this.detectPostSaleMarketingIssue(segmentText, outcome),
        );
        notes.push(
          'Поздний post-sale outreach должен анализироваться отдельно и не обесценивать успешный core flow.',
        );
      }

      if (
        segment.phaseType === 'pricing' &&
        this.matchesAny(segmentText, ['какой вариант', 'что ближе', 'какой формат'])
      ) {
        positivePatterns.push('successful_pricing_choice_followup');
      }

      let phaseOutcome: LearningPhaseAnalysisRecord['phaseOutcome'] = 'neutral';
      if (positivePatterns.length > 0) {
        phaseOutcome = 'successful';
      } else if (issues.length > 0) {
        phaseOutcome = 'risky';
      } else if (
        outcome.isSuccessful &&
        PHASE_ORDER.indexOf(segment.phaseType) <=
          PHASE_ORDER.indexOf(this.maxSuccessfulPhase(outcome))
      ) {
        phaseOutcome = 'successful';
      } else if (segment.phaseType === 'post_purchase_marketing') {
        phaseOutcome = issues.length ? 'risky' : 'mixed';
      } else if (segment.phaseType === 'lead_intake' || segment.phaseType === 'qualification') {
        phaseOutcome = 'mixed';
      }

      return {
        phaseType: segment.phaseType,
        startMessageIndex: segment.startMessageIndex,
        endMessageIndex: segment.endMessageIndex,
        phaseOutcome,
        positivePatterns: Array.from(new Set(positivePatterns)),
        issues,
        notes,
      };
    });
  }

  private detectPostSaleMarketingIssue(
    segmentText: string,
    outcome: OutcomeDetectionResult,
  ): string {
    if (
      outcome.isCompleted &&
      this.matchesAny(segmentText, ['акци', 'скидк', 'промокод', 'спецпредлож'])
    ) {
      return 'aggressive_promo_after_positive_feedback';
    }

    if (
      this.matchesAny(segmentText, ['повтор', 'еще одну', 'ещё одну', 'новый заказ']) &&
      !this.matchesAny(segmentText, ['если захотите', 'когда будет удобно', 'при необходимости'])
    ) {
      return 'repeat_offer_without_interest_signal';
    }

    if (
      outcome.isSuccessful &&
      this.matchesAny(segmentText, ['новый заказ', 'акци', 'скидк', 'напоминаю'])
    ) {
      return 'context_ignored_after_completed_order';
    }

    return 'post_purchase_marketing_mismatch';
  }

  private maxSuccessfulPhase(outcome: OutcomeDetectionResult): LearningPhaseType {
    if (outcome.isCompleted) {
      return 'post_delivery_feedback';
    }
    if (outcome.paymentStage === 'fully_paid') {
      return 'production_delivery';
    }
    if (outcome.paymentStage === 'deposit_paid') {
      return 'payment_conversion';
    }
    if (outcome.outcomeStatus === 'price_discussed') {
      return 'pricing';
    }
    if (outcome.outcomeStatus === 'qualified') {
      return 'qualification';
    }
    return 'lead_intake';
  }

  private async detectManagerDerivedCandidates(
    messages: Array<{
      role: 'customer' | 'manager' | 'assistant' | 'system';
      text: string;
    }>,
  ) {
    const managerMessages = messages.filter((message) => message.role === 'manager');
    const matched = new Map<string, LearningManagerCandidateRecord>();

    for (const message of managerMessages) {
      const normalized = message.text.toLowerCase();
      for (const rule of MANAGER_CANDIDATE_RULES) {
        const matchCount = rule.detectionKeywords.filter((keyword) =>
          normalized.includes(keyword),
        ).length;

        if (matchCount === 0) {
          continue;
        }

        if (matchCount === 1 && rule.detectionKeywords.length > 2) {
          continue;
        }

        if (matched.has(rule.key)) {
          continue;
        }

        const coverage = await this.assessCoverage({
          key: rule.key,
          suspectedArtifacts: rule.suspectedArtifacts,
          searchKeywords: rule.searchKeywords,
        });

        matched.set(rule.key, {
          candidateId: randomUUID(),
          category: rule.category,
          summary: rule.summary,
          exampleManagerMessage: this.truncateText(message.text, 280),
          suspectedArtifacts: coverage.suggestedArtifacts,
          coverageStatus: coverage.coverageStatus,
          notes: [`Rule: ${rule.key}`, coverage.note],
        });
      }
    }

    const values = Array.from(matched.values());

    return {
      managerKnowledgeCandidates: values.filter((item) =>
        MANAGER_CANDIDATE_RULES.find((rule) => rule.category === item.category)
          ?.improvementType === 'knowledge_gap',
      ),
      managerProcessCandidates: values.filter((item) =>
        MANAGER_CANDIDATE_RULES.find((rule) => rule.category === item.category)
          ?.improvementType === 'process_gap',
      ),
      managerFollowUpCandidates: values.filter((item) => {
        const type = MANAGER_CANDIDATE_RULES.find(
          (rule) => rule.category === item.category,
        )?.improvementType;
        return type === 'followup_gap' || type === 'script_gap';
      }),
    };
  }

  private async extractSuccessfulPatterns(
    segments: ConversationPhaseSegment[],
    outcome: OutcomeDetectionResult,
  ): Promise<LearningSuccessfulPatternRecord[]> {
    if (!outcome.isSuccessful) {
      return [];
    }

    const patterns: LearningSuccessfulPatternRecord[] = [];

    for (const rule of SUCCESSFUL_PATTERN_RULES) {
      const matchingSegment = segments.find(
        (segment) =>
          rule.phaseTypes.includes(segment.phaseType) &&
          segment.messages.some(
            (message) =>
              message.role === 'manager' &&
              rule.detectionKeywords.some((keyword) =>
                message.text.toLowerCase().includes(keyword),
              ),
          ),
      );

      if (!matchingSegment) {
        continue;
      }

      const exampleManagerMessage =
        matchingSegment.messages.find(
          (message) =>
            message.role === 'manager' &&
            rule.detectionKeywords.some((keyword) =>
              message.text.toLowerCase().includes(keyword),
            ),
        )?.text ?? matchingSegment.messages[0]?.text ?? '';

      const coverage = await this.assessCoverage({
        key: rule.key,
        suspectedArtifacts: rule.suggestedArtifacts,
        searchKeywords: rule.searchKeywords,
      });

      patterns.push({
        patternId: randomUUID(),
        title: rule.title,
        summary: rule.summary,
        exampleManagerMessage: this.truncateText(exampleManagerMessage, 280),
        suggestedArtifacts: coverage.suggestedArtifacts,
        coverageStatus: coverage.coverageStatus,
        notes: [coverage.note, `Phase types: ${rule.phaseTypes.join(', ')}`],
      });
    }

    return patterns;
  }

  private buildConversationSummary(
    messages: Array<{ role: 'customer' | 'manager'; text: string }>,
  ) {
    const lastMessages = messages.slice(-6).map((message) => ({
      role: message.role,
      text: this.truncateText(message.text, 180),
    }));

    return lastMessages
      .map((message) =>
        `${message.role === 'customer' ? 'Клиент' : 'Менеджер'}: ${message.text}`,
      )
      .join('\n');
  }

  private buildConversationAnalysisRecord(input: {
    customerId: number;
    customerName: string;
    sourceAnalysisId: string;
    conversationId: string;
    summary: string;
    improvementFocus: string[];
    proposalDrafts: Array<{
      artifactType: string;
      targetKey: string | null;
      targetPath: string | null;
      reason: string;
    }>;
    whyAssistantAnsweredThisWay: string;
    managerCandidates: {
      managerKnowledgeCandidates: LearningManagerCandidateRecord[];
      managerProcessCandidates: LearningManagerCandidateRecord[];
      managerFollowUpCandidates: LearningManagerCandidateRecord[];
    };
    outcome: OutcomeDetectionResult;
    phaseAnalyses: LearningPhaseAnalysisRecord[];
    successfulPatterns: LearningSuccessfulPatternRecord[];
    managerPatternCandidates: LearningManagerPatternCandidateRecord[];
  }): LearningConversationAnalysisRecord {
    const normalizedText = [
      input.summary,
      input.whyAssistantAnsweredThisWay,
      ...input.improvementFocus,
      ...input.proposalDrafts.map((draft) =>
        [draft.reason, draft.targetPath, draft.targetKey, draft.artifactType]
          .filter(Boolean)
          .join(' '),
      ),
    ]
      .join(' ')
      .toLowerCase();

    const categories = LEARNING_CATEGORIES
      .filter((category) =>
        category.keywords.some((keyword) => normalizedText.includes(keyword)),
      )
      .map((category) => category.key);

    const rawExtractedIssues = Array.from(
      new Set(categories.length ? categories : ['weak_progression']),
    );

    const postSaleIssues = input.phaseAnalyses
      .filter((phase) => phase.phaseType === 'post_purchase_marketing')
      .flatMap((phase) => phase.issues);

    const extractedIssues = input.outcome.isSuccessful
      ? Array.from(new Set(postSaleIssues))
      : rawExtractedIssues;

    const suspectedArtifacts = Array.from(
      new Set([
        ...input.proposalDrafts.flatMap((draft) =>
          [draft.targetPath, draft.targetKey].filter(
            (value): value is string => Boolean(value && value.trim()),
          ),
        ),
        ...rawExtractedIssues.flatMap(
          (category) =>
            LEARNING_CATEGORIES.find((item) => item.key === category)
              ?.defaultArtifacts ?? [],
        ),
        ...input.successfulPatterns.flatMap((pattern) => pattern.suggestedArtifacts),
        ...input.managerPatternCandidates.map(
          (candidate) => candidate.suggestedArtifactPath,
        ),
      ]),
    );

    return {
      conversationId: input.conversationId,
      customerId: input.customerId,
      customerName: input.customerName,
      sourceAnalysisId: input.sourceAnalysisId,
      outcomeStatus: input.outcome.outcomeStatus,
      isSuccessful: input.outcome.isSuccessful,
      isCompleted: input.outcome.isCompleted,
      paymentStage: input.outcome.paymentStage,
      shortSummary: input.summary,
      extractedIssues,
      successfulPatterns: input.successfulPatterns,
      phaseAnalyses: input.phaseAnalyses,
      managerPatternCandidates: input.managerPatternCandidates,
      notes: Array.from(
        new Set([
          input.whyAssistantAnsweredThisWay,
          ...input.improvementFocus,
          ...input.outcome.notes,
        ]),
      ).filter(Boolean),
      suspectedArtifacts,
      managerKnowledgeCandidates: input.managerCandidates.managerKnowledgeCandidates,
      managerProcessCandidates: input.managerCandidates.managerProcessCandidates,
      managerFollowUpCandidates: input.managerCandidates.managerFollowUpCandidates,
    };
  }

  private buildAssistantWeaknessEvidences(
    analysis: LearningConversationAnalysisRecord,
  ): LearningIssueEvidence[] {
    if (analysis.isSuccessful) {
      return [];
    }

    return analysis.extractedIssues.map((category) => {
      const definition = LEARNING_CATEGORIES.find((item) => item.key === category);

      return {
        groupKey: `assistant:${category}`,
        category,
        improvementType: definition?.improvementType ?? 'script_gap',
        title: definition?.title ?? category,
        summary:
          definition?.summary ??
          'Найдена повторяющаяся проблема в ответах ассистента.',
        conversationId: analysis.conversationId,
        phaseType: null,
        isSuccessful: analysis.isSuccessful,
        exampleManagerMessage: null,
        suspectedArtifacts: analysis.suspectedArtifacts,
        suggestedArtifacts:
          definition?.defaultArtifacts ?? analysis.suspectedArtifacts,
        coverageStatus: 'uncertain',
        whyNotCovered:
          'Этот finding построен из assistant weakness aggregation и не проходил прямую coverage-проверку по brain artifacts.',
        recommendation:
          definition?.recommendation ??
          'Проверить связанные brain artifacts и curator findings по этим диалогам.',
        recommendedAction:
          definition?.recommendation ??
          'Проверить связанные brain artifacts и curator findings по этим диалогам.',
      };
    });
  }

  private buildManagerCandidateEvidences(
    analysis: LearningConversationAnalysisRecord,
  ): LearningIssueEvidence[] {
    const candidates = [
      ...analysis.managerKnowledgeCandidates,
      ...analysis.managerProcessCandidates,
      ...analysis.managerFollowUpCandidates,
    ];

    return candidates.map((candidate) => {
      const rule = MANAGER_CANDIDATE_RULES.find(
        (item) => item.category === candidate.category,
      );

      return {
        groupKey: `manager:${candidate.category}`,
        category: candidate.category,
        improvementType: rule?.improvementType ?? 'knowledge_gap',
        title: rule?.title ?? candidate.category,
        summary: candidate.summary,
        conversationId: analysis.conversationId,
        phaseType: this.guessPhaseTypeForCandidate(candidate.category),
        isSuccessful: analysis.isSuccessful,
        exampleManagerMessage: candidate.exampleManagerMessage,
        suspectedArtifacts: candidate.suspectedArtifacts,
        suggestedArtifacts: candidate.suspectedArtifacts,
        coverageStatus: candidate.coverageStatus,
        whyNotCovered: candidate.notes[1] ?? null,
        recommendation: rule?.recommendation ?? candidate.summary,
        recommendedAction: rule?.recommendation ?? candidate.summary,
      };
    });
  }

  private buildManagerPatternGapEvidences(
    analysis: LearningConversationAnalysisRecord,
  ): LearningIssueEvidence[] {
    return analysis.managerPatternCandidates
      .filter(
        (candidate) =>
          candidate.candidateType === 'operational_knowledge_candidate' &&
          candidate.coverageStatus !== 'covered',
      )
      .map((candidate) => {
        const blockerPhase = [
          'payment_conversion',
          'photo_collection',
          'design_approval',
          'production_delivery',
        ].includes(candidate.phaseType);

        return {
          groupKey: `operational:${candidate.title}:${candidate.phaseType}`,
          category: blockerPhase
            ? 'sales_blocker_knowledge_gap'
            : 'critical_operational_gap',
          improvementType:
            candidate.suggestedArtifactType === 'knowledge_faq'
              ? 'knowledge_gap'
              : 'process_gap',
          title: blockerPhase
            ? `Sales blocker knowledge gap: ${candidate.title}`
            : `Critical operational gap: ${candidate.title}`,
          summary: [
            candidate.summary,
            candidate.operationalImportance,
          ]
            .filter(Boolean)
            .join(' '),
          conversationId: analysis.conversationId,
          phaseType: candidate.phaseType,
          isSuccessful: analysis.isSuccessful,
          exampleManagerMessage: candidate.exampleManagerMessages[0] ?? null,
          suspectedArtifacts: [candidate.suggestedArtifactPath],
          suggestedArtifacts: [candidate.suggestedArtifactPath],
          coverageStatus: candidate.coverageStatus,
          whyNotCovered:
            'Операционное знание из реального manager flow найдено в диалоге, но текущий assistant brain покрывает его не полностью.',
          recommendation:
            'Проверить, чтобы это operational knowledge было явно зафиксировано в instructions/scripts/FAQ для прохождения воронки.',
          recommendedAction:
            'Добавить или усилить operational knowledge в suggested artifact и затем проверить его через eval/publish flow.',
        };
      });
  }

  private buildSuccessfulPatternEvidences(
    analysis: LearningConversationAnalysisRecord,
  ): LearningIssueEvidence[] {
    return analysis.successfulPatterns.map((pattern) => ({
      groupKey: `success:${pattern.title}`,
      category: pattern.title.toLowerCase().replace(/\s+/g, '_'),
      improvementType: 'successful_pattern',
      title: pattern.title,
      summary: pattern.summary,
      conversationId: analysis.conversationId,
      phaseType: this.guessPhaseTypeForSuccessfulPattern(pattern.title),
      isSuccessful: true,
      exampleManagerMessage: pattern.exampleManagerMessage,
      suspectedArtifacts: pattern.suggestedArtifacts,
      suggestedArtifacts: pattern.suggestedArtifacts,
      coverageStatus: pattern.coverageStatus,
      whyNotCovered: pattern.notes[0] ?? null,
      recommendation:
        'Это успешный паттерн из реального диалога, который можно использовать как источник улучшений для assistant brain.',
      recommendedAction:
        'Проверить, можно ли формализовать этот успешный паттерн в scripts/FAQ/rules без потери клиентского тона.',
    }));
  }

  private buildPostSaleMarketingEvidences(
    analysis: LearningConversationAnalysisRecord,
  ): LearningIssueEvidence[] {
    return analysis.phaseAnalyses
      .filter(
        (phase) =>
          phase.phaseType === 'post_purchase_marketing' && phase.issues.length > 0,
      )
      .map((phase) => {
        const issue = phase.issues[0] ?? 'post_purchase_marketing_mismatch';
        const issueMeta = this.describePostSaleIssue(issue);

        return {
          groupKey: `postsale:${issue}`,
          category: issue,
          improvementType: 'followup_gap' as const,
          title: issueMeta.title,
          summary: issueMeta.summary,
          conversationId: analysis.conversationId,
          phaseType: 'post_purchase_marketing' as const,
          isSuccessful: analysis.isSuccessful,
          exampleManagerMessage: null,
          suspectedArtifacts: issueMeta.artifacts,
          suggestedArtifacts: issueMeta.artifacts,
          coverageStatus: 'uncertain' as const,
          whyNotCovered:
            'Post-sale marketing logic оценивается отдельно от успешного core flow и требует phase-specific refinement.',
          recommendation: issueMeta.recommendation,
          recommendedAction:
            'Сделать отдельный review для post-sale outreach, не смешивая его с core sales/fulfillment path.',
        };
      });
  }

  private describePostSaleIssue(issue: string): {
    title: string;
    summary: string;
    recommendation: string;
    artifacts: string[];
  } {
    const sharedArtifacts = [
      'knowledge/scripts/follow-ups.json',
      '.agent/CUSTOMER_PLAYBOOK.md',
    ];

    if (issue === 'repeat_offer_without_interest_signal') {
      return {
        title: 'Повторный оффер без сигнала интереса',
        summary:
          'После завершённого или стабильного диалога менеджер повторно предлагает новый заказ без явного interest signal со стороны клиента.',
        recommendation:
          'Ослабить повторный оффер и добавить мягкий permission-based re-engagement после успешного заказа.',
        artifacts: sharedArtifacts,
      };
    }

    if (issue === 'aggressive_promo_after_positive_feedback') {
      return {
        title: 'Слишком резкий промо-оффер после позитивного фидбека',
        summary:
          'После позитивного post-delivery feedback диалог резко переключается в promotional outreach и теряет контекст удовлетворённого клиента.',
        recommendation:
          'Добавить мягкий шаблон post-delivery outreach: сначала благодарность и подтверждение satisfaction, затем только опциональный next offer.',
        artifacts: sharedArtifacts,
      };
    }

    if (issue === 'context_ignored_after_completed_order') {
      return {
        title: 'Игнорирование контекста завершённого заказа',
        summary:
          'Post-sale outreach не учитывает, что core order уже успешно завершён, и выглядит как отдельный несвязанный оффер.',
        recommendation:
          'Явно разделить completed-order feedback и future-offer logic в follow-up scripts.',
        artifacts: sharedArtifacts,
      };
    }

    return {
      title: 'Проблема post-purchase marketing',
      summary:
        'После успешного core flow обнаружен отдельный marketing/re-engagement issue, который не должен занижать оценку успешной сделки.',
      recommendation:
        'Отдельно скорректировать post-purchase marketing/re-engagement tone и progression logic.',
      artifacts: sharedArtifacts,
    };
  }

  private aggregateFindings(
    evidences: LearningIssueEvidence[],
  ): LearningFindingRecord[] {
    const grouped = new Map<
      string,
      {
        category: string;
        improvementType: LearningImprovementType;
        title: string;
        summary: string;
        conversationIds: Set<string>;
        exampleManagerMessages: Set<string>;
        suspectedArtifacts: Set<string>;
        suggestedArtifacts: Set<string>;
        coverageStatuses: Set<LearningCoverageStatus>;
        whyNotCovered: string | null;
        recommendation: string;
        recommendedAction: string;
        successEvidenceCount: number;
        failureEvidenceCount: number;
        phaseTypes: Set<LearningPhaseType>;
      }
    >();

    for (const evidence of evidences) {
      const current =
        grouped.get(evidence.groupKey) ?? {
          category: evidence.category,
          improvementType: evidence.improvementType,
          title: evidence.title,
          summary: evidence.summary,
          conversationIds: new Set<string>(),
          exampleManagerMessages: new Set<string>(),
          suspectedArtifacts: new Set<string>(),
          suggestedArtifacts: new Set<string>(),
          coverageStatuses: new Set<LearningCoverageStatus>(),
          whyNotCovered: evidence.whyNotCovered,
          recommendation: evidence.recommendation,
          recommendedAction: evidence.recommendedAction,
          successEvidenceCount: 0,
          failureEvidenceCount: 0,
          phaseTypes: new Set<LearningPhaseType>(),
        };

      current.conversationIds.add(evidence.conversationId);
      if (evidence.isSuccessful) {
        current.successEvidenceCount += 1;
      } else {
        current.failureEvidenceCount += 1;
      }
      if (evidence.exampleManagerMessage) {
        current.exampleManagerMessages.add(evidence.exampleManagerMessage);
      }
      if (evidence.phaseType) {
        current.phaseTypes.add(evidence.phaseType);
      }
      for (const artifact of evidence.suspectedArtifacts) {
        current.suspectedArtifacts.add(artifact);
      }
      for (const artifact of evidence.suggestedArtifacts) {
        current.suggestedArtifacts.add(artifact);
      }
      current.coverageStatuses.add(evidence.coverageStatus);
      if (!current.whyNotCovered && evidence.whyNotCovered) {
        current.whyNotCovered = evidence.whyNotCovered;
      }
      grouped.set(evidence.groupKey, current);
    }

    return Array.from(grouped.values())
      .map((evidence) => ({
        findingId: randomUUID(),
        category: evidence.category,
        improvementType: evidence.improvementType,
        title: evidence.title,
        summary: evidence.summary,
        evidenceCount: evidence.conversationIds.size,
        successEvidenceCount: evidence.successEvidenceCount,
        failureEvidenceCount: evidence.failureEvidenceCount,
        exampleConversationIds: Array.from(evidence.conversationIds).slice(0, 8),
        exampleManagerMessages: Array.from(evidence.exampleManagerMessages).slice(
          0,
          3,
        ),
        suspectedArtifacts: Array.from(evidence.suspectedArtifacts),
        suggestedArtifacts: Array.from(evidence.suggestedArtifacts),
        coverageStatus: this.mergeCoverageStatuses(
          Array.from(evidence.coverageStatuses),
        ),
        whyNotCovered: evidence.whyNotCovered,
        recommendation: evidence.recommendation,
        recommendedAction: evidence.recommendedAction,
        phaseTypes: Array.from(evidence.phaseTypes),
        status: 'open' as const,
      }))
      .sort((left, right) => {
        const leftScore =
          left.improvementType === 'successful_pattern'
            ? left.successEvidenceCount * 10
            : left.failureEvidenceCount * 10 + left.evidenceCount;
        const rightScore =
          right.improvementType === 'successful_pattern'
            ? right.successEvidenceCount * 10
            : right.failureEvidenceCount * 10 + right.evidenceCount;
        return rightScore - leftScore;
      });
  }

  private aggregateManagerPatternCandidates(
    candidates: LearningManagerPatternCandidateRecord[],
  ): LearningManagerPatternCandidateRecord[] {
    const grouped = new Map<
      string,
      {
        base: LearningManagerPatternCandidateRecord;
        messages: Set<string>;
        conversationIds: Set<string>;
        evidenceCount: number;
        confidences: Array<'low' | 'medium' | 'high'>;
        coverageStatuses: LearningCoverageStatus[];
      }
    >();

    for (const candidate of candidates) {
      const key = [
        candidate.candidateType,
        candidate.title,
        candidate.suggestedArtifactPath,
        candidate.phaseType,
      ].join('|');
      const current = grouped.get(key) ?? {
        base: candidate,
        messages: new Set<string>(),
        conversationIds: new Set<string>(),
        evidenceCount: 0,
        confidences: [],
        coverageStatuses: [],
      };

      for (const message of candidate.exampleManagerMessages) {
        current.messages.add(message);
      }
      for (const conversationId of candidate.sourceConversationIds) {
        current.conversationIds.add(conversationId);
      }
      current.evidenceCount += candidate.evidenceCount;
      current.confidences.push(candidate.confidence);
      current.coverageStatuses.push(candidate.coverageStatus);
      grouped.set(key, current);
    }

    const confidenceRank = { low: 1, medium: 2, high: 3 } as const;

    return Array.from(grouped.values())
      .map(({ base, messages, conversationIds, evidenceCount, confidences, coverageStatuses }) => ({
        ...base,
        exampleManagerMessages: Array.from(messages).slice(0, 3),
        sourceConversationIds: Array.from(conversationIds).slice(0, 8),
        evidenceCount,
        confidence: confidences.reduce<'low' | 'medium' | 'high'>(
          (best, current) =>
            confidenceRank[current] > confidenceRank[best] ? current : best,
          'low',
        ),
        coverageStatus: this.mergeCoverageStatuses(coverageStatuses),
      }))
      .sort((left, right) => {
        const evidenceDelta = right.evidenceCount - left.evidenceCount;
        if (evidenceDelta !== 0) {
          return evidenceDelta;
        }

        return confidenceRank[right.confidence] - confidenceRank[left.confidence];
      });
  }

  private buildProposalReason(finding: LearningFindingRecord) {
    const examples = finding.exampleConversationIds.slice(0, 5).join(', ');

    return [
      `Learning finding: ${finding.title}.`,
      `Detected in ${finding.evidenceCount} conversations.`,
      `Success evidence: ${finding.successEvidenceCount}, failure evidence: ${finding.failureEvidenceCount}.`,
      finding.summary,
      examples ? `Examples: ${examples}.` : null,
      `Coverage: ${finding.coverageStatus}.`,
      `Recommendation: ${finding.recommendedAction}`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildProposalContent(
    report: LearningRunReportRecord,
    finding: LearningFindingRecord,
    selection: {
      targetPath: string | null;
      artifactType: CuratorArtifactType;
      changeType: CuratorChangeType;
    },
  ) {
    return JSON.stringify(
      {
        strategy: 'investigation_required',
        source: 'learning_finding',
        sourceLearningRunId: report.runId,
        sourceFindingId: finding.findingId,
        findingCategory: finding.category,
        improvementType: finding.improvementType,
        coverageStatus: finding.coverageStatus,
        evidenceCount: finding.evidenceCount,
        successEvidenceCount: finding.successEvidenceCount,
        failureEvidenceCount: finding.failureEvidenceCount,
        phaseTypes: finding.phaseTypes,
        exampleConversationIds: finding.exampleConversationIds,
        exampleManagerMessages: finding.exampleManagerMessages,
        selectedTargetPath: selection.targetPath,
        artifactType: selection.artifactType,
        changeType: selection.changeType,
        recommendation: finding.recommendedAction,
        suspectedArtifacts: finding.suggestedArtifacts,
        operatorGuidance:
          'Это skeleton draft из learning layer. Его нужно проверить и при необходимости уточнить до apply.',
      },
      null,
      2,
    );
  }

  private resolveArtifactType(
    targetPath: string | null,
    category: string,
  ): CuratorArtifactType {
    if (!targetPath) {
      return category.includes('pricing') ? 'pricing' : 'rule';
    }
    if (targetPath.includes('/scripts/')) return 'script';
    if (targetPath.includes('/faq/')) return 'faq';
    if (targetPath.includes('/prompts/')) return 'template';
    if (targetPath.includes('RULES') || targetPath.includes('.agent/')) return 'rule';
    if (targetPath.includes('AGENTS.md')) return 'instruction';
    if (targetPath.includes('pricing')) return 'pricing';
    return 'rule';
  }

  private guessPhaseTypeForCandidate(category: string): LearningPhaseType {
    if (category.includes('payment')) return 'payment_conversion';
    if (category.includes('approval')) return 'design_approval';
    if (category.includes('order')) return 'qualification';
    if (category.includes('materials')) return 'photo_collection';
    if (category.includes('pricing')) return 'pricing';
    return 'qualification';
  }

  private guessPhaseTypeForSuccessfulPattern(title: string): LearningPhaseType {
    const normalized = title.toLowerCase();
    if (normalized.includes('оплат')) return 'payment_conversion';
    if (normalized.includes('цен')) return 'pricing';
    if (normalized.includes('достав') || normalized.includes('отзыв')) {
      return 'post_delivery_feedback';
    }
    if (normalized.includes('handoff') || normalized.includes('дизайнер')) {
      return 'design_approval';
    }
    return 'qualification';
  }

  private async extractManagerPatternCandidates(input: {
    conversationId: string;
    phaseSegments: ConversationPhaseSegment[];
    phaseAnalyses: LearningPhaseAnalysisRecord[];
    outcome: OutcomeDetectionResult;
  }): Promise<LearningManagerPatternCandidateRecord[]> {
    const candidates: LearningManagerPatternCandidateRecord[] = [];

    for (const rule of MANAGER_PATTERN_RULES) {
      const matchingPhase = input.phaseSegments.find((segment) => {
        if (!rule.phaseTypes.includes(segment.phaseType)) {
          return false;
        }

        if (!this.isPatternSourceEligible(input.outcome, segment.phaseType)) {
          return false;
        }

        return segment.messages.some(
          (message) =>
            message.role === 'manager' &&
            rule.detectionKeywords.some((keyword) =>
              message.text.toLowerCase().includes(keyword),
            ),
        );
      });

      if (!matchingPhase) {
        continue;
      }

      const matchingMessages = matchingPhase.messages
        .filter(
          (message) =>
            message.role === 'manager' &&
            rule.detectionKeywords.some((keyword) =>
              message.text.toLowerCase().includes(keyword),
            ),
        )
        .map((message) => this.truncateText(message.text, 280));

      const phaseAnalysis = input.phaseAnalyses.find(
        (phase) =>
          phase.phaseType === matchingPhase.phaseType &&
          phase.startMessageIndex === matchingPhase.startMessageIndex,
      );

      const coverage = await this.assessCoverage({
        key: rule.key,
        suspectedArtifacts: [rule.suggestedArtifactPath],
        searchKeywords: rule.searchKeywords,
      });

      candidates.push({
        candidateId: randomUUID(),
        candidateType: rule.candidateType,
        title: rule.title,
        triggerSituation: rule.triggerSituation,
        summary: rule.summary,
        exampleManagerMessages: matchingMessages.slice(0, 3),
        whyItWorked: [
          rule.whyItWorked,
          phaseAnalysis?.phaseOutcome === 'successful'
            ? 'Паттерн найден внутри успешной фазы диалога.'
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        suggestedArtifactPath: rule.suggestedArtifactPath,
        suggestedArtifactType: rule.suggestedArtifactType,
        confidence: this.resolvePatternConfidence(
          rule.confidence,
          coverage.coverageStatus,
          phaseAnalysis?.phaseOutcome ?? 'neutral',
        ),
        evidenceCount: 1,
        sourceConversationIds: [input.conversationId],
        coverageStatus: coverage.coverageStatus,
        phaseType: matchingPhase.phaseType,
        operationalImportance: rule.operationalImportance ?? null,
      });
    }

    return candidates;
  }

  private isPatternSourceEligible(
    outcome: OutcomeDetectionResult,
    phaseType: LearningPhaseType,
  ): boolean {
    if (outcome.isCompleted || outcome.paymentStage === 'fully_paid') {
      return true;
    }

    if (outcome.paymentStage === 'deposit_paid') {
      return phaseType !== 'post_delivery_feedback';
    }

    if (
      outcome.outcomeStatus === 'price_discussed' ||
      outcome.outcomeStatus === 'qualified'
    ) {
      return phaseType === 'qualification' || phaseType === 'pricing';
    }

    return false;
  }

  private resolvePatternConfidence(
    baseConfidence: 'low' | 'medium' | 'high',
    coverageStatus: LearningCoverageStatus,
    phaseOutcome: LearningPhaseAnalysisRecord['phaseOutcome'],
  ): 'low' | 'medium' | 'high' {
    const scores = { low: 1, medium: 2, high: 3 } as const;
    let score = scores[baseConfidence];

    if (phaseOutcome === 'successful') {
      score += 1;
    }

    if (coverageStatus === 'missing' || coverageStatus === 'partially_covered') {
      score += 1;
    }

    if (score >= 4) {
      return 'high';
    }
    if (score >= 2) {
      return 'medium';
    }
    return 'low';
  }

  private mergeCoverageStatuses(
    statuses: LearningCoverageStatus[],
  ): LearningCoverageStatus {
    const unique = new Set(statuses);

    if (unique.has('partially_covered')) return 'partially_covered';
    if (unique.has('missing') && unique.has('covered')) return 'partially_covered';
    if (unique.has('missing')) return 'missing';
    if (unique.has('covered') && unique.has('uncertain')) return 'partially_covered';
    if (unique.has('covered')) return 'covered';
    return 'uncertain';
  }

  private async assessCoverage(input: {
    key: string;
    suspectedArtifacts: string[];
    searchKeywords: string[];
  }): Promise<CoverageAssessment> {
    try {
      const index = await this.getBrainArtifactIndex();
      const candidateArtifacts = index.filter((artifact) =>
        input.suspectedArtifacts.includes(artifact.relativePath),
      );
      const targets = candidateArtifacts.length ? candidateArtifacts : index;
      let metadataHits = 0;
      let rawHits = 0;

      for (const artifact of targets) {
        const searchable = [
          artifact.title,
          artifact.summary ?? '',
          artifact.purpose ?? '',
          ...(artifact.usedWhen ?? []),
        ]
          .join(' ')
          .toLowerCase();

        metadataHits += input.searchKeywords.filter((keyword) =>
          searchable.includes(keyword),
        ).length;

        if (input.suspectedArtifacts.includes(artifact.relativePath)) {
          const rawContent = await this.getBrainArtifactRawContent(
            artifact.relativePath,
          );
          rawHits += input.searchKeywords.filter((keyword) =>
            rawContent.toLowerCase().includes(keyword),
          ).length;
        }
      }

      const totalHits = metadataHits + rawHits;
      if (totalHits === 0) {
        return {
          coverageStatus: 'missing',
          suggestedArtifacts: input.suspectedArtifacts,
          note: `Ключевые сигналы не найдены в current assistant-dev brain для ${input.key}.`,
        };
      }

      if (rawHits >= 2 || totalHits >= Math.max(3, input.searchKeywords.length)) {
        return {
          coverageStatus: 'covered',
          suggestedArtifacts: input.suspectedArtifacts,
          note: `Ключевые сигналы ${input.key} обнаружены в current assistant-dev brain.`,
        };
      }

      return {
        coverageStatus: 'partially_covered',
        suggestedArtifacts: input.suspectedArtifacts,
        note: `Обнаружены только частичные совпадения по ${input.key}; brain coverage выглядит неполным.`,
      };
    } catch {
      return {
        coverageStatus: 'uncertain',
        suggestedArtifacts: input.suspectedArtifacts,
        note: `Coverage assessment для ${input.key} не удалось выполнить надёжно.`,
      };
    }
  }

  private async getBrainArtifactIndex(): Promise<BrainArtifactIndexRecord[]> {
    if (!this.brainArtifactIndexPromise) {
      this.brainArtifactIndexPromise = (async () => {
        const sections = await this.brainWorkspaceService.listSections();
        const details = await Promise.all(
          sections.map((section) =>
            this.brainWorkspaceService.getSection(section.key),
          ),
        );

        return details.flatMap((section) =>
          section.artifacts.map((artifact) => ({
            section: section.key,
            key: artifact.key,
            relativePath: artifact.relativePath,
            title: artifact.title,
            summary: artifact.summary,
            purpose: artifact.purpose,
            usedWhen: artifact.usedWhen,
          })),
        );
      })();
    }

    return this.brainArtifactIndexPromise;
  }

  private async getBrainArtifactRawContent(relativePath: string): Promise<string> {
    if (!this.brainArtifactDetails.has(relativePath)) {
      this.brainArtifactDetails.set(
        relativePath,
        (async () => {
          const index = await this.getBrainArtifactIndex();
          const artifact = index.find((item) => item.relativePath === relativePath);
          if (!artifact) {
            return '';
          }
          const details = await this.brainWorkspaceService.getArtifact(
            artifact.section,
            artifact.key,
          );
          return details.rawContent ?? '';
        })(),
      );
    }

    return this.brainArtifactDetails.get(relativePath)!;
  }

  private matchesAny(text: string, keywords: string[]) {
    return keywords.some((keyword) => text.includes(keyword));
  }

  private truncateText(value: string, maxLength: number) {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 14))} ...[truncated]`;
  }
}
