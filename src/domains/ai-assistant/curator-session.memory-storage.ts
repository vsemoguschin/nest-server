import { Injectable } from '@nestjs/common';
import { CuratorSessionRecord } from './dto/curator-session.dto';
import { CuratorSessionStorage } from './curator-session.storage';

@Injectable()
export class CuratorSessionMemoryStorage implements CuratorSessionStorage {
  private readonly records = new Map<string, CuratorSessionRecord>();

  async create(record: CuratorSessionRecord): Promise<CuratorSessionRecord> {
    this.records.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<CuratorSessionRecord | null> {
    return this.records.get(id) ?? null;
  }

  async save(record: CuratorSessionRecord): Promise<CuratorSessionRecord> {
    this.records.set(record.id, record);
    return record;
  }
}

