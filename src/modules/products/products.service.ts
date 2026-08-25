import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductNotFoundException } from '../../common/exceptions/custom-exceptions';
import { LoggerService } from '../../common/logger/logger.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: any,
    private logger: LoggerService,
  ) {}

  async findAll(params: any) {
    const cacheKey = `products:all:${JSON.stringify(params)}`;

    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`, 'ProductsService');
      return cached;
    }

    // Fetch from database
    const startTime = Date.now();
    const products = await this.prisma.product.findMany({
      where: params.where,
      include: {
        category: true,
      },
      take: params.take || 20,
      skip: params.skip || 0,
      orderBy: params.orderBy || { createdAt: 'desc' },
    });

    const duration = Date.now() - startTime;
    this.logger.logDatabaseQuery('product.findMany', duration);

    // Cache for 5 minutes
    await this.cache.set(cacheKey, products, 300);

    return products;
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
