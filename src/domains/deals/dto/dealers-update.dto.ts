import { IsInt, IsNotEmpty, Min, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'uniqueUserIds', async: false })
export class UniqueUserIdsConstraint implements ValidatorConstraintInterface {
  validate(dealers: DealerDto[], args: ValidationArguments) {
    const userIds = dealers.map(dealer => dealer.userId);
    return new Set(userIds).size === userIds.length; // Проверяем уникальность
  }

  defaultMessage(args: ValidationArguments) {
    return 'В списке дилеров не должно быть одинаковых userId.';
  }
}

export class DealerDto {
  @IsInt({ message: 'ID дилера должен быть целым числом.' })
  id: number;

  @IsInt({ message: 'ID пользователя должен быть целым числом.' })
  @IsNotEmpty({ message: 'ID пользователя обязателен.' })
  userId: number;

  @IsInt({ message: 'Стоимость должна быть целым числом.' })
  @IsNotEmpty({ message: 'Стоимость обязательна.' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsInt({ message: 'ID сделки должен быть целым числом.' })
  @IsNotEmpty({ message: 'ID сделки обязателен.' })
  dealId: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  idx: number;
}

export class UpdateDealersDto {
  @IsNotEmpty({ message: 'Список дилеров обязателен.' })
  @Validate(UniqueUserIdsConstraint)
  dealers: DealerDto[];
}