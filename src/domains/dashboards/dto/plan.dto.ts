import { ApiProperty } from "@nestjs/swagger";

export class PlanDto {
  @ApiProperty({ description: 'Название группы', example: 'Admin G' })
  averageBill: number;

  dealsAmount: number;

  dealsSales: number;

  dopsAmount: number;

  dopsSales: number;

  dopsToSales: number;

  id: number;

  period: string;

  plan: number;

  receivedPayments: number;

  remainder: number;

  salesToPlan: number;

  title: string;

  totalSales: number;

}
