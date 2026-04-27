import { Injectable, InternalServerErrorException, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
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
export class UsersAuthSyncService implements OnModuleInit {
  private readonly logger = new Logger(UsersAuthSyncService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const baseUrl = (this.config.get<string>('AUTH_SERVICE_BASE_URL') ?? '').trim();
    const apiKey = (this.config.get<string>('AUTH_INTERNAL_API_KEY') ?? '').trim();
    const enabled = (this.config.get<string>('AUTH_SERVICE_SYNC_ENABLED') ?? 'true').trim().toLowerCase();

    if (enabled !== 'false' && (!baseUrl || !apiKey)) {
      this.logger.error(
        '[AUTH SYNC CRITICAL] AUTH_SERVICE_BASE_URL or AUTH_INTERNAL_API_KEY is missing — user sync will NOT work!',
      );
    }
  }

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

  async ensureAuthProjection(input: SyncRolesPayload): Promise<void> {
    this.logger.log(
      `AUTH_PROJECTION_ENSURE_STARTED userId=${input.userId} roles=${input.roles.join(',')} scopes=${input.scopes.join(',')}`,
    );

    try {
      await this.postInternal('/auth/internal/users/roles-changed', input, 1, true);
      this.logger.log(`AUTH_PROJECTION_ENSURE_OK userId=${input.userId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`AUTH_PROJECTION_ENSURE_FAILED userId=${input.userId} message=${message}`);
      throw error;
    }
  }

  getDefaultBookEditorScopes(): string[] {
    // MVP: все активные пользователи Core получают базовый доступ к book-editor.
    return ['book-editor:access', 'book-editor:read', 'book-editor:edit'];
  }

  private async postInternal(
    path: string,
    body: Record<string, unknown>,
    attempt = 1,
    strict = false,
  ): Promise<void> {
    const baseUrl = (this.config.get<string>('AUTH_SERVICE_BASE_URL') ?? '').trim();
    const apiKey = (this.config.get<string>('AUTH_INTERNAL_API_KEY') ?? '').trim();
    const enabled = (this.config.get<string>('AUTH_SERVICE_SYNC_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();

    if (enabled === 'false') {
      if (strict) {
        throw new ServiceUnavailableException('Auth projection sync is disabled');
      }
      return;
    }

    if (!baseUrl || !apiKey) {
      const message = `[AUTH SYNC CRITICAL] Sync skipped — AUTH_SERVICE_BASE_URL or AUTH_INTERNAL_API_KEY not configured (${path})`;
      this.logger.error(message);
      if (strict) {
        throw new InternalServerErrorException(message);
      }
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
        if (response.status === 401 || response.status === 403) {
          this.logger.error(
            `[AUTH SYNC CRITICAL] Auth rejected sync ${response.status} ${path} — check AUTH_INTERNAL_API_KEY on prod`,
          );
          if (strict) {
            throw new ServiceUnavailableException(
              `Auth service rejected sync ${response.status} ${path}: ${text || '<empty response>'}`,
            );
          }
        } else if (attempt < 3 && response.status >= 500) {
          clearTimeout(timeout);
          await new Promise((r) => setTimeout(r, attempt * 1000));
          return this.postInternal(path, body, attempt + 1, strict);
        } else {
          const message = `Auth sync failed ${response.status} ${path}: ${text || '<empty response>'}`;
          this.logger.warn(message);
          if (strict) {
            throw new ServiceUnavailableException(message);
          }
        }
      }
    } catch (error) {
      if (strict && error instanceof ServiceUnavailableException) {
        throw error;
      }
      if (strict && error instanceof InternalServerErrorException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 3) {
        clearTimeout(timeout);
        await new Promise((r) => setTimeout(r, attempt * 1000));
        return this.postInternal(path, body, attempt + 1, strict);
      }
      this.logger.warn(`Auth sync request error ${path}: ${message}`);
      if (strict) {
        throw new ServiceUnavailableException(`Auth sync request error ${path}: ${message}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
