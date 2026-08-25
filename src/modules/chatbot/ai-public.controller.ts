import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatbotService } from './chatbot.service';
import { AIRecommendationService } from './ai-recommendation.service';
import { ChatMessageDto, QuickActionDto } from './dto/ai-requests.dto';

@ApiTags('AI - Public')
@Controller('ai')
export class AIPublicController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly recommendationService: AIRecommendationService,
  ) {}

  // ========== CHATBOT ==========

  @Post('chatbot/conversations')
  @ApiOperation({ summary: 'Criar/Continuar conversa com chatbot' })
  @ApiResponse({ status: 200, description: 'Resposta do chatbot' })
  async chatWithBot(@Body() dto: ChatMessageDto) {
    const conversationId = dto.conversationId || this.generateConversationId();

    // Enviar mensagem e obter resposta
    const response = await this.chatbotService.sendMessage(
      conversationId,
      dto.message,
      dto.userId,
    );

    return {
      conversationId,
      response: response.message.content,
      suggestions: [
        'Rastrear meu pedido',
        'Ver produtos em promoção',
        'Falar com atendente',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  @Get('chatbot/conversations/:id')
  @ApiOperation({ summary: 'Obter histórico de conversa' })
  async getConversation(@Param('id') id: string) {
    return this.chatbotService.getConversation(id);
  }

  @Post('chatbot/quick-actions')
  @ApiOperation({ summary: 'Executar ação rápida do chatbot' })
  async executeQuickAction(@Body() dto: QuickActionDto) {
    switch (dto.action) {
      case 'CONTACT_REPRESENTATIVE':
        return {
          success: true,
          message:
            'Ticket criado com sucesso. Um representante entrará em contato em breve.',
          data: { ticketId: `TICKET-${Date.now()}` },
        };

      case 'SCHEDULE_CALL':
        return {
          success: true,
          message: 'Chamada agendada com sucesso!',
          data: {
            scheduledAt: dto.data?.preferredTime || new Date().toISOString(),
          },
        };

      case 'TRACK_ORDER':
        // Implementar busca de pedido
        return {
          success: true,
          message: 'Pedido encontrado',
          data: {
            orderStatus: {
              status: 'PROCESSING',
              estimatedDelivery: '3-5 dias',
            },
          },
        };

      case 'VIEW_PRODUCTS':
        // Buscar produtos
        return {
          success: true,
          message: 'Produtos encontrados',
          data: { products: [] },
        };

      default:
        return { success: false, message: 'Ação não reconhecida' };
    }
  }

  // ========== RECOMMENDATIONS ==========

  @Get('recommendations/personalized')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recomendações personalizadas com IA' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'context',
    required: false,
    enum: ['homepage', 'product-page', 'cart', 'checkout'],
  })
  async getPersonalizedRecommendations(
    @CurrentUser() user: any,
    @Query('limit') limit?: number,
    @Query('context') context?: string,
  ) {
    const recommendations =
      await this.recommendationService.getPersonalizedRecommendations(
        user.id,
        limit ? Number(limit) : 10,
        context || 'homepage',
      );

    return {
      recommendations,
      algorithm: 'hybrid',
    };
  }

  @Get('recommendations/similar/:productId')
  @ApiOperation({ summary: 'Produtos similares usando IA' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSimilarProducts(
    @Param('productId') productId: string,
    @Query('limit') limit?: number,
  ) {
    const similar = await this.recommendationService.getSimilarProducts(
      productId,
      limit ? Number(limit) : 6,
    );

    return { similar };
  }

  @Get('recommendations/frequently-bought-together/:productId')
  @ApiOperation({ summary: 'Produtos frequentemente comprados juntos' })
  async getFrequentlyBoughtTogether(@Param('productId') productId: string) {
    return this.recommendationService.getFrequentlyBoughtTogether(productId);
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
