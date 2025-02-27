import { UserDto } from 'src/domains/users/dto/user.dto';

export class DealsDto {
  saleDate: string;

  card_id: string;

  title: string;

  price: number;
  
  status: string; // Значение по умолчанию

  deadline: string;

  clothingMethod: string;

  description: string;

  source: string;

  adTag: string;

  discont: string;

  sphere: string;

  city: string;

  region: string;

  paid: boolean;

  maketType: string;

  maketPresentation: string;

  period?: string;

  userId: number;

  dealers: UserDto[];

  workSpaceId: number;

  groupId: number;

  clientId: number;
}
