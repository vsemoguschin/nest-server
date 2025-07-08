import {
  IsString,
  IsOptional,
  IsUrl,
  IsIn,
  Matches,
} from 'class-validator';
const clientGenders = ['M', 'F', 'IT'];
const clientTypes = ['ООО', 'ИП', 'ФИЗ', 'НКО'];

export class ClientDto {
  @IsString({ message: 'fullName должно быть строкой (имя клиента).' })
  fullName: string;

  @IsString()
  // @Matches(/^8\d{10}$/, {
  //   message:
  //     'Номер телефона должен быть корректным номером в формате 89991234567.',
  // })
  phone: string;

  @IsUrl(
    {},
    { message: 'chatLink должна быть корректной ссылкой (ссылка на чат).' },
  )
  chatLink: string;

  @IsUrl(
    {},
    {
      message: 'adLink должна быть корректной ссылкой (ссылка на объявление).',
    },
  )
  @IsOptional()
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

  @IsString({
    message: 'firstContact должно быть строкой (дата первого контакта).',
  })
  firstContact: string;
}
