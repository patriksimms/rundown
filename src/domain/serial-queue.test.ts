import { describe, expect, it } from 'vitest';
import { createSerialQueue } from '#/domain/serial-queue';

describe('serial mutation queue', () => {
  it('finishes mutations in enqueue order', async () => {
    const enqueue = createSerialQueue();
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueue(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = enqueue(async () => {
      events.push('second');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues after a failed mutation', async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(() => Promise.reject(new Error('failed')));
    const next = enqueue(() => Promise.resolve('saved'));

    await expect(failed).rejects.toThrow('failed');
    await expect(next).resolves.toBe('saved');
  });
});
