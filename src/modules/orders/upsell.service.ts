import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface UpsellOffer {
  productId: string;
  discountPercent?: number;
  message?: string;
}

@Injectable()
export class UpsellService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2025-10-29.clover',
      });
    }
  }

  /**
   * Generate smart upsell offers based on order
   */
  async generateUpsellOffers(orderId: string): Promise<UpsellOffer[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: { product: { include: { category: true } } },
        },
      },
    });

    if (!order) {
      throw new BadRequestException('Pedido não encontrado');
    }

    const offers: UpsellOffer[] = [];
    const purchasedCategories = new Set(
      order.orderItems.map((item) => item.product.category.id),
    );
    const purchasedProducts = new Set(
      order.orderItems.map((item) => item.productId),
    );

    // Strategy 1: Complementary products from same categories
    for (const categoryId of purchasedCategories) {
      const relatedProducts = await this.prisma.product.findMany({
        where: {
          categoryId,
          isActive: true,
          stock: { gt: 0 },
          id: { notIn: Array.from(purchasedProducts) },
        },
        take: 2,
        orderBy: { stock: 'desc' },
      });

      relatedProducts.forEach((product) => {
        offers.push({
          productId: product.id,
          discountPercent: 15,
          message: `Complete sua compra com ${product.name} por 15% off!`,
        });
      });
    }

    // Strategy 2: Popular accessories (if bought electronics)
    const hasElectronics = order.orderItems.some((item) =>
      ['Eletrônicos', 'Smartphones', 'Notebooks'].includes(
        item.product.category.name,
      ),
    );

    if (hasElectronics) {
      const accessories = await this.prisma.product.findMany({
        where: {
          category: { name: { in: ['Acessórios', 'Fones de Ouvido'] } },
          isActive: true,
          stock: { gt: 0 },
          id: { notIn: Array.from(purchasedProducts) },
        },
        take: 2,
        orderBy: { stock: 'desc' },
      });

      accessories.forEach((product) => {
        offers.push({
          productId: product.id,
          discountPercent: 20,
          message: `Proteja seu investimento! ${product.name} com 20% de desconto.`,
        });
      });
    }

    // Return top 3 offers
    return offers.slice(0, 3);
  }

  /**
   * Process one-click upsell purchase
   */
  async processUpsell(
    orderId: string,
    productId: string,
    userId: string,
  ): Promise<any> {
    // Get original order with payment info
    const originalOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!originalOrder) {
      throw new BadRequestException('Pedido original não encontrado');
    }

    if (originalOrder.userId !== userId) {
      throw new BadRequestException('Pedido não pertence ao usuário');
    }

    if (!originalOrder.payment) {
      throw new BadRequestException('Pagamento original não encontrado');
    }

    // Get product
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive || product.stock < 1) {
      throw new BadRequestException('Produto indisponível');
    }

    // Calculate upsell price (with discount if applicable)
    const upsellPrice = Number(product.price) * 0.85; // 15% discount
    const total = upsellPrice;

    try {
      // Create payment intent using saved payment method
      if (!this.stripe) {
        throw new BadRequestException('Stripe não configurado');
      }

      // Note: For upsell to work with saved payment methods,
      // you would need to add customer and payment_method fields to Payment model
      // or retrieve them from a different source (e.g. User model if stored there)
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(total * 100), // Convert to cents
        currency: 'brl',
        // customer: originalOrder.payment.stripeCustomerId, // Field does not exist
        // payment_method: originalOrder.payment.stripePaymentMethodId, // Field does not exist
        off_session: true,
        confirm: true,
        description: `Upsell: ${product.name}`,
        metadata: {
          orderId,
          productId,
          userId,
          type: 'upsell',
        },
      });

      // Create new order for upsell
      const upsellOrder = await this.prisma.order.create({
        data: {
          userId,
          addressId: originalOrder.addressId,
          subtotal: upsellPrice,
          shippingCost: 0, // Free shipping for upsell
          total,
          status: 'PROCESSING',
          orderItems: {
            create: {
              productId: product.id,
              quantity: 1,
              price: upsellPrice,
            },
          },
        },
        include: { orderItems: true },
      });

      // Create payment record
      await this.prisma.payment.create({
        data: {
          orderId: upsellOrder.id,
          amount: total,
          status: 'COMPLETED',
          method: 'CARD',
          stripePaymentId: paymentIntent.id,
          // stripeCustomerId: originalOrder.payment.stripeCustomerId, // Field does not exist
          // stripePaymentMethodId: originalOrder.payment.stripePaymentMethodId, // Field does not exist
        },
      });

      // Update product stock
      await this.prisma.product.update({
        where: { id: productId },
        data: { stock: { decrement: 1 } },
      });

      return {
        success: true,
        order: upsellOrder,
        message: 'Upsell processado com sucesso!',
      };
    } catch (error) {
      console.error('Erro ao processar upsell:', error);
      throw new BadRequestException(
        'Erro ao processar pagamento. Tente novamente.',
      );
    }
  }
}
