// src/production/dto/create-master-shifts.dto.ts
import {
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  Validate,
  ValidationArguments,
} from 'class-validator';

function IsValidShiftDate(validationArguments: ValidationArguments) {
  const value = validationArguments.value as string;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(value)) {
    return 'Each date must be in YYYY-MM-DD format';
  }
  return true;
}

export class CreateMasterShiftsDto {
  @IsArray()
  @IsString({ each: true })
  @Validate(IsValidShiftDate, { each: true })
  shiftDates: string[];

  @IsString({ message: 'Период должен быть строкой.' })
  @IsNotEmpty({ message: 'Период обязателен.' })
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'Период должен быть в формате YYYY-MM (например, 2025-02).',
  })
  period: string;
}
