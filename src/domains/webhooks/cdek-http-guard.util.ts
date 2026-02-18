import axios from 'axios';

type CircuitState = {
  consecutiveFailures: number;
  openedUntil: number;
};

const circuitStates = new Map<string, CircuitState>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCircuitState(key: string): CircuitState {
  const current = circuitStates.get(key);
  if (current) return current;
  const next = { consecutiveFailures: 0, openedUntil: 0 };
  circuitStates.set(key, next);
  return next;
}

export class CdekHttpGuard {
  private readonly maxAttempts = Math.max(
    1,
    Number(process.env.CDEK_HTTP_MAX_ATTEMPTS) || 4,
  );
  private readonly baseBackoffMs = Math.max(
    50,
    Number(process.env.CDEK_HTTP_BACKOFF_BASE_MS) || 500,
  );
  private readonly maxBackoffMs = Math.max(
    this.baseBackoffMs,
    Number(process.env.CDEK_HTTP_BACKOFF_MAX_MS) || 5000,
  );
  private readonly jitterMs = Math.max(
    0,
    Number(process.env.CDEK_HTTP_JITTER_MS) || 250,
  );
  private readonly circuitThreshold = Math.max(
    1,
    Number(process.env.CDEK_HTTP_CIRCUIT_THRESHOLD) || 5,
  );
  private readonly circuitCooldownMs = Math.max(
    1000,
    Number(process.env.CDEK_HTTP_CIRCUIT_COOLDOWN_MS) || 60000,
  );

  constructor(private readonly key: string) {}

  private isRetryable(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;

    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    if (status === 429 || status === 408) return true;
    if (status >= 500) return true;
    return false;
  }

  private nextBackoff(attempt: number): number {
    const exp = this.baseBackoffMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = this.jitterMs ? Math.floor(Math.random() * this.jitterMs) : 0;
    return Math.min(this.maxBackoffMs, exp + jitter);
  }

  private ensureCircuitClosed(operation: string) {
    const state = getCircuitState(this.key);
    if (Date.now() < state.openedUntil) {
      throw new Error(
        `[CDEK HTTP] circuit open for ${operation}; retry later`,
      );
    }
  }

  private recordSuccess() {
    const state = getCircuitState(this.key);
    state.consecutiveFailures = 0;
    state.openedUntil = 0;
  }

  private recordFailure() {
    const state = getCircuitState(this.key);
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.circuitThreshold) {
      state.openedUntil = Date.now() + this.circuitCooldownMs;
      state.consecutiveFailures = 0;
    }
  }

  async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    this.ensureCircuitClosed(operation);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.recordSuccess();
        return result;
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryable(error);
        const canRetry = retryable && attempt < this.maxAttempts;
        if (!canRetry) {
          // 4xx/бизнес-ошибки не должны открывать circuit breaker.
          // Иначе массовые "невалидные треки" приводят к каскадному failed для всех следующих запросов.
          if (retryable) {
            this.recordFailure();
          }
          throw error;
        }
        await sleep(this.nextBackoff(attempt));
      }
    }

    if (this.isRetryable(lastError)) {
      this.recordFailure();
    }
    throw lastError;
  }
}

export function isAuthError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}
