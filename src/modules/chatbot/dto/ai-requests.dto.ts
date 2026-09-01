import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ example: 'Olá, preciso de ajuda com meu pedido' })
  @IsString()
  message: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  userId?: string;
}

export class QuickActionDto {
  @ApiProperty({
    enum: [
      'CONTACT_REPRESENTATIVE',
      'SCHEDULE_CALL',
      'TRACK_ORDER',
      'VIEW_PRODUCTS',
    ],
  })
  @IsEnum([
    'CONTACT_REPRESENTATIVE',
    'SCHEDULE_CALL',
    'TRACK_ORDER',
    'VIEW_PRODUCTS',
  ])
  action: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  data?: {
    orderId?: string;
    productQuery?: string;
    preferredTime?: string;
  };
}

export class AdminAnalyticsQueryDto {
  @ApiProperty({ example: 'Analise as vendas do último mês' })
  @IsString()
  query: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  context?: {
    timeRange?: '7d' | '30d' | '90d' | '1y';
    includeData?: boolean;
  };
}

export class GenerateProductDto {
  @ApiProperty({ example: 'Notebook gamer de alta performance' })
  @IsString()
  prompt: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  priceRange?: {
    min: number;
    max: number;
  };

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  generateImage?: boolean;
}

export class ImproveDescriptionDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsString()
  currentDescription: string;

  @ApiProperty({
    enum: ['professional', 'casual', 'technical'],
    default: 'professional',
  })
  @IsEnum(['professional', 'casual', 'technical'])
  @IsOptional()
  tone?: string;

  @ApiProperty({
    enum: ['features', 'benefits', 'specifications'],
    default: 'benefits',
  })
  @IsEnum(['features', 'benefits', 'specifications'])
  @IsOptional()
  focus?: string;
}
