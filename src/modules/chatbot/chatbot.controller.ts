import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
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

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('conversations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar nova conversa com o chatbot' })
  async createConversation(@Request() req) {
    return this.chatbotService.createConversation(req.user?.id);
  }

  @Get('conversations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar conversas do usuário' })
  getUserConversations(@Request() req) {
    return this.chatbotService.getUserConversations(req.user.id);
  }

  @Get('conversations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter conversa específica' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  getConversation(@Request() req, @Param('id') id: string) {
    return this.chatbotService.getConversation(id, req.user?.id);
  }

  @Post('conversations/:id/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar mensagem (alternativa REST ao WebSocket)' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  async sendMessage(
    @Request() req,
    @Param('id') id: string,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.chatbotService.sendMessage(
      id,
      sendMessageDto.message,
      req.user?.id,
    );
  }

  @Patch('conversations/:id/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fechar conversa' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  closeConversation(@Request() req, @Param('id') id: string) {
    return this.chatbotService.closeConversation(id, req.user?.id);
  }

  @Patch('conversations/:id/escalate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Escalar para atendimento humano' })
  @ApiParam({ name: 'id', description: 'ID da conversa' })
  escalateToHuman(@Request() req, @Param('id') id: string) {
    return this.chatbotService.escalateToHuman(id, req.user?.id);
  }
}
