import { ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AddToCartDto } from './add-to-cart.dto';

// O ValidationPipe global do Nest pula validação quando o tipo do body é um
// array "cru" (metatype Array está na lista de tipos que ele ignora) — um
// `@Body() items: AddToCartDto[]` direto no controller NUNCA valida os itens
// (quantity negativa, productId ausente, etc. passariam). Envelopar em um
// objeto com @ValidateNested força a validação de cada item do array.
export class MergeCartDto {
  @ApiProperty({ type: [AddToCartDto] })
  @ValidateNested({ each: true })
  @Type(() => AddToCartDto)
  @ArrayMaxSize(100)
  items: AddToCartDto[];
}
