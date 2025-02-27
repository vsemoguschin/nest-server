import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import * as winston from 'winston';

export const winstonLogger = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        nestWinstonModuleUtilities.format.nestLike('MyApp', {
          prettyPrint: true,
        }),
      ),
    }),
    // При необходимости можно добавить файл или другие транспорты
    // new winston.transports.File({ filename: 'logs/app.log' })
  ],
});
