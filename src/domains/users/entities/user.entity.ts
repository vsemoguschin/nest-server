import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class User {
  @Field(() => Int)
  id: number;

  @Field()
  fullName: string;

  @Field()
  email: string;

  // Поле password намеренно не описываем – оно не попадёт в GraphQL-схему
}
