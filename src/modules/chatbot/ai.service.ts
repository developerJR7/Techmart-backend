import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../prisma/prisma.service';

interface ProductInfo {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  description: string;
}

interface InventoryStatus {
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
}

@Injectable()
export class AIService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
  }

  async getProductsInfo(query?: string): Promise<ProductInfo[]> {
    const where: any = { isActive: true };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { category: true },
      take: 10,
      orderBy: { stock: 'desc' },
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      stock: p.stock,
      category: p.category.name,
      description: p.description,
    }));
  }

  async getInventoryStatus(): Promise<InventoryStatus> {
    const [totalProducts, inStock, outOfStock, lowStock] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({
        where: { isActive: true, stock: { gt: 10 } },
      }),
      this.prisma.product.count({ where: { isActive: true, stock: 0 } }),
      this.prisma.product.count({
        where: { isActive: true, stock: { gt: 0, lte: 10 } },
      }),
    ]);

    return { totalProducts, inStock, outOfStock, lowStock };
  }

  async generateResponse(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userId?: string,
  ): Promise<string> {
    const inventoryStatus = await this.getInventoryStatus();

    // Se tiver Gemini configurado, usar
    if (this.model) {
      try {
        const systemPrompt = `Você é um assistente virtual da TechMart, uma loja de tecnologia.
Inventário: ${inventoryStatus.totalProducts} produtos, ${inventoryStatus.inStock} em estoque, ${inventoryStatus.lowStock} com estoque baixo.
Seja amigável, use emojis e responda de forma concisa e útil.`;

        // Montar histórico para o Gemini
        const history = conversationHistory.slice(-10).map((msg) => ({
          role: msg.role === 'USER' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        }));

        const chat = this.model.startChat({
          history,
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.7,
          },
        });

        const result = await chat.sendMessage(
          `${systemPrompt}\n\nUsuário: ${userMessage}`,
        );
        const response = await result.response;
        return (
          response.text() ||
          this.generateFallbackResponse(userMessage, inventoryStatus)
        );
      } catch (error) {
        console.error('Erro Gemini:', error.message);
      }
    }

    // Fallback inteligente (funciona sem API)
    return this.generateFallbackResponse(userMessage, inventoryStatus);
  }

  private async generateFallbackResponse(
    userMessage: string,
    inventoryStatus: InventoryStatus,
  ): Promise<string> {
    const msg = userMessage.toLowerCase();

    // Saudações
    if (msg.match(/\b(oi|olá|ola|hey|bom dia|boa tarde|boa noite)\b/)) {
      return `Olá! 👋 Bem-vindo à TechMart!\n\nTemos ${inventoryStatus.totalProducts} produtos disponíveis. Como posso ajudar?\n\n📱 Produtos\n💰 Preços\n📦 Pedidos\n🚚 Entrega`;
    }

    // Produtos/Estoque
    if (msg.match(/\b(produto|estoque|disponível|tem|vende)\b/)) {
      const products = await this.getProductsInfo();
      const list = products
        .slice(0, 5)
        .map((p) => `• ${p.name} - R$ ${p.price.toFixed(2)} (${p.stock} un.)`)
        .join('\n');

      return `Temos ${inventoryStatus.inStock} produtos em estoque! 🛒\n\n${list}\n\n${inventoryStatus.lowStock > 0 ? `⚠️ ${inventoryStatus.lowStock} com estoque baixo!` : ''}\n\nQuer saber mais sobre algum?`;
    }

    // Preço
    if (msg.match(/\b(preço|quanto|valor|barato)\b/)) {
      return `💰 Preços de R$ 199,99 a R$ 24.999,99!\n\nCategorias:\n📱 Smartphones\n💻 Notebooks\n⌚ Smartwatches\n🎧 Fones\n🖥️ Monitores\n\nQual te interessa?`;
    }

    // Pedido
    if (msg.match(/\b(pedido|compra|rastreio|entrega)\b/)) {
      return `📦 Para consultar pedidos, faça login!\n\nPosso ajudar com:\n✅ Status\n🚚 Rastreamento\n📍 Localização\n⏰ Previsão\n\nJá está logado?`;
    }

    // Ajuda
    if (msg.match(/\b(ajuda|help|como)\b/)) {
      return `🤝 Posso te ajudar com:\n\n1️⃣ Produtos e estoque\n2️⃣ Pedidos e rastreamento\n3️⃣ Recomendações\n4️⃣ Dúvidas gerais\n\nO que precisa?`;
    }

    // Padrão
    return `Entendi! 😊\n\nPosso te ajudar com:\n• Consultar produtos\n• Verificar preços\n• Status de pedidos\n\nComo posso ajudar?`;
  }

  async processMessageWithActions(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userId?: string,
  ): Promise<{ response: string; actions?: any[] }> {
    const msg = userMessage.toLowerCase();

    // Produtos
    if (msg.includes('produto') || msg.includes('estoque')) {
      const products = await this.getProductsInfo();
      const response = await this.generateResponse(
        userMessage,
        conversationHistory,
        userId,
      );

      return {
        response,
        actions: [{ type: 'show_products', data: products.slice(0, 5) }],
      };
    }

    // Pedidos
    if (userId && msg.includes('pedido')) {
      const order = await this.prisma.order.findFirst({
        where: { userId },
        include: { orderItems: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      });

      if (order) {
        const response = await this.generateResponse(
          userMessage,
          conversationHistory,
          userId,
        );
        return {
          response,
          actions: [{ type: 'show_order', data: order }],
        };
      }
    }

    const response = await this.generateResponse(
      userMessage,
      conversationHistory,
      userId,
    );
    return { response };
  }
}
