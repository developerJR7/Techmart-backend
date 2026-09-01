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
    @MessageBody() data: { conversationId: string; userId?: string },
  ) {
    try {
      const conversation = await this.chatbotService.getConversation(
        data.conversationId,
        data.userId,
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
    data: { conversationId: string; message: string; userId?: string },
  ) {
    try {
      // Emitir "typing" para mostrar que a IA está processando
      this.server.to(data.conversationId).emit('typing', { isTyping: true });

      const result = await this.chatbotService.sendMessage(
        data.conversationId,
        data.message,
        data.userId,
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
    @MessageBody() data: { conversationId: string; userId?: string },
  ) {
    try {
      await this.chatbotService.closeConversation(
        data.conversationId,
        data.userId,
      );
      this.server.to(data.conversationId).emit('conversation_closed');
      void client.leave(data.conversationId);
    } catch (error) {
      client.emit('error', { message: getErrorMessage(error) });
    }
  }

  @SubscribeMessage('escalate_to_human')
  async handleEscalate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId?: string },
  ) {
    try {
      await this.chatbotService.escalateToHuman(
        data.conversationId,
        data.userId,
      );
      this.server.to(data.conversationId).emit('escalated_to_human');
    } catch (error) {
      client.emit('error', { message: getErrorMessage(error) });
    }
  }
}
