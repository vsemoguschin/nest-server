import { Injectable } from '@nestjs/common';

export type CodexStreamEvent =
  | {
      type: 'thread.started';
      threadId: string;
    }
  | {
      type: 'assistant.delta';
      text: string;
    }
  | {
      type: 'assistant.completed';
      text: string;
    }
  | {
      type: 'assistant.failed';
      message: string;
    }
  | {
      type: 'runtime.started';
      requestId: string;
    }
  | {
      type: 'runtime.finished';
      requestId: string;
    };

export type CodexMapperState = {
  threadId: string | null;
  assistantText: string;
};

type CodexRawEvent = Record<string, any>;

@Injectable()
export class CodexEventMapper {
  createInitialState(): CodexMapperState {
    return {
      threadId: null,
      assistantText: '',
    };
  }

  mapRawEvent(
    rawEvent: CodexRawEvent,
    state: CodexMapperState,
  ): {
    nextState: CodexMapperState;
    events: CodexStreamEvent[];
  } {
    const events: CodexStreamEvent[] = [];
    let nextState = { ...state };

    const threadId = this.extractThreadId(rawEvent);
    if (threadId && threadId !== nextState.threadId) {
      nextState.threadId = threadId;
      events.push({
        type: 'thread.started',
        threadId,
      });
    }

    const deltaText = this.extractAssistantDelta(rawEvent);
    if (deltaText) {
      nextState.assistantText += deltaText;
      events.push({
        type: 'assistant.delta',
        text: deltaText,
      });
      return {
        nextState,
        events,
      };
    }

    const snapshotText = this.extractAssistantSnapshot(rawEvent);
    if (
      snapshotText &&
      snapshotText.length > nextState.assistantText.length &&
      snapshotText.startsWith(nextState.assistantText)
    ) {
      const appended = snapshotText.slice(nextState.assistantText.length);
      nextState.assistantText = snapshotText;
      if (appended) {
        events.push({
          type: 'assistant.delta',
          text: appended,
        });
      }
    }

    return {
      nextState,
      events,
    };
  }

  createCompletedEvent(text: string): CodexStreamEvent {
    return {
      type: 'assistant.completed',
      text,
    };
  }

  createFailedEvent(message: string): CodexStreamEvent {
    return {
      type: 'assistant.failed',
      message,
    };
  }

  createRuntimeStartedEvent(requestId: string): CodexStreamEvent {
    return {
      type: 'runtime.started',
      requestId,
    };
  }

  createRuntimeFinishedEvent(requestId: string): CodexStreamEvent {
    return {
      type: 'runtime.finished',
      requestId,
    };
  }

  private extractThreadId(rawEvent: CodexRawEvent): string | null {
    if (rawEvent.type === 'thread.started' && typeof rawEvent.thread_id === 'string') {
      return rawEvent.thread_id;
    }

    return null;
  }

  private extractAssistantDelta(rawEvent: CodexRawEvent): string | null {
    const candidates = [
      rawEvent.delta,
      rawEvent.text_delta,
      rawEvent.item?.delta,
      rawEvent.item?.text_delta,
      rawEvent.data?.delta,
      rawEvent.data?.text_delta,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) {
        return candidate;
      }
    }

    return null;
  }

  private extractAssistantSnapshot(rawEvent: CodexRawEvent): string | null {
    const item = rawEvent.item;

    if (item?.type === 'agent_message') {
      const text = this.extractTextFromAgentMessage(item);
      if (text) {
        return text;
      }
    }

    if (
      typeof rawEvent.type === 'string' &&
      (rawEvent.type.includes('assistant') || rawEvent.type.includes('message'))
    ) {
      const text = this.extractTextFromUnknownPayload(rawEvent);
      if (text) {
        return text;
      }
    }

    return null;
  }

  private extractTextFromAgentMessage(item: Record<string, any>): string | null {
    if (typeof item.text === 'string' && item.text) {
      return item.text;
    }

    if (Array.isArray(item.content)) {
      const text = item.content
        .map((part: Record<string, any>) => {
          if (typeof part?.text === 'string') return part.text;
          if (typeof part?.value === 'string') return part.value;
          return '';
        })
        .join('');

      if (text) {
        return text;
      }
    }

    return null;
  }

  private extractTextFromUnknownPayload(rawEvent: CodexRawEvent): string | null {
    const directCandidates = [
      rawEvent.text,
      rawEvent.message,
      rawEvent.item?.text,
      rawEvent.data?.text,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate) {
        return candidate;
      }
    }

    return null;
  }
}
