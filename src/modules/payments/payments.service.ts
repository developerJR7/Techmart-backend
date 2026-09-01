import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePixPaymentDto } from './dto/create-pix-payment.dto';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.util';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private ordersService: OrdersService,
    private prisma: PrismaService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not defined - Stripe features will be disabled',
      );
    } else {
      this.stripe = new Stripe(stripeKey, {
        apiVersion: '2025-10-29.clover',
      });
      this.logger.log('Stripe initialized successfully');
    }
  }

  async createCheckoutSession(orderId: string, userId: string) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured');
    }

    try {
      const order = await this.ordersService.findOne(orderId, userId);

      if (order.status !== 'PENDING') {
        throw new BadRequestException('Pedido não está pendente');
      }

      const lineItems = order.orderItems.map((item) => ({
        price_data: {
          currency: 'brl',
          product_data: {
            name: item.product.name,
            images: item.product.image ? [item.product.image] : [],
          },
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: item.quantity,
      }));

      // Adicionar frete
      if (Number(order.shippingCost) > 0) {
        lineItems.push({
          price_data: {
            currency: 'brl',
            product_data: {
              name: 'Frete',
              images: [],
            },
            unit_amount: Math.round(Number(order.shippingCost) * 100),
          },
          quantity: 1,
        });
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/cancel`,
        metadata: {
          orderId: order.id,
          userId: userId,
        },
      });

      // Atualizar pedido com session ID
      await this.ordersService.updateStripeSession(order.id, session.id);

      this.logger.log(`Checkout session created for order ${orderId}`);

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create checkout session: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async createPixPayment(
    createPixPaymentDto: CreatePixPaymentDto,
    userId: string,
  ) {
    try {
      const { orderId, amount } = createPixPaymentDto;

      const order = await this.ordersService.findOne(orderId, userId);

      if (order.status !== 'PENDING') {
        throw new BadRequestException('Pedido não está pendente');
      }

      // Verificar se o valor está correto
      if (Math.abs(Number(order.total) - amount) > 0.01) {
        throw new BadRequestException(
          'Valor do pagamento não corresponde ao total do pedido',
        );
      }

      // Gerar QR Code PIX (simulado - em produção usar API do banco)
      const pixCode = this.generatePixCode(amount, orderId);
      const pixExpiresAt = new Date();
      pixExpiresAt.setMinutes(pixExpiresAt.getMinutes() + 30); // 30 minutos para pagar

      // Criar registro de pagamento
      const payment = await this.prisma.payment.create({
        data: {
          orderId,
          amount,
          method: 'PIX',
          status: 'PENDING',
          pixQrCode: pixCode,
          pixQrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`,
          pixExpiresAt,
        },
      });

      this.logger.log(`PIX payment created for order ${orderId}`);

      return {
        paymentId: payment.id,
        pixQrCode: payment.pixQrCode,
        pixQrCodeUrl: payment.pixQrCodeUrl,
        expiresAt: payment.pixExpiresAt,
        amount: Number(payment.amount),
      };
    } catch (error) {
      this.logger.error(
        `Failed to create PIX payment: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async getPaymentStatus(orderId: string, userId: string) {
    try {
      const order = await this.ordersService.findOne(orderId, userId);

      const payment = await this.prisma.payment.findUnique({
        where: { orderId: order.id },
      });

      if (!payment) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      return {
        id: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        method: payment.method,
        amount: Number(payment.amount),
        pixQrCode: payment.pixQrCode,
        pixQrCodeUrl: payment.pixQrCodeUrl,
        pixExpiresAt: payment.pixExpiresAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get payment status: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async handleWebhook(signature: string, payload: Buffer) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured');
    }

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not defined in configuration');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.error(
        `Webhook signature verification failed: ${getErrorMessage(err)}`,
      );
      throw new Error(
        `Webhook signature verification failed: ${getErrorMessage(err)}`,
      );
    }

    this.logger.log(`Received webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object);
          break;
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process webhook: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }

    return { received: true };
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const order = await this.prisma.order.findUnique({
      where: { stripeSessionId: session.id },
    });

    if (order) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          stripePaymentId: session.payment_intent as string,
          status: 'PROCESSING',
        },
      });

      // Criar ou atualizar registro de pagamento
      await this.prisma.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          amount: order.total,
          method: 'CARD',
          status: 'COMPLETED',
          stripePaymentId: session.payment_intent as string,
        },
        update: {
          status: 'COMPLETED',
          stripePaymentId: session.payment_intent as string,
        },
      });

      this.logger.log(`Order ${order.id} payment completed`);
    }
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentId: paymentIntent.id },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'COMPLETED' },
      });

      this.logger.log(`Payment ${payment.id} succeeded`);
    }
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentId: paymentIntent.id },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'CANCELLED' },
      });

      this.logger.log(`Payment ${payment.id} failed`);
    }
  }

  private generatePixCode(amount: number, orderId: string): string {
    // Simulação de código PIX - em produção, usar API do banco
    // Formato simplificado do PIX copia-e-cola
    const merchantName = 'TECHMART';
    const merchantCity = 'SAO PAULO';
    const txid = orderId.substring(0, 25);

    return `00020126580014br.gov.bcb.pix0136${txid}52040000530398654${amount.toFixed(2)}5802BR5913${merchantName}6009${merchantCity}62070503***6304`;
  }
}
