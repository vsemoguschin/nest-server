import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SyncUserPayload = {
  userId: string;
  initiatorId?: string | null;
};

type SyncRolesPayload = SyncUserPayload & {
  roles: string[];
  scopes: string[];
};

@Injectable()
export class UsersAuthSyncService {
  private readonly logger = new Logger(UsersAuthSyncService.name);

  constructor(private readonly config: ConfigService) {}

  async syncUserCreated(input: SyncRolesPayload): Promise<void> {
    await this.postInternal('/auth/internal/users/roles-changed', input);
  }

  async syncUserSoftDeleted(input: SyncUserPayload): Promise<void> {
    await this.postInternal('/auth/internal/users/soft-delete', input);
  }

  async syncUserRestored(input: SyncUserPayload): Promise<void> {
    await this.postInternal('/auth/internal/users/restore', input);
  }

  async syncUserRolesChanged(input: SyncRolesPayload): Promise<void> {
    await this.postInternal('/auth/internal/users/roles-changed', input);
  }

  getDefaultBookEditorScopes(): string[] {
    // MVP: все активные пользователи Core получают базовый доступ к book-editor.
    return ['book-editor:access', 'book-editor:read', 'book-editor:edit'];
  }

  private async postInternal(path: string, body: Record<string, unknown>) {
    const baseUrl = (this.config.get<string>('AUTH_SERVICE_BASE_URL') ?? '').trim();
    const apiKey = (this.config.get<string>('AUTH_INTERNAL_API_KEY') ?? '').trim();
    const enabled = (this.config.get<string>('AUTH_SERVICE_SYNC_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();

    if (enabled === 'false') {
      return;
    }

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        `Auth sync skipped: AUTH_SERVICE_BASE_URL or AUTH_INTERNAL_API_KEY is not configured (${path})`,
      );
      return;
    }

    const timeoutMs = Number(this.config.get<string>('AUTH_SERVICE_SYNC_TIMEOUT_MS') ?? '3000');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 3000);

    try {
      const response = await fetch(new URL(path, baseUrl).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-auth-internal-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `Auth sync failed ${response.status} ${path}: ${text || '<empty response>'}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Auth sync request error ${path}: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
