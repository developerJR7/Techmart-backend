import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUpsellDto {
  @ApiProperty({ description: 'Product ID to offer as upsell' })
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Discount percentage for upsell', example: 20 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountPercent?: number;

  @ApiProperty({
    description: 'Upsell message',
    example: 'Add a protective case for 20% off!',
  })
  @IsString()
  @IsOptional()
  message?: string;
}
