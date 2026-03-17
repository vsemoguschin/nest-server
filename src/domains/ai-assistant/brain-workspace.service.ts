import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BrainPublishCandidateArtifactDetailsRecord,
  BrainPublishCandidateArtifactQueryDto,
  BrainPublishCandidateRecord,
} from './dto/brain-publish-candidate.dto';
import {
  BrainPublishRequestRecord,
  BrainPublishResultRecord,
} from './dto/brain-publish.dto';
import {
  BrainWorkspaceArtifactRecord,
  BrainWorkspaceSectionDetailsRecord,
  BrainWorkspaceSectionRecord,
} from './dto/brain-workspace.dto';

@Injectable()
export class BrainWorkspaceService {
  private readonly assistantBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.assistantBaseUrl =
      this.config.get<string>('ASSISTANT_SERVICE_URL') ||
      'http://127.0.0.1:8090';
  }

  async listSections(): Promise<BrainWorkspaceSectionRecord[]> {
    return this.fetchJson('/api/brain/sections');
  }

  async getSection(
    sectionKey: string,
  ): Promise<BrainWorkspaceSectionDetailsRecord> {
    return this.fetchJson(`/api/brain/section/${encodeURIComponent(sectionKey)}`);
  }

  async getArtifact(
    sectionKey: string,
    artifactKey: string,
  ): Promise<BrainWorkspaceArtifactRecord> {
    const searchParams = new URLSearchParams({
      sectionKey,
      artifactKey,
    });

    return this.fetchJson(`/api/brain/artifact?${searchParams.toString()}`);
  }

  async getPublishCandidate(): Promise<BrainPublishCandidateRecord> {
    return this.fetchJson('/api/brain/publish-candidate');
  }

  async getPublishCandidateArtifact(
    query: BrainPublishCandidateArtifactQueryDto,
  ): Promise<BrainPublishCandidateArtifactDetailsRecord> {
    const searchParams = new URLSearchParams({
      path: query.path,
    });

    return this.fetchJson(
      `/api/brain/publish-candidate/artifact?${searchParams.toString()}`,
    );
  }

  async publish(
    actor: { id: string | number | null; fullName: string | null },
  ): Promise<BrainPublishResultRecord> {
    const payload: BrainPublishRequestRecord = {
      explicit: true,
      publishedBy: {
        id: actor.id !== null && actor.id !== undefined ? String(actor.id) : null,
        fullName: actor.fullName ?? null,
      },
    };

    return this.postJson('/api/brain/publish', payload);
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
        message: 'assistant-service brain workspace is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? String(error),
      });
    }

    const bodyText = await response.text();
    const parsedBody = this.tryParseJson(bodyText);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'assistant-service brain workspace returned an error',
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
        message: 'assistant-service brain workspace is unavailable',
        assistantUrl: this.assistantBaseUrl,
        assistantErrorCode: error?.code ?? null,
        assistantErrorMessage: error?.message ?? String(error),
      });
    }

    const bodyText = await response.text();
    const parsedBody = this.tryParseJson(bodyText);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'assistant-service brain workspace returned an error',
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
