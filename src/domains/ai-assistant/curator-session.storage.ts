import { CuratorSessionRecord } from './dto/curator-session.dto';

export const CURATOR_SESSION_STORAGE = 'CURATOR_SESSION_STORAGE';

export interface CuratorSessionStorage {
  create(record: CuratorSessionRecord): Promise<CuratorSessionRecord>;
  get(id: string): Promise<CuratorSessionRecord | null>;
  save(record: CuratorSessionRecord): Promise<CuratorSessionRecord>;
}

