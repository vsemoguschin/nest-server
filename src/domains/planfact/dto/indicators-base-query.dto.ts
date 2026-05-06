export class IndicatorsBaseQueryDto {
  period?: string;
  periodFrom?: string;
  periodTo?: string;
  accountId?: number;
  projectId?: number;
}

export type IndicatorsDonutItemDto = {
  id: number | null;
  title: string;
  amount: number;
};

export type IndicatorsDonutSliceDto = {
  total: number;
  items: IndicatorsDonutItemDto[];
};

export type IndicatorsDonutResponseDto = {
  meta: {
    period?: string;
    periodFrom?: string;
    periodTo?: string;
    accountId?: number;
    projectId?: number;
    currency: 'RUB';
  };
  debit: IndicatorsDonutSliceDto;
  credit: IndicatorsDonutSliceDto;
  monthly: Array<{
    period: string;
    label: string;
    debit: IndicatorsDonutSliceDto;
    credit: IndicatorsDonutSliceDto;
  }>;
};

export type IndicatorsProfitSummaryItemDto = {
  period: string;
  label: string;
  income: number;
  expense: number;
  netProfit: number;
  profitability: number;
  dividends: number;
};

export type IndicatorsProfitSummaryResponseDto = {
  meta: {
    period?: string;
    accountId?: number;
    projectId?: number;
    currency: 'RUB';
  };
  summary: {
    income: number;
    expense: number;
    netProfit: number;
    profitability: number;
    dividends: number;
  };
  items: IndicatorsProfitSummaryItemDto[];
};
