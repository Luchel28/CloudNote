declare module 'archiver' {
  import type { Writable } from 'stream';

  interface Archiver {
    on(event: 'error', handler: (error: Error) => void): Archiver;
    pipe(stream: Writable): Writable;
    file(path: string, data: { name: string }): Archiver;
    finalize(): Promise<void>;
  }

  export default function archiver(format: 'zip', options?: { zlib?: { level?: number } }): Archiver;
}
