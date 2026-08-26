import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StoreService } from './store.service';
import { SellersService } from './sellers.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StoreService', () => {
  let service: StoreService;

  const mockPrisma = {
    store: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSellersService = {
    getApprovedSellerByUserId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SellersService, useValue: mockSellersService },
      ],
    }).compile();

    service = module.get<StoreService>(StoreService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('cria a loja usando o sellerId resolvido pelo userId autenticado (nunca do body)', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.create.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });

      const result = await service.create('user-a', {
        name: 'Loja A',
        slug: 'loja-a',
      });

      expect(mockPrisma.store.create).toHaveBeenCalledWith({
        data: {
          sellerId: 'seller-a',
          name: 'Loja A',
          slug: 'loja-a',
          description: undefined,
        },
      });
      expect(result.sellerId).toBe('seller-a');
    });

    it('propaga o 403 quando o vendedor não está aprovado', async () => {
      mockSellersService.getApprovedSellerByUserId.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.create('user-a', { name: 'X', slug: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.store.create).not.toHaveBeenCalled();
    });

    it('409 quando slug/sellerId já existe (unique constraint)', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.0',
        }),
      );

      await expect(
        service.create('user-a', { name: 'X', slug: 'x' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findMine', () => {
    it('busca a Store pelo sellerId do usuário autenticado', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });

      const result = await service.findMine('user-a');

      expect(mockPrisma.store.findUnique).toHaveBeenCalledWith({
        where: { sellerId: 'seller-a' },
      });
      expect(result.id).toBe('store-1');
    });

    it('404 quando o vendedor aprovado ainda não criou loja', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findMine('user-a')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('atualiza somente a própria loja, sempre filtrando por sellerId', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });
      mockPrisma.store.update.mockResolvedValue({
        id: 'store-1',
        name: 'Novo nome',
      });

      const result = await service.update('user-a', { name: 'Novo nome' });

      expect(mockPrisma.store.update).toHaveBeenCalledWith({
        where: { sellerId: 'seller-a' },
        data: { name: 'Novo nome' },
      });
      expect(result.name).toBe('Novo nome');
    });

    it('404 quando o vendedor aprovado ainda não tem loja pra atualizar', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-a', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.store.update).not.toHaveBeenCalled();
    });

    it('ignora sellerId mesmo se vier no dto (nunca repassa o dto inteiro pro Prisma)', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });
      mockPrisma.store.update.mockResolvedValue({
        id: 'store-1',
        name: 'X',
      });

      await service.update('user-a', { name: 'X', sellerId: 'seller-b' } as any);

      expect(mockPrisma.store.update).toHaveBeenCalledWith({
        where: { sellerId: 'seller-a' },
        data: expect.not.objectContaining({ sellerId: expect.anything() }),
      });
    });
  });
});
