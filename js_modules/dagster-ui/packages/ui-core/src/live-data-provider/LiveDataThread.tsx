import {LiveDataThreadManager} from './LiveDataThreadManager';
import {BATCHING_INTERVAL, BATCH_PARALLEL_FETCHES} from './util';

export type LiveDataThreadID = string;

export class LiveDataThread<T> {
  private listenersCount: {[key: string]: number};
  private activeFetches: number = 0;
  private intervals: ReturnType<typeof setTimeout>[];
  private manager: LiveDataThreadManager<any>;
  public pollRate: number = 30000;

  protected static _threads: {[key: string]: LiveDataThread<any>} = {};

  private async queryKeys(_keys: string[]): Promise<Record<string, T>> {
    return {};
  }

  constructor(
    manager: LiveDataThreadManager<T>,
    queryKeys: (keys: string[]) => Promise<Record<string, T>>,
  ) {
    this.queryKeys = queryKeys;
    this.listenersCount = {};
    this.manager = manager;
    this.intervals = [];
  }

  public setPollRate(pollRate: number) {
    this.pollRate = pollRate;
  }

  public subscribe(key: string) {
    this.listenersCount[key] = this.listenersCount[key] || 0;
    this.listenersCount[key] += 1;
    this.startFetchLoop();
  }

  public unsubscribe(key: string) {
    if (!this.listenersCount[key]) {
      return;
    }
    this.listenersCount[key] -= 1;
    if (this.listenersCount[key] === 0) {
      delete this.listenersCount[key];
    }
    if (this.getObservedKeys().length === 0) {
      this.stopFetchLoop();
    }
  }

  public getObservedKeys() {
    return Object.keys(this.listenersCount);
  }

  public startFetchLoop() {
    if (this.intervals.length === BATCH_PARALLEL_FETCHES) {
      return;
    }
    const fetch = () => {
      this._batchedQueryKeys();
    };
    setTimeout(fetch, BATCHING_INTERVAL);
    this.intervals.push(setInterval(fetch, 5000));
  }

  public stopFetchLoop() {
    this.intervals.forEach((id) => {
      clearInterval(id);
    });
    this.intervals = [];
  }

  private async _batchedQueryKeys() {
    if (this.activeFetches >= BATCH_PARALLEL_FETCHES) {
      return;
    }
    const keys = this.manager.determineKeysToFetch(this.getObservedKeys());
    if (!keys.length) {
      return;
    }
    this.activeFetches += 1;
    this.manager._markKeysRequested(keys);

    const doNextFetch = () => {
      this.activeFetches -= 1;
      this._batchedQueryKeys();
    };
    try {
      const data = await this.queryKeys(keys);
      this.manager._updateFetchedKeys(keys, data);
      doNextFetch();
    } catch (e) {
      console.error(e);

      if ((e as any)?.message?.includes('500')) {
        // Mark these keys as fetched so that we don't retry them until after the poll interval rather than retrying them immediately.
        // This is preferable because if the keys failed to fetch it's likely due to a timeout due to the query being too expensive and retrying it
        // will not make it more likely to succeed and it would add more load to the database.
        this.manager._updateFetchedKeys(keys, {});
      } else {
        // If it's not a timeout from the backend then lets keep retrying instead of moving on.
        this.manager._unmarkKeysRequested(keys);
      }

      setTimeout(
        () => {
          doNextFetch();
        },
        // If the poll rate is faster than 5 seconds lets use that instead
        Math.min(this.pollRate, 5000),
      );
    }
  }
}
