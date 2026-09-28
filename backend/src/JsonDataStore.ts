import { DataStore } from 'yt-cast-receiver';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SAVE_DEBOUNCE_MS = 500;

export class JsonDataStore extends DataStore {
  private filePath: string;
  private data: Record<string, unknown>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirEnsured: boolean = false;
  private inflightWrite: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.scheduleSave();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.data[key];
    return value !== undefined ? (value as T) : null;
  }

  async remove(key: string): Promise<void> {
    if (!(key in this.data)) return;
    delete this.data[key];
    this.scheduleSave();
  }

  private loadFromDisk(): Record<string, unknown> {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error('[YTCast] DataStore: failed to load (corrupt file?), starting empty:', err);
      }
      return {};
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushToDisk();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Flush any pending in-memory changes to disk immediately. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flushToDisk();
  }

  private async flushToDisk(): Promise<void> {
    this.inflightWrite = this.inflightWrite.then(async () => {
      try {
        if (!this.dirEnsured) {
          await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
          this.dirEnsured = true;
        }
        const tmp = this.filePath + '.tmp';
        await fsp.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
        await fsp.rename(tmp, this.filePath);
      } catch (err) {
        console.error('[YTCast] Failed to save datastore:', err);
      }
    });
    return this.inflightWrite;
  }
}
