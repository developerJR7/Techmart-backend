import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SellersService } from './sellers.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SellersService', () => {
  let service: SellersService;

  const mockPrisma = {
    seller: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<any>[]) => Promise.all(ops)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SellersService>(SellersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('apply', () => {
    it('cria um Seller PENDING quando o usuário nunca solicitou antes', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      mockPrisma.seller.create.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });

      const result = await service.apply('u1', { document: '12345678900' });

      expect(mockPrisma.seller.create).toHaveBeenCalledWith({
        data: { userId: 'u1', document: '12345678900', phone: undefined },
      });
      expect(result.status).toBe('PENDING');
    });

    it.each(['PENDING', 'APPROVED', 'SUSPENDED'])(
      'rejeita reaplicação com 409 quando status atual é %s',
      async (status) => {
        mockPrisma.seller.findUnique.mockResolvedValue({
          id: 's1',
          userId: 'u1',
          status,
        });

        await expect(service.apply('u1', {})).rejects.toThrow(
          ConflictException,
        );
        expect(mockPrisma.seller.create).not.toHaveBeenCalled();
      },
    );

    it('reaproveita a linha existente e volta pra PENDING quando estava REJECTED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'REJECTED',
        document: 'old-doc',
        phone: 'old-phone',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'PENDING' });

      const result = await service.apply('u1', { document: 'new-doc' });

      expect(mockPrisma.seller.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { status: 'PENDING', document: 'new-doc', phone: 'old-phone' },
      });
      expect(mockPrisma.seller.create).not.toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
    });

    it('409 quando userId unique constraint violado (double-submit race condition)', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      mockPrisma.seller.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.0',
        }),
      );

      await expect(
        service.apply('u1', { document: 'test-doc' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllForAdmin', () => {
    it('retorna dados paginados no formato { data, meta }', async () => {
      mockPrisma.seller.findMany.mockResolvedValue([
        { id: 's1', status: 'PENDING' },
      ]);
      mockPrisma.seller.count.mockResolvedValue(1);

      const result = await service.findAllForAdmin({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [{ id: 's1', status: 'PENDING' }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });
    });

    it('filtra por status quando informado', async () => {
      mockPrisma.seller.findMany.mockResolvedValue([]);
      mockPrisma.seller.count.mockResolvedValue(0);

      await service.findAllForAdmin({ page: 1, limit: 20, status: 'PENDING' });

      expect(mockPrisma.seller.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
      expect(mockPrisma.seller.count).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
      });
    });
  });

  describe('getApprovedSellerByUserId', () => {
    it('retorna o seller quando APPROVED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      const result = await service.getApprovedSellerByUserId('u1');
      expect(result.id).toBe('s1');
    });

    it('403 quando não existe seller', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      await expect(
        service.getApprovedSellerByUserId('u1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('403 quando existe mas não está APPROVED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      await expect(
        service.getApprovedSellerByUserId('u1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approve', () => {
    it('promove Seller pra APPROVED e User pra SELLER na mesma transação', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'APPROVED' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'SELLER' });
      mockPrisma.$transaction.mockResolvedValue([
        { id: 's1', status: 'APPROVED' },
        { id: 'u1', role: 'SELLER' },
      ]);

      const result = await service.approve('s1');

      expect(mockPrisma.seller.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'APPROVED' },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),
        expect.anything(),
      ]);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: 'SELLER' },
      });
      expect(result.status).toBe('APPROVED');
    });

    it('404 quando o Seller não existe', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      await expect(service.approve('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409 quando o Seller não está PENDING', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      await expect(service.approve('s1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('409 quando o Seller está PENDING mas userId é null', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: null,
        status: 'PENDING',
      });

      await expect(service.approve('s1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('rejeita um PENDING', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });

      const result = await service.reject('s1');

      expect(mockPrisma.seller.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'REJECTED' },
      });
      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('409 quando não está PENDING', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      await expect(service.reject('s1')).rejects.toThrow(ConflictException);
    });
  });

  describe('suspend', () => {
    it('suspende um APPROVED e reverte User pra CUSTOMER', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'SUSPENDED' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'CUSTOMER' });
      mockPrisma.$transaction.mockResolvedValue([
        { id: 's1', status: 'SUSPENDED' },
        { id: 'u1', role: 'CUSTOMER' },
      ]);

      const result = await service.suspend('s1');

      expect(mockPrisma.seller.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'SUSPENDED' },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),
        expect.anything(),
      ]);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: 'CUSTOMER' },
      });
      expect(result.status).toBe('SUSPENDED');
    });

    it('409 quando não está APPROVED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      await expect(service.suspend('s1')).rejects.toThrow(ConflictException);
    });

    it('409 quando o Seller está APPROVED mas userId é null', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: null,
        status: 'APPROVED',
      });

      await expect(service.suspend('s1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
