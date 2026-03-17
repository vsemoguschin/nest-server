import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EvaluationReportRecord,
  EvaluationRunRequestRecord,
} from './dto/evaluation.dto';

@Injectable()
export class EvaluationService {
  private readonly assistantBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.assistantBaseUrl =
      this.config.get<string>('ASSISTANT_SERVICE_URL') ||
      'http://127.0.0.1:8090';
  }

  async run(
    payload: EvaluationRunRequestRecord,
  ): Promise<EvaluationReportRecord> {
    return this.postJson('/api/eval/run', payload);
  }

  async getReport(runId: string): Promise<EvaluationReportRecord> {
    return this.fetchJson(`/api/eval/report/${encodeURIComponent(runId)}`);
  }

  private async fetchJson(path: string) {
    let response: globalThis.Response;

    try {
      response = await fetch(`${this.assistantBaseUrl}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error: any) {
      throw new BadGatewayException({
        message: 'assistant-service evaluation is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? String(error),
      });
    }

    const bodyText = await response.text();
    const parsedBody = this.tryParseJson(bodyText);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'assistant-service evaluation returned an error',
        assistantUrl: this.assistantBaseUrl,
        assistantStatus: response.status,
        assistantBody: parsedBody ?? bodyText.slice(0, 4000),
      });
    }

    return parsedBody;
  }

  private async postJson(path: string, payload: unknown) {
    let response: globalThis.Response;

    try {
      response = await fetch(`${this.assistantBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      throw new BadGatewayException({
        message: 'assistant-service evaluation is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? String(error),
      });
    }

    const bodyText = await response.text();
    const parsedBody = this.tryParseJson(bodyText);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'assistant-service evaluation returned an error',
        assistantUrl: this.assistantBaseUrl,
        assistantStatus: response.status,
        assistantBody: parsedBody ?? bodyText.slice(0, 4000),
      });
    }

    return parsedBody;
  }

  private tryParseJson(raw: string): any {
    if (!raw.trim()) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
