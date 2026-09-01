import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ProductNotFoundException } from '../../common/exceptions/custom-exceptions';
import { LoggerService } from '../../common/logger/logger.service';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockPrisma = {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    logRequest: jest.fn(),
    logDatabaseQuery: jest.fn(),
    logBusinessEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return cached products if available', async () => {
      const cachedProducts = [{ id: '1', name: 'Product 1' }];
      mockCache.get.mockResolvedValue(cachedProducts);

      const result = await service.findAll({});

      expect(mockCache.get).toHaveBeenCalledWith('products:all:{}');
      expect(result).toEqual(cachedProducts);
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not cached', async () => {
      const products = [{ id: '1', name: 'Product 1' }];
      mockCache.get.mockResolvedValue(null);
      mockPrisma.product.findMany.mockResolvedValue(products);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.findAll({});

      const expected = {
        data: products,
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      };

      expect(mockCache.get).toHaveBeenCalled();
      expect(mockPrisma.product.findMany).toHaveBeenCalled();
      expect(mockPrisma.product.count).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith(
        'products:all:{}',
        expected,
        300,
      );
      expect(result).toEqual(expected);
    });

    it('filtra por categoria, busca, faixa de preço e destaque', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({
        categoryId: 'cat-1',
        search: 'notebook',
        minPrice: 100,
        maxPrice: 500,
        featured: true,
        page: 2,
        limit: 10,
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            categoryId: 'cat-1',
            OR: [
              { name: { contains: 'notebook', mode: 'insensitive' } },
              { description: { contains: 'notebook', mode: 'insensitive' } },
            ],
            price: { gte: 100, lte: 500 },
            isFeatured: true,
          },
          take: 10,
          skip: 10, // (page 2 - 1) * limit 10
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      const product = { id: '1', name: 'Product 1' };
      mockCache.get.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(product);

      const result = await service.findOne('1');

      expect(result).toEqual(product);
      expect(mockCache.set).toHaveBeenCalledWith('product:1', product, 300);
    });

    it('should throw ProductNotFoundException if not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(
        ProductNotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a new product', async () => {
      const createDto = {
        name: 'New Product',
        description: 'Description',
        price: 100,
        categoryId: '1',
        stock: 10,
      };
      const createdProduct = { id: '1', ...createDto };
      mockPrisma.product.create.mockResolvedValue(createdProduct);

      const result = await service.create(createDto);

      expect(result).toEqual(createdProduct);
      expect(mockCache.del).toHaveBeenCalledWith('products:all:*');
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      const updateDto = { name: 'Updated Product' };
      const updatedProduct = { id: '1', ...updateDto };
      mockPrisma.product.update.mockResolvedValue(updatedProduct);

      const result = await service.update('1', updateDto);

      expect(result).toEqual(updatedProduct);
      expect(mockCache.del).toHaveBeenCalledWith('product:1');
      expect(mockCache.del).toHaveBeenCalledWith('products:all:*');
    });
  });

  describe('remove', () => {
    it('should delete a product', async () => {
      mockPrisma.product.delete.mockResolvedValue({ id: '1' });

      await service.remove('1');

      expect(mockPrisma.product.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(mockCache.del).toHaveBeenCalledWith('product:1');
    });
  });
});
