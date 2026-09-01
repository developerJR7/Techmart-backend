import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductNotFoundException } from '../../common/exceptions/custom-exceptions';
import { LoggerService } from '../../common/logger/logger.service';

type ProductsListResult = {
  data: Prisma.ProductGetPayload<{ include: { category: true } }>[];
  meta: { total: number; page: number; lastPage: number; limit: number };
};

export interface FindProductsParams {
  categoryId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  featured?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private logger: LoggerService,
  ) {}

  async findAll(params: FindProductsParams) {
    const cacheKey = `products:all:${JSON.stringify(params)}`;

    // Try cache first
    const cached = await this.cache.get<ProductsListResult>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`, 'ProductsService');
      return cached;
    }

    const page = Math.max(1, Math.floor(params.page ?? 1) || 1);
    const limit = params.limit || 20;

    const where: Prisma.ProductWhereInput = { isActive: true };
    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.price = {
        ...(params.minPrice !== undefined && { gte: params.minPrice }),
        ...(params.maxPrice !== undefined && { lte: params.maxPrice }),
      };
    }
    if (params.minRating !== undefined) {
      where.averageRating = { gte: params.minRating };
    }
    if (params.inStock) {
      where.stock = { gt: 0 };
    }
    if (params.featured) {
      where.isFeatured = true;
    }

    // Allowlist explícita — nunca repassar `sort`/`orderBy` do client direto
    // pro Prisma (client controlaria orderBy arbitrário sobre qualquer coluna).
    const orderByMap: Record<string, Record<string, unknown>> = {
      relevance: { createdAt: 'desc' },
      newest: { createdAt: 'desc' },
      price_asc: { price: 'asc' },
      price_desc: { price: 'desc' },
      // `nulls: 'last'` — sem isso o Postgres usa NULLS FIRST em DESC por
      // padrão, o que colocaria produtos sem nenhuma review acima dos
      // 5 estrelas na ordenação "Melhor avaliados".
      rating_desc: { averageRating: { sort: 'desc', nulls: 'last' } },
    };
    const orderBy =
      orderByMap[params.sort ?? 'relevance'] ?? orderByMap.relevance;

    // Fetch from database
    const startTime = Date.now();
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
        },
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
      }),
      this.prisma.product.count({ where }),
    ]);

    const duration = Date.now() - startTime;
    this.logger.logDatabaseQuery('product.findMany', duration);

    const result = {
      data,
      meta: { total, page, lastPage: Math.ceil(total / limit) || 1, limit },
    };

    // Cache for 5 minutes
    await this.cache.set(cacheKey, result, 300);

    return result;
  }

  async findOne(id: string) {
    const cacheKey = `product:${id}`;

    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new ProductNotFoundException(id);
    }

    // Cache for 5 minutes
    await this.cache.set(cacheKey, product, 300);

    return product;
  }

  async findBySlug(slug: string) {
    const cacheKey = `product:slug:${slug}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new ProductNotFoundException(slug);
    }

    await this.cache.set(cacheKey, product, 300);

    return product;
  }

  async create(data: any) {
    const product = await this.prisma.product.create({
      data,
      include: {
        category: true,
      },
    });

    // Invalidate cache
    await this.invalidateProductsCache();

    this.logger.logBusinessEvent('PRODUCT_CREATED', { productId: product.id });

    return product;
  }

  async update(id: string, data: any) {
    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    });

    // Invalidate specific product cache
    await this.cache.del(`product:${id}`);
    await this.cache.del(`product:slug:${product.slug}`);
    await this.invalidateProductsCache();

    this.logger.logBusinessEvent('PRODUCT_UPDATED', { productId: id });

    return product;
  }

  async remove(id: string) {
    const product = await this.prisma.product.delete({
      where: { id },
    });

    // Invalidate cache
    await this.cache.del(`product:${id}`);
    await this.cache.del(`product:slug:${product.slug}`);
    await this.invalidateProductsCache();

    this.logger.logBusinessEvent('PRODUCT_DELETED', { productId: id });

    return product;
  }

  async findRelated(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { categoryId: true },
    });

    if (!product) {
      throw new ProductNotFoundException(id);
    }

    const related = await this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: id },
        isActive: true,
      },
      take: 4,
      include: {
        category: true,
      },
    });

    return related;
  }

  private async invalidateProductsCache() {
    // Note: This is a simple implementation
    // For production, consider using Redis SCAN or key patterns
    const keys = ['products:all:*', 'products:featured', 'products:category:*'];
    for (const key of keys) {
      await this.cache.del(key);
    }
  }
}
