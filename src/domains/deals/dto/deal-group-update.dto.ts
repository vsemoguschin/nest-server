import { IsInt, Min } from 'class-validator';

export class UpdateDealGroupDto {
  @IsInt({ message: 'groupId должен быть целым числом (ID группы).' })
  @Min(1, { message: 'groupId должен быть больше 0.' })
  groupId: number;
}
