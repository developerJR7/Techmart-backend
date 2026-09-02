import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AIService } from './ai.service';
import { AdminAIService } from './admin-ai.service';
import type { RequestUser } from '../../types/express';

@Injectable()
export class ChatbotService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private adminAIService: AdminAIService,
    private configService: ConfigService,
  ) {}

  async createConversation(userId?: string) {
    return this.prisma.chatConversation.create({
      data: {
        userId,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Credencial de posse pra conversas ANÔNIMAS (userId null). Sem estado
   * novo no banco: o token é a assinatura HMAC-SHA256 do próprio
   * conversationId, derivada de JWT_SECRET (já garantido configurado —
   * ver JwtStrategy) com um contexto próprio, então não é reutilizável
   * como token de autenticação de usuário nem vice-versa. Só quem recebeu
   * este valor na criação da conversa consegue reproduzi-lo.
   *
   * Nunca usar identidade (autenticada ou não) como prova de posse de uma
   * conversa anônima — dois visitantes anônimos são indistinguíveis
   * (ambos "sem usuário"), então `conversation.userId === currentUser?.id`
   * colapsaria pra `null === null` e qualquer visitante continuaria a
   * conversa de qualquer outro só sabendo o id.
   */
  getAnonymousConversationToken(conversationId: string): string {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    return createHmac('sha256', secret)
      .update(`chat-anon-conversation:${conversationId}`)
      .digest('hex');
  }

  private isValidAnonymousConversationToken(
    conversationId: string,
    token: string | undefined,
  ): boolean {
    if (!token) {
      return false;
    }

    const expected = Buffer.from(
      this.getAnonymousConversationToken(conversationId),
      'hex',
    );
    const provided = Buffer.from(token, 'hex');

    // timingSafeEqual exige buffers do mesmo tamanho — um token malformado
    // ou de tamanho diferente já não é válido, sem precisar comparação
    // constante nesse caso (o tamanho esperado é público, não é segredo).
    if (provided.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(expected, provided);
  }

  /**
   * `currentUser` NUNCA pode vir do corpo/query da requisição — só de
   * @CurrentUser() (JWT validado) ou undefined (anônimo).
   *
   * Conversa com dono real (userId preenchido): só o usuário autenticado
   * dono dela acessa — identidade via JWT, igual antes.
   *
   * Conversa anônima (userId null): identidade nunca prova posse (nem a
   * ausência dela em ambos os lados) — exige o `anonToken` assinado
   * devolvido na criação. Vale pra visitante anônimo E pra usuário
   * autenticado tentando "assumir" uma conversa anônima: sem o token
   * correto, nenhum dos dois passa.
   *
   * 404 idêntico em todos os casos de recusa — o chamador sem acesso
   * nunca descobre se o id é válido nem por que foi recusado.
   */
  async getConversation(
    conversationId: string,
    currentUser?: RequestUser,
    anonToken?: string,
  ) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    if (conversation.userId !== null) {
      if (conversation.userId !== currentUser?.id) {
        throw new NotFoundException('Conversa não encontrada');
      }
      return conversation;
    }

    if (!this.isValidAnonymousConversationToken(conversationId, anonToken)) {
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

  async sendMessage(
    conversationId: string,
    message: string,
    currentUser?: RequestUser,
    anonToken?: string,
  ) {
    // Verificar se a conversa existe e se o chamador tem posse dela.
    const conversation = await this.getConversation(
      conversationId,
      currentUser,
      anonToken,
    );

    // "admin" só existe se vier do papel já validado pelo JWT — nunca de
    // uma consulta feita a partir de um id fornecido pelo cliente.
    const isAdmin = currentUser?.role === 'ADMIN';

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
    let actions: unknown;

    // Se for admin, usar AdminAIService para insights de negócio
    if (isAdmin) {
      response = await this.adminAIService.generateBusinessInsights(message);
    } else {
      // Cliente normal: usar AIService com acesso ao inventário
      const result = await this.aiService.processMessageWithActions(
        message,
        conversationHistory,
        currentUser?.id,
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

  async closeConversation(
    conversationId: string,
    currentUser?: RequestUser,
    anonToken?: string,
  ) {
    const conversation = await this.getConversation(
      conversationId,
      currentUser,
      anonToken,
    );

    return this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: 'RESOLVED' },
    });
  }

  async escalateToHuman(
    conversationId: string,
    currentUser?: RequestUser,
    anonToken?: string,
  ) {
    const conversation = await this.getConversation(
      conversationId,
      currentUser,
      anonToken,
    );

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
