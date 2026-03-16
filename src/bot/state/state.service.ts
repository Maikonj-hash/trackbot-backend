import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class StateService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;

  onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async setStep(
    instanceId: string,
    userPhone: string,
    step: string,
  ): Promise<void> {
    await this.redis.set(
      `session:${instanceId}:${userPhone}:step`,
      step,
      'EX',
      86400,
    );
  }

  async getStep(instanceId: string, userPhone: string): Promise<string | null> {
    return this.redis.get(`session:${instanceId}:${userPhone}:step`);
  }

  async clearStep(instanceId: string, userPhone: string): Promise<void> {
    await this.redis.del(`session:${instanceId}:${userPhone}:step`);
  }

  async setMetadata(
    instanceId: string,
    userPhone: string,
    key: string,
    value: string,
  ): Promise<void> {
    const hashKey = `session:${instanceId}:${userPhone}:meta`;
    await this.redis.hset(hashKey, key, value);
    await this.redis.expire(hashKey, 86400);
  }

  async getMetadata(
    instanceId: string,
    userPhone: string,
    key: string,
  ): Promise<string | null> {
    return this.redis.hget(`session:${instanceId}:${userPhone}:meta`, key);
  }

  async clearMetadata(instanceId: string, userPhone: string): Promise<void> {
    await this.redis.del(`session:${instanceId}:${userPhone}:meta`);
  }

  async deleteMetadata(
    instanceId: string,
    userPhone: string,
    key: string,
  ): Promise<void> {
    const hashKey = `session:${instanceId}:${userPhone}:meta`;
    await this.redis.hdel(hashKey, key);
  }

  async pushHistory(
    instanceId: string,
    userPhone: string,
    stepId: string,
  ): Promise<void> {
    const key = `session:${instanceId}:${userPhone}:history`;
    await this.redis.lpush(key, stepId);
    await this.redis.ltrim(key, 0, 9); // Manter apenas as últimas 10 interações
    await this.redis.expire(key, 86400);
  }

  async popHistory(
    instanceId: string,
    userPhone: string,
  ): Promise<string | null> {
    const key = `session:${instanceId}:${userPhone}:history`;
    return this.redis.lpop(key);
  }

  async peekHistory(
    instanceId: string,
    userPhone: string,
  ): Promise<string | null> {
    const key = `session:${instanceId}:${userPhone}:history`;
    const steps = await this.redis.lrange(key, 0, 0);
    return steps.length > 0 ? steps[0] : null;
  }

  async clearHistory(instanceId: string, userPhone: string): Promise<void> {
    await this.redis.del(`session:${instanceId}:${userPhone}:history`);
  }

  async pushJourney(
    instanceId: string,
    userPhone: string,
    event: {
      type: 'ENTRY' | 'INTERACTION';
      nodeId: string;
      nodeType: string;
      label?: string;
      value?: string;
      timestamp: string;
    },
  ): Promise<void> {
    const key = `session:${instanceId}:${userPhone}:journey`;
    await this.redis.rpush(key, JSON.stringify(event));
    await this.redis.ltrim(key, 0, 49);
    await this.redis.expire(key, 86400);
  }

  async getJourney(
    instanceId: string,
    userPhone: string,
  ): Promise<any[]> {
    const key = `session:${instanceId}:${userPhone}:journey`;
    const items = await this.redis.lrange(key, 0, -1);
    return items.map((item) => JSON.parse(item));
  }

  async clearJourney(instanceId: string, userPhone: string): Promise<void> {
    await this.redis.del(`session:${instanceId}:${userPhone}:journey`);
  }

  async clearFlowSessions(instanceId: string): Promise<void> {
    const pattern = `session:${instanceId}:*`;
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
