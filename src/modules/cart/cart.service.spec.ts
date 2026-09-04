import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CartService', () => {
  let service: CartService;

  const mockTx = {
    cartItem: { upsert: jest.fn() },
  };

  const mockPrisma = {
    cart: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof mockTx) => unknown) =>
      callback(mockTx),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const activeProduct = {
    id: 'prod-1',
    name: 'Produto teste',
    price: 100,
    stock: 5,
    isActive: true,
  };

  const emptyCartInclude = (userId: string) => ({
    id: 'cart-1',
    userId,
    items: [],
  });

  // getCart é chamado no final de todo método de escrita — mockamos o
  // resultado direto para isolar o comportamento de cada operação.
  const mockGetCartResult = (userId: string) => {
    mockPrisma.cart.findUnique.mockResolvedValueOnce(emptyCartInclude(userId));
  };

  describe('addItem — validação de produto e estoque', () => {
    it('rejeita produto inexistente', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.addItem('user-a', { productId: 'ghost', quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita produto inativo', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        ...activeProduct,
        isActive: false,
      });

      await expect(
        service.addItem('user-a', { productId: 'prod-1', quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita quantidade acima do estoque disponível', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(activeProduct);

      await expect(
        service.addItem('user-a', { productId: 'prod-1', quantity: 999 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nunca confia em preço/estoque do cliente — o subtotal do carrinho vem do produto real, não do DTO', async () => {
      // AddToCartDto (add-to-cart.dto.ts) só tem productId/quantity: não
      // existe campo price/stock que o cliente possa mandar. getCart
      // recalcula subtotal a partir de item.product.price (lido do banco).
      mockPrisma.product.findUnique.mockResolvedValue(activeProduct);
      mockPrisma.cart.findUnique.mockResolvedValueOnce(null);
      mockPrisma.cart.create.mockResolvedValueOnce({
        id: 'cart-1',
        userId: 'user-a',
      });
      mockTx.cartItem.upsert.mockResolvedValueOnce({
        id: 'item-1',
        quantity: 1,
      });
      mockGetCartResult('user-a');

      await service.addItem('user-a', { productId: 'prod-1', quantity: 1 });

      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      });
    });
  });

  describe('addItem — condição de corrida (duplo clique / requisições concorrentes)', () => {
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(activeProduct);
      mockPrisma.cart.findUnique.mockResolvedValueOnce({
        id: 'cart-1',
        userId: 'user-a',
      });
    });

    it('usa upsert com incremento atômico (não lê-então-escreve)', async () => {
      mockTx.cartItem.upsert.mockResolvedValueOnce({
        id: 'item-1',
        quantity: 3,
      });
      mockGetCartResult('user-a');

      await service.addItem('user-a', { productId: 'prod-1', quantity: 3 });

      expect(mockTx.cartItem.upsert).toHaveBeenCalledWith({
        where: { cartId_productId: { cartId: 'cart-1', productId: 'prod-1' } },
        create: { cartId: 'cart-1', productId: 'prod-1', quantity: 3 },
        update: { quantity: { increment: 3 } },
      });
    });

    it('desfaz o upsert (via exceção dentro da transação) quando o incremento concorrente estoura o estoque real', async () => {
      // Duas requisições concorrentes de quantity=3 cada, estoque real = 5:
      // a segunda a "vencer" a corrida do upsert vê quantity=6 > stock=5.
      mockTx.cartItem.upsert.mockResolvedValueOnce({
        id: 'item-1',
        quantity: 6,
      });

      await expect(
        service.addItem('user-a', { productId: 'prod-1', quantity: 3 }),
      ).rejects.toThrow(BadRequestException);

      // $transaction real do Prisma reverte tudo dentro do callback quando
      // ele lança — não há update manual de "correção" depois.
      expect(mockPrisma.cartItem.update).not.toHaveBeenCalled();
    });
  });

  describe('ownership — carrinho e itens são sempre escopados por userId', () => {
    it('updateItemQuantity: usuário sem carrinho não pode atualizar item', async () => {
      mockPrisma.cart.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateItemQuantity('user-a', 'prod-1', 2),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateItemQuantity: item de outro usuário não é encontrado no carrinho de A (busca sempre via cartId do próprio usuário)', async () => {
      mockPrisma.cart.findUnique.mockResolvedValueOnce({
        id: 'cart-a',
        userId: 'user-a',
      });
      mockPrisma.cartItem.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateItemQuantity('user-a', 'prod-of-user-b-item', 2),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.cartItem.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cartId_productId: {
              cartId: 'cart-a',
              productId: 'prod-of-user-b-item',
            },
          },
        }),
      );
    });

    it('removeItem: usuário sem carrinho não pode remover item', async () => {
      mockPrisma.cart.findUnique.mockResolvedValueOnce(null);

      await expect(service.removeItem('user-a', 'prod-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removeItem: item inexistente no carrinho do próprio usuário é 404, não apaga nada', async () => {
      mockPrisma.cart.findUnique.mockResolvedValueOnce({
        id: 'cart-a',
        userId: 'user-a',
      });
      mockPrisma.cartItem.findUnique.mockResolvedValueOnce(null);

      await expect(service.removeItem('user-a', 'prod-x')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.cartItem.delete).not.toHaveBeenCalled();
    });

    it('clearCart: usuário sem carrinho não gera erro de outro carrinho sendo limpo', async () => {
      mockPrisma.cart.findUnique.mockResolvedValueOnce(null);

      await expect(service.clearCart('user-a')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('updateItemQuantity — validação de estoque', () => {
    it('rejeita quantidade acima do estoque real do produto', async () => {
      mockPrisma.cart.findUnique.mockResolvedValueOnce({
        id: 'cart-a',
        userId: 'user-a',
      });
      mockPrisma.cartItem.findUnique.mockResolvedValueOnce({
        id: 'item-1',
        product: activeProduct,
      });

      await expect(
        service.updateItemQuantity('user-a', 'prod-1', 999),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.cartItem.update).not.toHaveBeenCalled();
    });
  });

  describe('mergeGuestCart — reporta itens não mesclados em vez de falhar silenciosamente', () => {
    it('itens válidos são mesclados; itens inválidos aparecem em skippedItems com o motivo', async () => {
      mockPrisma.product.findUnique
        .mockResolvedValueOnce(activeProduct) // prod-1: ok
        .mockResolvedValueOnce(null); // prod-ghost: não existe

      mockPrisma.cart.findUnique
        .mockResolvedValueOnce({ id: 'cart-a', userId: 'user-a' }) // addItem(prod-1): get-or-create cart
        .mockResolvedValueOnce(emptyCartInclude('user-a')) // addItem(prod-1): getCart interno (retorno do método)
        .mockResolvedValueOnce(emptyCartInclude('user-a')); // mergeGuestCart: getCart final

      mockTx.cartItem.upsert.mockResolvedValueOnce({
        id: 'item-1',
        quantity: 1,
      });

      const result = await service.mergeGuestCart('user-a', [
        { productId: 'prod-1', quantity: 1 },
        { productId: 'prod-ghost', quantity: 1 },
      ]);

      expect(result.skippedItems).toEqual([
        { productId: 'prod-ghost', reason: 'Produto não encontrado' },
      ]);
    });
  });
});
