import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ProductNotFoundException } from '../../common/exceptions/custom-exceptions';
import { LoggerService } from '../../common/logger/logger.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;
  let cache: any;

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
    prisma = module.get<PrismaService>(PrismaService);
    cache = module.get(CACHE_MANAGER);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return cached products if available', async () => {
      const cachedProducts = [{ id: '1', name: 'Product 1' }];
      mockCache.get.mockResolvedValue(cachedProducts);

      const result = await service.findAll({});

      expect(cache.get).toHaveBeenCalledWith('products:all:{}');
      expect(result).toEqual(cachedProducts);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not cached', async () => {
      const products = [{ id: '1', name: 'Product 1' }];
      mockCache.get.mockResolvedValue(null);
      mockPrisma.product.findMany.mockResolvedValue(products);

      const result = await service.findAll({});

      expect(cache.get).toHaveBeenCalled();
      expect(prisma.product.findMany).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledWith('products:all:{}', products, 300);
      expect(result).toEqual(products);
    });
  });

  describe('findOne', () => {
    it('should return a product by id', async () => {
      const product = { id: '1', name: 'Product 1' };
      mockCache.get.mockResolvedValue(null);
      mockPrisma.product.findUnique.mockResolvedValue(product);

      const result = await service.findOne('1');

      expect(result).toEqual(product);
      expect(cache.set).toHaveBeenCalledWith('product:1', product, 300);
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
      expect(cache.del).toHaveBeenCalledWith('products:all:*');
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      const updateDto = { name: 'Updated Product' };
      const updatedProduct = { id: '1', ...updateDto };
      mockPrisma.product.update.mockResolvedValue(updatedProduct);

      const result = await service.update('1', updateDto);

      expect(result).toEqual(updatedProduct);
      expect(cache.del).toHaveBeenCalledWith('product:1');
      expect(cache.del).toHaveBeenCalledWith('products:all:*');
    });
  });

  describe('remove', () => {
    it('should delete a product', async () => {
      mockPrisma.product.delete.mockResolvedValue({ id: '1' });

      await service.remove('1');

      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(cache.del).toHaveBeenCalledWith('product:1');
    });
  });
});
