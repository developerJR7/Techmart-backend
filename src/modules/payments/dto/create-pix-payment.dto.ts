import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePixPaymentDto {
  @ApiProperty({
    description: 'ID do pedido',
    example: 'uuid-do-pedido',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    description: 'Valor do pagamento em reais',
    example: 150.0,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;
}
