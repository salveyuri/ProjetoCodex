import NodeCache from "node-cache";

export const companyAnalyticsCacheKeyPrefix = (companyId: string): string =>
  `company-analytics:${companyId}:`;

export class CacheService {
  private readonly cache = new NodeCache({
    stdTTL: 300,
    checkperiod: 120,
    useClones: false,
  });

  async getOrSet<T>(
    key: string,
    producer: () => Promise<T>,
    ttlSeconds = 300,
  ): Promise<T> {
    const cached = this.cache.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = await producer();
    this.cache.set(key, value, ttlSeconds);
    return value;
  }

  del(key: string): void {
    this.cache.del(key);
  }

  delByPrefix(prefix: string): void {
    const matchingKeys = this.cache.keys().filter((key) => key.startsWith(prefix));
    this.cache.del(matchingKeys);
  }

  flush(): void {
    this.cache.flushAll();
  }
}

export const cacheService = new CacheService();
