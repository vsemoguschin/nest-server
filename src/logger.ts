import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

// вырезаем Buffers / file.buffer из любых объектов
const stripBinary = winston.format((info) => {
  const seen = new WeakSet();
  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);

    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (Buffer.isBuffer(val)) {
        (obj as any)[key] = `[Buffer ${val.length} bytes]`;
        continue;
      }
      if (val && typeof val === 'object') {
        if ('buffer' in val && Buffer.isBuffer((val as any).buffer)) {
          (val as any).buffer = `[Buffer ${(val as any).buffer.length} bytes]`;
        }
        if (Array.isArray(val)) {
          if (val.length && Buffer.isBuffer(val[0])) {
            (obj as any)[key] = `[BufferArray len=${val.length}]`;
            continue;
          }
          val.forEach(walk);
        } else {
          walk(val);
        }
      }
    }
  };
  walk(info);
  return info;
});

// Плоский человекочитаемый вывод без сериализации meta
const consoleFormat = winston.format.printf((info) => {
  const { level, message, timestamp, context, stack } = info as any;
  const lvl = String(level).toUpperCase();
  const ctx = context ? `[${context}] ` : '';
  const base = `${timestamp} ${lvl} ${ctx}${message ?? ''}`;
  return stack ? `${base}\n${stack}` : base;
});

export const winstonLogger = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      handleExceptions: true,
      handleRejections: true,
      format: winston.format.combine(
        stripBinary(),
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        consoleFormat, // <- без nestLike/json: ничего не сериализуем
      ),
    }),
  ],
});
