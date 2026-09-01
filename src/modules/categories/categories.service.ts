import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoryNotFoundException } from '../../common/exceptions/custom-exceptions';
import { LoggerService } from '../../common/logger/logger.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from '../../common/utils/slug.util';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private logger: LoggerService,
  ) {}

  async findAll() {
    const cacheKey = 'categories:all';

    // Try cache first (15 minutes TTL for categories)
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`, 'CategoriesService');
      return cached;
    }

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Cache for 15 minutes
    await this.cache.set(cacheKey, categories, 900);

    return categories;
  }

  async findOne(id: string) {
    const cacheKey = `category:${id}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new CategoryNotFoundException(id);
    }

    await this.cache.set(cacheKey, category, 900);

    return category;
  }

  async create(data: CreateCategoryDto) {
    const category = await this.prisma.category.create({
      data: {
        ...data,
        slug: data.slug || slugify(data.name),
      },
    });

    await this.invalidateCategoriesCache();

    this.logger.logBusinessEvent('CATEGORY_CREATED', {
      categoryId: category.id,
    });

    return category;
  }

  async update(id: string, data: UpdateCategoryDto) {
    const category = await this.prisma.category.update({
      where: { id },
      data,
    });

    await this.cache.del(`category:${id}`);
    await this.cache.del(`category:slug:${category.slug}`);
    await this.invalidateCategoriesCache();

    this.logger.logBusinessEvent('CATEGORY_UPDATED', { categoryId: id });

    return category;
  }

  async remove(id: string) {
    const category = await this.prisma.category.delete({
      where: { id },
    });

    await this.cache.del(`category:${id}`);
    await this.invalidateCategoriesCache();

    this.logger.logBusinessEvent('CATEGORY_DELETED', { categoryId: id });

    return category;
  }

  private async invalidateCategoriesCache() {
    await this.cache.del('categories:all');
  }
}
