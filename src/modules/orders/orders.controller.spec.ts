import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UpsellService } from './upsell.service';
import type { RequestUser } from '../../types/express';

describe('OrdersController', () => {
  let controller: OrdersController;

  const mockOrdersService = {
    findOne: jest.fn(),
    cancel: jest.fn(),
  };

  const mockUpsellService = {
    generateUpsellOffers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: UpsellService, useValue: mockUpsellService },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Regressão do IDOR: GET /orders/:id/upsell-offers não podia ser chamado
  // com o ID de um pedido de outro usuário para descobrir o que ele comprou.
  describe('getUpsellOffers', () => {
    const userA: RequestUser = {
      id: 'user-a',
      role: 'CUSTOMER',
      email: 'user-a@example.com',
      name: 'User A',
      isActive: true,
    };

    it('usuário A acessando as ofertas do próprio pedido A → permitido', async () => {
      mockOrdersService.findOne.mockResolvedValue({ id: 'order-a' });
      mockUpsellService.generateUpsellOffers.mockResolvedValue([
        { productId: 'mouse', discountPercent: 15 },
      ]);

      const result = await controller.getUpsellOffers('order-a', userA);

      expect(mockOrdersService.findOne).toHaveBeenCalledWith(
        'order-a',
        'user-a',
      );
      expect(mockUpsellService.generateUpsellOffers).toHaveBeenCalledWith(
        'order-a',
      );
      expect(result).toEqual([{ productId: 'mouse', discountPercent: 15 }]);
    });

    it('usuário A tentando acessar as ofertas do pedido B → bloqueado', async () => {
      // findOne(id, userId) simula o comportamento real: pedido de outro
      // usuário não é encontrado com o filtro de posse.
      mockOrdersService.findOne.mockRejectedValue(
        new NotFoundException('Pedido não encontrado'),
      );

      await expect(
        controller.getUpsellOffers('order-b', userA),
      ).rejects.toThrow(NotFoundException);

      expect(mockUpsellService.generateUpsellOffers).not.toHaveBeenCalled();
    });

    it('admin acessa ofertas de qualquer pedido sem filtro de dono', async () => {
      const admin: RequestUser = {
        id: 'admin-1',
        role: 'ADMIN',
        email: 'admin-1@example.com',
        name: 'Admin',
        isActive: true,
      };
      mockOrdersService.findOne.mockResolvedValue({ id: 'order-b' });
      mockUpsellService.generateUpsellOffers.mockResolvedValue([]);

      await controller.getUpsellOffers('order-b', admin);

      expect(mockOrdersService.findOne).toHaveBeenCalledWith(
        'order-b',
        undefined,
      );
    });
  });

  describe('cancel', () => {
    const userA: RequestUser = {
      id: 'user-a',
      role: 'CUSTOMER',
      email: 'user-a@example.com',
      name: 'User A',
      isActive: true,
    };

    it('delega ao service sempre com o id do usuário autenticado, nunca um id vindo do cliente', async () => {
      mockOrdersService.cancel.mockResolvedValue({
        id: 'order-a',
        status: 'CANCELLED',
      });

      const result = await controller.cancel('order-a', userA);

      expect(mockOrdersService.cancel).toHaveBeenCalledWith(
        'order-a',
        'user-a',
      );
      expect(result).toEqual({ id: 'order-a', status: 'CANCELLED' });
    });
  });
});
