import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'newPassword123', description: 'Новый пароль' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' })
  newPass: string;
}
