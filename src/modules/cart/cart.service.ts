import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { getErrorMessage } from '../../common/utils/error.util';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          userId,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
      });
    }

    // Calcular totais
    const subtotal = cart.items.reduce((sum, item) => {
      return sum + Number(item.product.price) * item.quantity;
    }, 0);

    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      ...cart,
      subtotal,
      itemCount,
    };
  }

  async addItem(userId: string, addToCartDto: AddToCartDto) {
    const { productId, quantity } = addToCartDto;

    // Verificar se o produto existe e está ativo
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Produto não encontrado');
    }

    if (product.stock < quantity) {
      throw new BadRequestException('Estoque insuficiente');
    }

    // Obter ou criar carrinho
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
      });
    }
    const cartId = cart.id;

    // upsert com incremento atômico dentro de uma transação: duas
    // requisições concorrentes pro mesmo produto (ex.: duplo clique) não se
    // pisam em "ler quantidade antiga -> escrever nova" (lost update) nem
    // colidem na constraint única cartId_productId (race entre dois
    // creates). A checagem de estoque acima é otimista (lida antes do
    // upsert) e não cobre o incremento concorrente — revalidamos o
    // resultado final dentro da mesma transação e, se exceder o estoque
    // real, o throw desfaz o upsert inteiro (tudo ou nada).
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.upsert({
        where: { cartId_productId: { cartId, productId } },
        create: { cartId, productId, quantity },
        update: { quantity: { increment: quantity } },
      });

      if (item.quantity > product.stock) {
        throw new BadRequestException('Estoque insuficiente');
      }
    });

    return this.getCart(userId);
  }

  async updateItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundException('Carrinho não encontrado');
    }

    const cartItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      include: {
        product: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }

    if (cartItem.product.stock < quantity) {
      throw new BadRequestException('Estoque insuficiente');
    }

    await this.prisma.cartItem.update({
      where: { id: cartItem.id },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundException('Carrinho não encontrado');
    }

    const cartItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    if (!cartItem) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }

    await this.prisma.cartItem.delete({
      where: { id: cartItem.id },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundException('Carrinho não encontrado');
    }

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.getCart(userId);
  }

  async mergeGuestCart(userId: string, guestCartItems: AddToCartDto[]) {
    // Best-effort: um item do carrinho de convidado que não existe mais ou
    // ficou sem estoque não pode impedir os outros itens válidos de serem
    // mesclados. Mas ao contrário da versão anterior, o motivo de cada
    // falha é reportado no retorno em vez de só logado — sem falha
    // silenciosa pro usuário que acabou de logar.
    const skipped: Array<{ productId: string; reason: string }> = [];

    for (const item of guestCartItems) {
      try {
        await this.addItem(userId, item);
      } catch (error) {
        skipped.push({
          productId: item.productId,
          reason: getErrorMessage(error),
        });
      }
    }

    const cart = await this.getCart(userId);
    return { ...cart, skippedItems: skipped };
  }
}
