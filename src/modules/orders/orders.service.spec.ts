import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

describe('OrdersService', () => {
  let service: OrdersService;

  const mockTx = {
    order: { create: jest.fn() },
    product: { updateMany: jest.fn() },
  };

  const mockPrisma = {
    address: { findFirst: jest.fn() },
    product: { findUnique: jest.fn() },
    order: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: (tx: typeof mockTx) => unknown) =>
      callback(mockTx),
    ),
  };

  const mockLoyaltyService = {
    calculatePointsEarned: jest.fn(),
    addPoints: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoyaltyService, useValue: mockLoyaltyService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Regressão do IDOR encontrado em GET /orders/:id/upsell-offers: o
  // pedido só pode ser retornado se pertencer ao usuário autenticado.
  describe('findOne (proteção contra IDOR)', () => {
    const order = { id: 'order-a', userId: 'user-a', orderItems: [] };

    it('usuário A acessando o próprio pedido A → permitido', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(order);

      const result = await service.findOne('order-a', 'user-a');

      expect(result).toEqual(order);
      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-a', userId: 'user-a' },
        }),
      );
    });

    it('usuário A tentando acessar o pedido B → bloqueado', async () => {
      // findFirst com { id: 'order-b', userId: 'user-a' } não encontra nada,
      // pois o pedido pertence a outro usuário.
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne('order-b', 'user-a')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('admin (sem userId) pode acessar qualquer pedido', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(order);

      const result = await service.findOne('order-a');

      expect(result).toEqual(order);
      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-a' } }),
      );
    });
  });

  // Regressão da condição de corrida de estoque: dois checkouts do último
  // item em disputa não podem ambos ter sucesso.
  describe('create (atomicidade do estoque)', () => {
    const dto = {
      addressId: 'addr-1',
      items: [{ productId: 'prod-1', quantity: 1 }],
      shippingCost: 0,
    } as any;

    beforeEach(() => {
      mockPrisma.address.findFirst.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-a',
      });
      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Último produto em estoque',
        price: 100,
        stock: 1,
        isActive: true,
      });
      mockTx.order.create.mockResolvedValue({
        id: 'order-new',
        orderItems: [],
      });
    });

    it('decrementa o estoque quando há quantidade suficiente', async () => {
      mockTx.product.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.create('user-a', dto);

      expect(result).toEqual({ id: 'order-new', orderItems: [] });
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'prod-1', stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      });
    });

    it('perde a corrida quando outro checkout decrementou o estoque primeiro', async () => {
      // updateMany com WHERE stock >= quantity não afeta nenhuma linha:
      // outro pedido concorrente já consumiu o estoque disponível.
      mockTx.product.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create('user-a', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
