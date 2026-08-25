import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../prisma/prisma.service';

export interface SalesMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  conversionRate: number;
  topProducts: Array<{
    id: string;
    name: string;
    revenue: number;
    quantity: number;
  }>;
}

export interface InventoryInsight {
  lowStockProducts: number;
  outOfStockProducts: number;
  totalProducts: number;
  criticalItems: Array<{
    id: string;
    name: string;
    stock: number;
  }>;
}

@Injectable()
export class AdminAIService {
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

  /**
   * Get sales metrics for a specific period
   */
  async getSalesMetrics(days: number = 7): Promise<SalesMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get orders from the period
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: startDate },
        status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] },
      },
      include: {
        orderItems: {
          include: { product: true },
        },
      },
    });

    // Calculate metrics
    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get total users for conversion rate
    const totalUsers = await this.prisma.user.count();
    const conversionRate =
      totalUsers > 0 ? (totalOrders / totalUsers) * 100 : 0;

    // Calculate top products
    const productSales = new Map<
      string,
      { name: string; revenue: number; quantity: number }
    >();

    orders.forEach((order) => {
      order.orderItems.forEach((item) => {
        const existing = productSales.get(item.productId) || {
          name: item.product.name,
          revenue: 0,
          quantity: 0,
        };

        existing.revenue += Number(item.price) * item.quantity;
        existing.quantity += item.quantity;

        productSales.set(item.productId, existing);
      });
    });

    const topProducts = Array.from(productSales.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      conversionRate,
      topProducts,
    };
  }

  /**
   * Get inventory insights
   */
  async getInventoryInsights(): Promise<InventoryInsight> {
    const [totalProducts, lowStockProducts, outOfStockProducts, criticalItems] =
      await Promise.all([
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.product.count({
          where: { isActive: true, stock: { gt: 0, lte: 10 } },
        }),
        this.prisma.product.count({ where: { isActive: true, stock: 0 } }),
        this.prisma.product.findMany({
          where: { isActive: true, stock: { lte: 5 } },
          select: { id: true, name: true, stock: true },
          orderBy: { stock: 'asc' },
          take: 10,
        }),
      ]);

    return {
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      criticalItems,
    };
  }

  /**
   * Generate AI insights based on business data
   */
  async generateBusinessInsights(query: string): Promise<string> {
    // Get current metrics
    const [salesMetrics, inventoryInsights] = await Promise.all([
      this.getSalesMetrics(7),
      this.getInventoryInsights(),
    ]);

    if (!this.model) {
      // Fallback response without AI
      return this.generateFallbackInsights(
        query,
        salesMetrics,
        inventoryInsights,
      );
    }

    try {
      const context = `
Você é um assistente de IA para administradores de e-commerce.

DADOS ATUAIS DA LOJA (últimos 7 dias):
- Receita Total: R$ ${salesMetrics.totalRevenue.toFixed(2)}
- Pedidos: ${salesMetrics.totalOrders}
- Ticket Médio: R$ ${salesMetrics.averageOrderValue.toFixed(2)}
- Taxa de Conversão: ${salesMetrics.conversionRate.toFixed(2)}%

TOP 5 PRODUTOS:
${salesMetrics.topProducts.map((p, i) => `${i + 1}. ${p.name} - R$ ${p.revenue.toFixed(2)} (${p.quantity} vendas)`).join('\n')}

ESTOQUE:
- Total de Produtos: ${inventoryInsights.totalProducts}
- Estoque Baixo: ${inventoryInsights.lowStockProducts}
- Sem Estoque: ${inventoryInsights.outOfStockProducts}
- Itens Críticos: ${inventoryInsights.criticalItems.map((i) => `${i.name} (${i.stock} un.)`).join(', ')}

Responda de forma profissional, com insights acionáveis e sugestões concretas.
Use emojis moderadamente e seja direto ao ponto.
`;

      const result = await this.model.generateContent(
        `${context}\n\nPergunta do Admin: ${query}`,
      );
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Erro ao gerar insights com IA:', error.message);
      return this.generateFallbackInsights(
        query,
        salesMetrics,
        inventoryInsights,
      );
    }
  }

  /**
   * Fallback insights without AI
   */
  private generateFallbackInsights(
    query: string,
    sales: SalesMetrics,
    inventory: InventoryInsight,
  ): string {
    const q = query.toLowerCase();

    if (q.includes('venda') || q.includes('receita') || q.includes('hoje')) {
      return `📊 **Resumo de Vendas (7 dias)**

💰 Receita Total: R$ ${sales.totalRevenue.toFixed(2)}
📦 Pedidos: ${sales.totalOrders}
💵 Ticket Médio: R$ ${sales.averageOrderValue.toFixed(2)}
📈 Conversão: ${sales.conversionRate.toFixed(2)}%

**Top Produtos:**
${sales.topProducts.map((p, i) => `${i + 1}. ${p.name} - R$ ${p.revenue.toFixed(2)}`).join('\n')}`;
    }

    if (q.includes('estoque') || q.includes('baixo') || q.includes('repor')) {
      return `⚠️ **Alerta de Estoque**

📦 Total de Produtos: ${inventory.totalProducts}
🔴 Estoque Baixo: ${inventory.lowStockProducts}
❌ Sem Estoque: ${inventory.outOfStockProducts}

**Itens Críticos (Reabastecer Urgente):**
${inventory.criticalItems.map((i) => `• ${i.name} - ${i.stock} unidades`).join('\n')}

💡 **Sugestão:** Priorize a reposição dos itens acima para evitar perda de vendas.`;
    }

    if (
      q.includes('promoção') ||
      q.includes('campanha') ||
      q.includes('marketing')
    ) {
      const topProduct = sales.topProducts[0];
      return `💡 **Sugestões de Campanha**

🎯 **Produto em Alta:** ${topProduct?.name || 'N/A'}
- Já vendeu ${topProduct?.quantity || 0} unidades
- Receita: R$ ${topProduct?.revenue?.toFixed(2) || '0.00'}

**Estratégias Recomendadas:**
1. 🔥 Crie um combo com produtos relacionados
2. 📧 Email para quem abandonou carrinho
3. 🎁 Ofereça frete grátis acima de R$ ${((sales.averageOrderValue || 0) * 1.2).toFixed(2)}
4. ⚡ Flash sale nos produtos de estoque baixo`;
    }

    if (
      q.includes('desempenho') ||
      q.includes('análise') ||
      q.includes('semana')
    ) {
      const revenuePerDay = sales.totalRevenue / 7;
      return `📈 **Análise de Desempenho (7 dias)**

**Métricas Principais:**
• Receita Média/Dia: R$ ${revenuePerDay.toFixed(2)}
• Pedidos/Dia: ${(sales.totalOrders / 7).toFixed(1)}
• Ticket Médio: R$ ${sales.averageOrderValue.toFixed(2)}

**Pontos de Atenção:**
${sales.conversionRate < 2 ? '⚠️ Taxa de conversão baixa - otimize o checkout' : '✅ Boa taxa de conversão'}
${inventory.lowStockProducts > 5 ? '⚠️ Muitos produtos com estoque baixo' : '✅ Estoque saudável'}
${sales.totalOrders < 10 ? '⚠️ Poucas vendas - considere campanhas de marketing' : '✅ Volume de vendas satisfatório'}`;
    }

    return `📊 **Dashboard Rápido**

**Vendas (7 dias):**
• R$ ${sales.totalRevenue.toFixed(2)} em ${sales.totalOrders} pedidos
• Ticket médio: R$ ${sales.averageOrderValue.toFixed(2)}

**Estoque:**
• ${inventory.lowStockProducts} produtos com estoque baixo
• ${inventory.outOfStockProducts} produtos esgotados

Como posso ajudar? Pergunte sobre vendas, estoque ou sugestões de marketing!`;
  }

  /**
   * Get abandoned carts
   */
  async getAbandonedCarts() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const carts = await this.prisma.cart.findMany({
      where: {
        updatedAt: { gte: oneDayAgo },
        items: { some: {} }, // Has items
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        items: {
          include: { product: { select: { name: true, price: true } } },
        },
      },
    });

    // Filter out carts from users who completed orders
    const cartsWithoutOrders: typeof carts = [];
    for (const cart of carts) {
      const hasOrder = await this.prisma.order.findFirst({
        where: {
          userId: cart.userId,
          createdAt: { gte: cart.updatedAt },
        },
      });

      if (!hasOrder) {
        cartsWithoutOrders.push(cart);
      }
    }

    return cartsWithoutOrders;
  }
}
