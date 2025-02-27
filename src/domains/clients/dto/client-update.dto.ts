import {
  IsString,
  IsOptional,
  IsUrl,
  IsIn,
  IsBoolean,
  ValidateIf,
  Matches,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';

const clientGenders = ['M', 'F', 'IT'] as const;
const clientTypes = ['ООО', 'ИП', 'ФИЗ', 'НКО'] as const;

export class UpdateClientDto {
  @IsString({ message: 'fullName должно быть строкой (имя клиента).' })
  @IsNotEmpty({ message: 'ФИО клиента - обязательное поле' })
  @IsOptional()
  fullName?: string;

  @IsString()
  @Matches(/^8\d{10}$/, {
    message:
      'Номер телефона должен быть корректным номером в формате 89991234567.',
  })
  phone?: string;

  @IsUrl(
    {},
    { message: 'chatLink должна быть корректной ссылкой (ссылка на чат).' },
  )
  @IsOptional()
  chatLink?: string;

  @ValidateIf(
    (obj) =>
      obj.adLink !== '' && obj.adLink !== undefined && obj.adLink !== null,
  )
  @IsOptional()
  @IsUrl(
    {},
    {
      message: 'adLink должна быть корректной ссылкой (ссылка на объявление).',
    },
  )
  adLink?: string;

  @IsString({ message: 'гендер должно быть строкой (пол).' })
  @IsIn(clientGenders, { message: 'неправильный гендер' })
  @IsOptional()
  gender?: string;

  @IsString({ message: 'type должно быть строкой (тип клиента).' })
  @IsIn(clientTypes, { message: 'неправильный тип' })
  @IsOptional()
  type?: string;

  @IsString({ message: 'info должно быть строкой (информация о клиенте).' })
  @IsOptional()
  info?: string;

  @IsString({ message: 'inn должно быть строкой (ИНН).' })
  @IsOptional()
  inn?: string;

  @IsString({
    message: 'дата первого контакта должно быть строкой.',
  })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    {
      message:
        'дата первого контакта должна быть валидной датой в формате YYYY-MM-DD',
    },
  )
  firstContact?: string;

  @IsBoolean({ message: 'isRegular должно быть булевым значением.' })
  @IsOptional()
  isRegular?: boolean;
}
