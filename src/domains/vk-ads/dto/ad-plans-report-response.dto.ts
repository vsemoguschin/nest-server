export interface AdPlanReportDiagnostics {
  refsFromUtm: string[];
  fallbackKeys: string[];
  matchedDealTags: string[];
  unmatchedRefs: string[];
  groupCount: number;
  bannerCount: number;
  matchedDealsBeforeStatusFilter: number;
}

export interface AdPlanReportItem {
  adPlanId: number;
  name: string | null;
  status: string | null;

  // VK spend metrics
  shows: number;
  clicks: number;
  spent: number;
  spentNds: number;

  // CRM deal metrics (only Deal/Dop/Client, no Crm* entities)
  dealsCount: number;
  dealsPrice: number;

  // Computed ratios (null when denominator is 0)
  cpl: number | null;
  drr: number | null;

  diagnostics: AdPlanReportDiagnostics;
}

export interface AdPlansReportTotals {
  shows: number;
  clicks: number;
  spent: number;
  spentNds: number;
  dealsCount: number;
  dealsPrice: number;
  cpl: number | null;
  drr: number | null;
}

export interface AdPlansReportGlobalDiagnostics {
  totalAdPlansFetched: number;
  totalAdPlansAfterStatusFilter: number;
  totalAdPlansAfterStatsFilter: number;
  byStatus: Record<string, number>; // active/blocked/deleted counts from VK API
  totalRefsFromUtm: number;
  totalFallbackKeys: number;
  totalMatchedDeals: number;
  sampleRefsFromUtm: string[];
  sampleMatchedDealTags: string[];
  // Present only when debugDeals=true
  sampleDbDealTags?: string[];
  allKeysIntersectionWithDb?: string[];
}

export interface AdPlansReportResponse {
  dateFrom: string;
  dateTo: string;
  totals: AdPlansReportTotals;
  items: AdPlanReportItem[];
  diagnostics: AdPlansReportGlobalDiagnostics;
}
