import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const SKIP_THROTTLE_KEY = 'skipThrottle';
export const SkipThrottle = () => SetMetadata(SKIP_THROTTLE_KEY, true);

export const CACHE_KEY_METADATA = 'cacheKey';
export const CacheKey = (key: string) => SetMetadata(CACHE_KEY_METADATA, key);

export const CACHE_TTL_METADATA = 'cacheTTL';
export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_METADATA, ttl);
