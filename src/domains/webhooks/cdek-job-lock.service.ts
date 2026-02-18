import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

type LockMeta = {
  token: string;
  key: string;
  createdAt: string;
  pid: number;
  hostname: string;
};

export type CdekJobLockHandle = {
  key: string;
  lockPath: string;
  token: string;
  release: () => Promise<void>;
};

@Injectable()
export class CdekJobLockService {
  private readonly logger = new Logger(CdekJobLockService.name);
  private readonly lockDir = (
    process.env.CDEK_LOCK_DIR || '/tmp/easycrm-cdek-locks'
  ).trim();
  private readonly hostname = process.env.HOSTNAME || 'unknown-host';

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private lockPathForKey(key: string): string {
    const fileSafeKey = key.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
    return path.join(this.lockDir, `${fileSafeKey}.lock`);
  }

  private async readLockMeta(lockPath: string): Promise<LockMeta | null> {
    try {
      const raw = await fs.readFile(lockPath, 'utf-8');
      return JSON.parse(raw) as LockMeta;
    } catch {
      return null;
    }
  }

  private async isStale(lockPath: string, ttlMs: number): Promise<boolean> {
    try {
      const stat = await fs.stat(lockPath);
      return Date.now() - stat.mtimeMs > ttlMs;
    } catch {
      return false;
    }
  }

  async acquire(
    key: string,
    options: { ttlMs: number; waitMs?: number; pollMs?: number },
  ): Promise<CdekJobLockHandle | null> {
    const ttlMs = Math.max(1_000, options.ttlMs);
    const waitMs = Math.max(0, options.waitMs ?? 0);
    const pollMs = Math.max(100, options.pollMs ?? 1_000);
    const untilTs = Date.now() + waitMs;
    const lockPath = this.lockPathForKey(key);

    await fs.mkdir(this.lockDir, { recursive: true });

    while (true) {
      const token = randomUUID();
      const meta: LockMeta = {
        token,
        key,
        createdAt: new Date().toISOString(),
        pid: process.pid,
        hostname: this.hostname,
      };

      try {
        const handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify(meta), 'utf-8');
        await handle.close();

        return {
          key,
          lockPath,
          token,
          release: async () => {
            const current = await this.readLockMeta(lockPath);
            if (!current || current.token !== token) {
              return;
            }
            await fs.unlink(lockPath).catch(() => undefined);
          },
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code !== 'EEXIST') {
          throw error;
        }
      }

      const stale = await this.isStale(lockPath, ttlMs);
      if (stale) {
        const staleMeta = await this.readLockMeta(lockPath);
        this.logger.warn(
          `[CDEK Lock] Removing stale lock key=${key} file=${lockPath} owner=${staleMeta?.hostname ?? 'unknown'}:${staleMeta?.pid ?? 'n/a'}`,
        );
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }

      if (Date.now() >= untilTs) {
        return null;
      }

      await this.sleep(pollMs);
    }
  }
}
