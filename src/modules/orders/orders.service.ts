import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';

import { LoyaltyService } from '../loyalty/loyalty.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
  ) {}

  async create(userId: string, createOrderDto: CreateOrderDto) {
    // Verificar endereço
    const address = await this.prisma.address.findFirst({
      where: {
        id: createOrderDto.addressId,
        userId,
      },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    // Verificar produtos e calcular total
    let total = 0;
    const orderItems: Array<{
      productId: string;
      quantity: number;
      price: Prisma.Decimal;
    }> = [];

    for (const item of createOrderDto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product || !product.isActive) {
        throw new NotFoundException(`Produto ${item.productId} não encontrado`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para o produto ${product.name}`,
        );
      }

      const itemTotal = Number(product.price) * item.quantity;
      total += itemTotal;

      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
      });
    }

    total += createOrderDto.shippingCost;

    // Criar pedido e baixar estoque atomicamente, para evitar overselling
    // em checkouts concorrentes (decremento condicional: só passa se ainda
    // houver estoque suficiente no momento da escrita).
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          addressId: address.id,
          total,
          subtotal: total - createOrderDto.shippingCost,
          shippingCost: createOrderDto.shippingCost,
          status: 'PENDING',
          orderItems: {
            create: orderItems,
          },
        },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          address: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      for (const item of createOrderDto.items) {
        const { count } = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });

        if (count === 0) {
          throw new BadRequestException(
            `Estoque insuficiente para o produto ${item.productId}`,
          );
        }
      }

      return order;
    });
  }

  async findAll(userId?: string) {
    const where: Prisma.OrderWhereInput = {};
    if (userId) {
      where.userId = userId;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        address: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findAllAdmin(query: {
    page: number;
    limit: number;
    status?: OrderStatus;
    paymentMethod?: PaymentMethod;
  }) {
    const { page, limit, status, paymentMethod } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (paymentMethod) {
      where.payment = { method: paymentMethod };
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          address: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  async findOne(id: string, userId?: string) {
    const where: Prisma.OrderWhereInput = { id };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
        address: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }

  async findOneAdmin(id: string) {
    return this.findOne(id);
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.findOne(id);
    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    // Award loyalty points if order is delivered
    if (status === 'DELIVERED' && order.status !== 'DELIVERED') {
      const points = this.loyaltyService.calculatePointsEarned(
        Number(order.total),
      );
      await this.loyaltyService.addPoints(
        order.userId,
        points,
        'EARN',
        `Points earned from order #${order.id.slice(0, 8)}`,
        order.id,
      );
    }

    return updatedOrder;
  }

  async updateStripeSession(id: string, stripeSessionId: string) {
    return this.prisma.order.update({
      where: { id },
      data: { stripeSessionId },
    });
  }

  async updateStripePayment(id: string, stripePaymentId: string) {
    return this.prisma.order.update({
      where: { id },
      data: { stripePaymentId, status: 'PROCESSING' },
    });
  }
}
