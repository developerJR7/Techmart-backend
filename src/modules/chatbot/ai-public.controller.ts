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
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatbotService } from './chatbot.service';
import { AIRecommendationService } from './ai-recommendation.service';
import { ChatMessageDto, QuickActionDto } from './dto/ai-requests.dto';
import type { RequestUser } from '../../types/express';

@ApiTags('AI - Public')
@Controller('ai')
export class AIPublicController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly recommendationService: AIRecommendationService,
  ) {}

  // ========== CHATBOT ==========

  @Post('chatbot/conversations')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar/Continuar conversa com chatbot' })
  @ApiResponse({ status: 200, description: 'Resposta do chatbot' })
  async chatWithBot(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: ChatMessageDto,
  ) {
    // Identidade vem exclusivamente de @CurrentUser() (JWT opcional, mas
    // validado quando presente) — o corpo da requisição não tem (nem pode
    // ter, o DTO não declara) um campo `userId`. Sem conversationId, cria
    // uma conversa de verdade no banco em vez de um id fake gerado aqui,
    // que nunca existiria pra sendMessage encontrar.
    let conversationId = dto.conversationId;
    // Só emitido quando esta chamada cria uma conversa ANÔNIMA nova — é a
    // única prova de posse dela (ver ChatbotService#getConversation); sem
    // isso, qualquer outro visitante que soubesse o conversationId
    // conseguiria continuá-la só pelo id.
    let conversationToken: string | undefined;

    if (!conversationId) {
      const conversation = await this.chatbotService.createConversation(
        user?.id,
      );
      conversationId = conversation.id;
      if (!user) {
        conversationToken = this.chatbotService.getAnonymousConversationToken(
          conversation.id,
        );
      }
    }

    // Ao criar a conversa nesta mesma chamada, o token que acabamos de
    // gerar É a credencial válida — usar esse, não dto.conversationToken
    // (que o cliente não tem como enviar ainda: ele só existe a partir
    // desta resposta). Ao continuar uma conversa já existente, a única
    // fonte válida é o que o cliente apresentar de volta no corpo.
    const response = await this.chatbotService.sendMessage(
      conversationId,
      dto.message,
      user,
      conversationToken ?? dto.conversationToken,
    );

    return {
      conversationId,
      conversationToken,
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obter histórico de conversa (apenas do dono autenticado)',
  })
  async getConversation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    // Autenticação obrigatória (não opcional) aqui de propósito: leitura
    // de histórico nunca é permitida por conversationId sozinho, nem pra
    // conversas anônimas — ver ChatbotService#getConversation. Continuar
    // uma conversa anônima via POST /chatbot/conversations continua
    // funcionando; lê-la de volta, não.
    return this.chatbotService.getConversation(id, user);
  }

  @Post('chatbot/quick-actions')
  @ApiOperation({ summary: 'Executar ação rápida do chatbot' })
  executeQuickAction(@Body() dto: QuickActionDto) {
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
    @CurrentUser() user: RequestUser,
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
}
