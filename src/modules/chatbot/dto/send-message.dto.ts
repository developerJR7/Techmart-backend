import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'Mensagem do usuário',
    example: 'Quais produtos vocês têm em estoque?',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'ID da conversa (opcional para nova conversa)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
