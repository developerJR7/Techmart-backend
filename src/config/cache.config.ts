import { CacheModuleOptions, CacheOptionsFactory } from '@nestjs/cache-manager';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';

@Injectable()
export class CacheConfigService implements CacheOptionsFactory {
  constructor(private configService: ConfigService) {}

  createCacheOptions(): CacheModuleOptions {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    if (isProduction || this.configService.get('REDIS_URL')) {
      // Use Redis in production or if REDIS_URL is provided
      return {
        store: redisStore,
        url: this.configService.get('REDIS_URL') || 'redis://localhost:6379',
        ttl: 300, // 5 minutes default
        max: 100, // Maximum number of items in cache
      };
    }

    // Use in-memory cache for development
    return {
      ttl: 300,
      max: 100,
    };
  }
}
