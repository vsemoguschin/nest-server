import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import axios from 'axios';

const TRACKED_USER_ID = 113;
const ADMIN_TELEGRAM_CHAT_ID = '317401874'; // куда отправлять уведомления

@Injectable()
export class UserActivityInterceptor implements NestInterceptor {
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Проверяем, что это нужный пользователь
    if (!user || user.id !== TRACKED_USER_ID) {
      return next.handle();
    }

    const method = request.method;
    const url = request.url;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.notify(
            `👤 <b>User #${TRACKED_USER_ID}</b>\n` +
              `📍 <code>${method} ${url}</code>\n` +
              `⏱ ${duration}ms\n` +
              `🕐 ${new Date().toLocaleString('ru-RU')}`,
          );
        },
        error: (err) => {
          this.notify(
            `❌ <b>User #${TRACKED_USER_ID} ERROR</b>\n` +
              `📍 <code>${method} ${url}</code>\n` +
              `💥 ${err?.message || 'Unknown error'}`,
          );
        },
      }),
    );
  }

  private async notify(text: string) {
    if (!this.token) return;
    try {
      await axios.post(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          chat_id: ADMIN_TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_notification: true,
        },
      );
    } catch {
      // silent fail
    }
  }
}

