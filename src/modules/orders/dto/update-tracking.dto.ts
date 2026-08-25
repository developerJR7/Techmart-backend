import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTrackingDto {
  @ApiProperty({
    description: 'Código de rastreio',
    example: 'BR123456789BR',
  })
  @IsString()
  trackingCode: string;

  @ApiProperty({
    description: 'Transportadora',
    example: 'correios',
    enum: ['correios', 'jadlog', 'totalexpress', 'azulcargo', 'sedex'],
  })
  @IsString()
  carrier: string;

  @ApiProperty({
    description: 'URL de rastreamento',
    example: 'https://rastreamento.correios.com.br/app/index.php',
    required: false,
  })
  @IsOptional()
  @IsString()
  trackingUrl?: string;
}
