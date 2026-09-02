import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../types/express';

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('conversations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar nova conversa com o chatbot' })
  async createConversation(@CurrentUser() user: RequestUser) {
    return this.chatbotService.createConversation(user.id);
  }

  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar conversas do usuário' })
  getUserConversations(@CurrentUser() user: RequestUser) {
    return this.chatbotService.getUserConversations(user.id);
  }

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter conversa específica' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  getConversation(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.chatbotService.getConversation(id, user);
  }

  @Post('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar mensagem (alternativa REST ao WebSocket)' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  async sendMessage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.chatbotService.sendMessage(id, sendMessageDto.message, user);
  }

  @Patch('conversations/:id/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fechar conversa' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  closeConversation(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.chatbotService.closeConversation(id, user);
  }

  @Patch('conversations/:id/escalate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Escalar para atendimento humano' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  escalateToHuman(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.chatbotService.escalateToHuman(id, user);
  }
}
