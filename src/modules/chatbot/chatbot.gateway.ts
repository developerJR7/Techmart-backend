import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatbotService } from './chatbot.service';
import { getErrorMessage } from '../../common/utils/error.util';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatbotGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private chatbotService: ChatbotService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    client.emit('connected', { message: 'Conectado ao chat!' });
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      // A conexão de socket não é autenticada hoje (sem handshake JWT),
      // então nunca há uma identidade confiável aqui — nunca aceitar um
      // `userId` do payload do cliente (era exatamente o bug do C1/H2).
      // Isso restringe o gateway a conversas anônimas; usuário autenticado
      // que precisar do histórico da própria conversa usa o REST
      // (ChatbotController, com JwtAuthGuard de verdade).
      const conversation = await this.chatbotService.getConversation(
        data.conversationId,
      );

      void client.join(data.conversationId);
      client.emit('conversation_joined', { conversation });
    } catch (error) {
      client.emit('error', { message: getErrorMessage(error) });
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; message: string },
  ) {
    try {
      // Emitir "typing" para mostrar que a IA está processando
      this.server.to(data.conversationId).emit('typing', { isTyping: true });

      const result = await this.chatbotService.sendMessage(
        data.conversationId,
        data.message,
      );

      // Emitir resposta para todos na conversa
      this.server.to(data.conversationId).emit('new_message', {
        message: result.message,
        actions: result.actions,
      });

      this.server.to(data.conversationId).emit('typing', { isTyping: false });
    } catch (error) {
      client.emit('error', { message: getErrorMessage(error) });
      this.server.to(data.conversationId).emit('typing', { isTyping: false });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    client
      .to(data.conversationId)
      .emit('user_typing', { isTyping: data.isTyping });
  }

  @SubscribeMessage('close_conversation')
  async handleCloseConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      await this.chatbotService.closeConversation(data.conversationId);
      this.server.to(data.conversationId).emit('conversation_closed');
      void client.leave(data.conversationId);
    } catch (error) {
      client.emit('error', { message: getErrorMessage(error) });
    }
  }

  @SubscribeMessage('escalate_to_human')
  async handleEscalate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      await this.chatbotService.escalateToHuman(data.conversationId);
      this.server.to(data.conversationId).emit('escalated_to_human');
    } catch (error) {
      client.emit('error', { message: getErrorMessage(error) });
    }
  }
}
