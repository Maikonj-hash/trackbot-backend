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
    await this.redis.expire(hashKey, 86400); // 24h
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
}
