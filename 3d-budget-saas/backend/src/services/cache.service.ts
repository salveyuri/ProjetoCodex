import NodeCache from "node-cache";

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

  flush(): void {
    this.cache.flushAll();
  }
}

export const cacheService = new CacheService();
