import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiProperty({ example: 'Loja do João' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'loja-do-joao' })
  @IsString()
  @MaxLength(140)
  slug: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
