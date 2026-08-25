import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePixPaymentDto } from './dto/create-pix-payment.dto';
import { PaymentStatusDto } from './dto/payment-status.dto';
import { Request } from 'express';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Criar sessão de checkout Stripe',
    description:
      'Cria uma sessão de checkout do Stripe para pagamento com cartão de crédito',
  })
  @ApiResponse({ status: 200, description: 'Sessão criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Pedido inválido ou não pendente' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  async createCheckout(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.createCheckoutSession(orderId, user.id);
  }

  @Post('pix')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Criar pagamento PIX',
    description: 'Gera um QR Code PIX para pagamento do pedido',
  })
  @ApiResponse({ status: 201, description: 'Pagamento PIX criado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado' })
  async createPixPayment(
    @Body() createPixPaymentDto: CreatePixPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.createPixPayment(createPixPaymentDto, user.id);
  }

  @Get(':orderId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verificar status do pagamento',
    description: 'Retorna o status atual do pagamento de um pedido',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retornado com sucesso',
    type: PaymentStatusDto,
  })
  @ApiResponse({ status: 404, description: 'Pagamento não encontrado' })
  async getPaymentStatus(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.getPaymentStatus(orderId, user.id);
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook do Stripe',
    description: 'Endpoint para receber notificações de eventos do Stripe',
  })
  @ApiResponse({ status: 200, description: 'Webhook processado com sucesso' })
  @ApiResponse({ status: 400, description: 'Assinatura inválida' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    if (!req.rawBody) {
      throw new Error('Raw body is required for webhook');
    }
    return this.paymentsService.handleWebhook(signature, req.rawBody);
  }
}
