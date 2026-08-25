import { ApiProperty } from '@nestjs/swagger';

export class PaymentStatusDto {
  @ApiProperty({
    description: 'ID do pagamento',
    example: 'uuid-do-pagamento',
  })
  id: string;

  @ApiProperty({
    description: 'ID do pedido',
    example: 'uuid-do-pedido',
  })
  orderId: string;

  @ApiProperty({
    description: 'Status do pagamento',
    enum: [
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'REFUNDED',
      'CANCELLED',
    ],
    example: 'COMPLETED',
  })
  status: string;

  @ApiProperty({
    description: 'Método de pagamento',
    enum: ['CARD', 'PIX', 'BOLETO'],
    example: 'PIX',
  })
  method: string;

  @ApiProperty({
    description: 'Valor do pagamento',
    example: 150.0,
  })
  amount: number;

  @ApiProperty({
    description: 'QR Code PIX (se aplicável)',
    required: false,
  })
  pixQrCode?: string;

  @ApiProperty({
    description: 'URL do QR Code PIX (se aplicável)',
    required: false,
  })
  pixQrCodeUrl?: string;

  @ApiProperty({
    description: 'Data de expiração do PIX (se aplicável)',
    required: false,
  })
  pixExpiresAt?: Date;

  @ApiProperty({
    description: 'Data de criação',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Data de atualização',
  })
  updatedAt: Date;
}
