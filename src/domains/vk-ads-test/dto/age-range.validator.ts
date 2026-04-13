import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsAgeToGreaterOrEqualAgeFrom(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAgeToGreaterOrEqualAgeFrom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const ageFrom = (args.object as { ageFrom?: number }).ageFrom;

          if (value === undefined || value === null || ageFrom === undefined) {
            return true;
          }

          return typeof value === 'number' && ageFrom <= value;
        },
      },
    });
  };
}
