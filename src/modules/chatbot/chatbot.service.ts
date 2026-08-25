import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AIService } from './ai.service';
import { AdminAIService } from './admin-ai.service';

@Injectable()
export class ChatbotService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private adminAIService: AdminAIService,
  ) {}

  async createConversation(userId?: string) {
    return this.prisma.chatConversation.create({
      data: {
        userId,
        status: 'ACTIVE',
      },
    });
  }

  async getConversation(conversationId: string, userId?: string) {
    const where: any = { id: conversationId };
    if (userId) {
      where.userId = userId;
    }

    const conversation = await this.prisma.chatConversation.findFirst({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    return conversation;
  }

  async getUserConversations(userId: string) {
    return this.prisma.chatConversation.findMany({
      where: { userId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
  }

  async sendMessage(conversationId: string, message: string, userId?: string) {
    // Verificar se a conversa existe
    const conversation = await this.getConversation(conversationId, userId);

    // Verificar se é admin
    let isAdmin = false;
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      isAdmin = user?.role === 'ADMIN';
    }

    // Salvar mensagem do usuário
    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message,
      },
    });

    // Obter histórico da conversa
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20, // Últimas 20 mensagens para contexto
    });

    const conversationHistory = messages.map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    }));

    let response: string;
    let actions: any;

    // Se for admin, usar AdminAIService para insights de negócio
    if (isAdmin) {
      response = await this.adminAIService.generateBusinessInsights(message);
    } else {
      // Cliente normal: usar AIService com acesso ao inventário
      const result = await this.aiService.processMessageWithActions(
        message,
        conversationHistory,
        userId,
      );
      response = result.response;
      actions = result.actions;
    }

    // Salvar resposta da IA
    const aiMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: response,
        metadata: actions ? { actions } : undefined,
      },
    });

    // Atualizar timestamp da conversa
    await this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return {
      message: aiMessage,
      actions,
    };
  }

  async closeConversation(conversationId: string, userId?: string) {
    const conversation = await this.getConversation(conversationId, userId);

    return this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: 'RESOLVED' },
    });
  }

  async escalateToHuman(conversationId: string, userId?: string) {
    const conversation = await this.getConversation(conversationId, userId);

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'SYSTEM',
        content:
          'Conversa escalada para atendimento humano. Um de nossos atendentes entrará em contato em breve.',
      },
    });

    return this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: 'ESCALATED' },
    });
  }
}
