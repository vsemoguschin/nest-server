import {
  IsString,
  IsOptional,
  IsUrl,
  Matches,
  IsNotEmpty,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
const clientGenders = ['M', 'F', 'IT'];
const clientTypes = ['ООО', 'ИП', 'ФИЗ', 'НКО'];

export class CreateClientDto {
  @IsNotEmpty({ message: 'ФИО клиента - обязательное поле' })
  @IsString({ message: 'fullName должно быть строкой (имя клиента).' })
  fullName: string;

  @IsString()
  @Matches(/^8\d{10}$/, {
    message:
      'Номер телефона должен быть корректным номером в формате 89991234567.',
  })
  phone: string;

  // @IsOptional()
  @IsUrl(
    {},
    { message: 'chatLink должна быть корректной ссылкой (ссылка на чат).' },
  )
  chatLink: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUrl(
    {},
    {
      message:
        'ссылка на объявление должна быть корректной ссылкой (ссылка на объявление).',
    },
  )
  adLink?: string = '';

  @IsString({ message: 'гендер должно быть строкой (пол).' })
  @IsIn(clientGenders, {message: 'неправильный гендер'})
  gender: string;

  @IsString({ message: 'type должно быть строкой (тип клиента).' })
  @IsIn(clientTypes, {message: "неправильный тип"})
  type: string;

  @IsString({ message: 'info должно быть строкой (информация о клиенте).' })
  @IsOptional()
  info?: string = '';

  @IsString({ message: 'inn должно быть строкой (ИНН).' })
  @IsOptional()
  inn?: string = '';

  @IsNotEmpty({ message: 'дата первого контакта - обязательное поле' })
  @IsString({
    message: 'firstContact должно быть строкой (дата первого контакта).',
  })
  firstContact: string;

  @IsBoolean({
    message: 'isRegular должно быть true или false (Постоянный/нет?).',
  })
  isRegular: boolean = false;
}
