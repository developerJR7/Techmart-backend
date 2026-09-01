import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AIProductGeneratorService } from '../chatbot/ai-product-generator.service';
import { AdminAIService, SalesMetrics } from '../chatbot/admin-ai.service';
import {
  AdminAnalyticsQueryDto,
  GenerateProductDto,
  ImproveDescriptionDto,
} from '../chatbot/dto/ai-requests.dto';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Admin - AI')
@Controller('admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminAIController {
  constructor(
    private readonly aiProductGenerator: AIProductGeneratorService,
    private readonly adminAI: AdminAIService,
    private readonly prisma: PrismaService,
  ) {}

  // ========== ANALYTICS ==========

  @Post('analytics')
  @ApiOperation({ summary: 'Consulta de analytics com IA (Admin)' })
  @ApiResponse({ status: 200, description: 'Insights gerados com sucesso' })
  async queryAnalytics(@Body() dto: AdminAnalyticsQueryDto) {
    const timeRange = dto.context?.timeRange || '7d';
    const days = this.parseDays(timeRange);

    // Buscar métricas
    const [salesMetrics, inventoryInsights] = await Promise.all([
      this.adminAI.getSalesMetrics(days),
      this.adminAI.getInventoryInsights(),
    ]);

    // Gerar insights com IA
    const response = await this.adminAI.generateBusinessInsights(dto.query);

    // Identificar insights acionáveis
    const insights = this.extractInsights(response, salesMetrics);

    return {
      response,
      insights,
      data: dto.context?.includeData
        ? { salesMetrics, inventoryInsights }
        : undefined,
    };
  }

  @Get('quick-insights/:type')
  @ApiOperation({ summary: 'Queries rápidas pré-definidas (Admin)' })
  async getQuickInsights(@Param('type') type: string) {
    switch (type) {
      case 'low-stock':
        return this.getLowStockInsights();

      case 'sales-analysis':
        return this.getSalesAnalysisInsights();

      case 'profitable-products':
        return this.getProfitableProductsInsights();

      case 'customer-insights':
        return this.getCustomerInsights();

      default:
        return {
          type,
          summary: 'Tipo de insight não reconhecido',
          data: [],
          aiInsight: '',
          recommendations: [],
        };
    }
  }

  // ========== PRODUCT GENERATION ==========

  @Post('generate-product')
  @ApiOperation({ summary: 'Gerar produto usando IA (Admin)' })
  @ApiResponse({ status: 201, description: 'Produto gerado com sucesso' })
  async generateProduct(@Body() dto: GenerateProductDto) {
    const product = await this.aiProductGenerator.generateProduct({
      category: dto.category,
      priceRange: dto.priceRange,
      description: dto.prompt,
    });

    return {
      product: {
        name: product.name,
        description: product.description,
        price: product.price,
        categoryId: dto.category,
        features:
          product.specifications?.map((s) => `${s.key}: ${s.value}`) || [],
        specifications: product.specifications?.reduce(
          (acc, s) => {
            acc[s.key] = s.value;
            return acc;
          },
          {} as Record<string, string>,
        ),
        suggestedTags: product.tags || [],
        imageUrl: dto.generateImage
          ? 'https://via.placeholder.com/400x400'
          : undefined,
      },
      confidence: 0.95,
    };
  }

  @Post('generate-products-bulk')
  @ApiOperation({ summary: 'Gerar múltiplos produtos usando IA (Admin)' })
  @ApiResponse({ status: 201, description: 'Produtos gerados com sucesso' })
  async generateProductsBulk(
    @Body()
    data: {
      category?: string;
      priceRange?: { min: number; max: number };
      count?: number;
    },
  ) {
    const count = data.count || 5;
    const products = await this.aiProductGenerator.generateMultipleProducts(
      data,
      count,
    );
    return { products, count: products.length };
  }

  @Post('create-product-from-ai')
  @ApiOperation({ summary: 'Gerar e criar produto no banco usando IA (Admin)' })
  @ApiResponse({ status: 201, description: 'Produto criado com sucesso' })
  async createProductFromAI(@Body() dto: GenerateProductDto) {
    const productData = await this.aiProductGenerator.generateProduct({
      category: dto.category,
      priceRange: dto.priceRange,
      description: dto.prompt,
    });

    const product =
      await this.aiProductGenerator.createProductInDatabase(productData);
    return product;
  }

  @Post('improve-description')
  @ApiOperation({ summary: 'Melhorar descrição de produto com IA (Admin)' })
  async improveDescription(@Body() dto: ImproveDescriptionDto) {
    const tone = dto.tone || 'professional';
    const focus = dto.focus || 'benefits';

    const prompt = `Melhore esta descrição de produto com tom ${tone} focando em ${focus}:\n\n${dto.currentDescription}`;

    // Usar IA para melhorar
    const improved = await this.adminAI.generateBusinessInsights(prompt);

    return {
      improvedDescription: improved,
      suggestions: [
        { type: 'SEO', suggestion: 'Adicione palavras-chave relevantes' },
        {
          type: 'CLARITY',
          suggestion: 'Use bullet points para facilitar leitura',
        },
        { type: 'ENGAGEMENT', suggestion: 'Inclua call-to-action no final' },
      ],
    };
  }

  // ========== BUSINESS INSIGHTS ==========

  @Post('business-insights')
  @ApiOperation({ summary: 'Obter insights de negócio usando IA (Admin)' })
  @ApiResponse({ status: 200, description: 'Insights gerados com sucesso' })
  async getBusinessInsights(@Body() data: { query: string }) {
    const insights = await this.adminAI.generateBusinessInsights(data.query);
    return { insights };
  }

  @Post('sales-metrics')
  @ApiOperation({ summary: 'Obter métricas de vendas (Admin)' })
  @ApiResponse({ status: 200, description: 'Métricas retornadas com sucesso' })
  async getSalesMetrics(@Body() data: { days?: number }) {
    const days = data.days || 7;
    const metrics = await this.adminAI.getSalesMetrics(days);
    return metrics;
  }

  @Post('inventory-insights')
  @ApiOperation({ summary: 'Obter insights de estoque (Admin)' })
  @ApiResponse({ status: 200, description: 'Insights de estoque retornados' })
  async getInventoryInsights() {
    const insights = await this.adminAI.getInventoryInsights();
    return insights;
  }

  // ========== PRIVATE HELPERS ==========

  private parseDays(timeRange: string): number {
    const map: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365,
    };
    return map[timeRange] || 7;
  }

  private extractInsights(response: string, metrics: SalesMetrics) {
    const insights: Array<{
      type: 'OPPORTUNITY' | 'WARNING';
      title: string;
      description: string;
      actionable: boolean;
      suggestedAction: string;
    }> = [];

    // Detectar oportunidades
    if (metrics.averageOrderValue > 200) {
      insights.push({
        type: 'OPPORTUNITY',
        title: 'Alto ticket médio',
        description: 'Seus clientes estão comprando produtos de alto valor',
        actionable: true,
        suggestedAction:
          'Crie bundles premium para aumentar ainda mais o ticket médio',
      });
    }

    // Detectar warnings
    if (metrics.totalOrders < 10) {
      insights.push({
        type: 'WARNING',
        title: 'Baixo volume de pedidos',
        description: 'Número de pedidos está abaixo do esperado',
        actionable: true,
        suggestedAction: 'Considere campanhas de marketing ou promoções',
      });
    }

    return insights;
  }

  private async getLowStockInsights() {
    const lowStock = await this.prisma.product.findMany({
      where: { stock: { lt: 10 }, isActive: true },
      include: { category: true },
      take: 20,
    });

    return {
      type: 'low-stock',
      summary: `${lowStock.length} produtos com estoque baixo`,
      data: lowStock,
      aiInsight: `⚠️ **Alerta de Estoque**\n\nVocê tem ${lowStock.length} produtos com menos de 10 unidades em estoque. Recomendo:\n\n1. Reabastecer produtos mais vendidos\n2. Criar promoções para produtos parados\n3. Considerar descontinuar produtos sem saída`,
      recommendations: [
        'Reabastecer produtos populares',
        'Criar promoção para produtos parados',
        'Revisar política de estoque mínimo',
      ],
    };
  }

  private async getSalesAnalysisInsights() {
    const metrics = await this.adminAI.getSalesMetrics(30);

    return {
      type: 'sales-analysis',
      summary: `Análise de vendas dos últimos 30 dias`,
      data: metrics,
      aiInsight: `📊 **Análise de Vendas (30 dias)**\n\n💰 Receita: R$ ${metrics.totalRevenue.toFixed(2)}\n📦 Pedidos: ${metrics.totalOrders}\n💵 Ticket Médio: R$ ${metrics.averageOrderValue.toFixed(2)}\n\n**Insights:**\n- Vendas estão ${metrics.totalOrders > 100 ? 'acima' : 'abaixo'} da média\n- Foque em aumentar o ticket médio com upsells\n- Considere campanhas de reativação`,
      recommendations: [
        'Implementar upsell no checkout',
        'Criar programa de fidelidade',
        'Email marketing para clientes inativos',
      ],
    };
  }

  private async getProfitableProductsInsights() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: { price: 'desc' },
      take: 10,
    });

    return {
      type: 'profitable-products',
      summary: `Top 10 produtos por preço`,
      data: products,
      aiInsight: `💎 **Produtos Mais Lucrativos**\n\nSeus produtos premium estão gerando boa margem. Recomendo:\n\n1. Destacar estes produtos no site\n2. Criar bundles com produtos complementares\n3. Investir em marketing para estes itens`,
      recommendations: [
        'Destacar produtos premium',
        'Criar bundles estratégicos',
        'Investir em ads para produtos de alta margem',
      ],
    };
  }

  private async getCustomerInsights() {
    const totalUsers = await this.prisma.user.count();
    const usersWithOrders = await this.prisma.user.count({
      where: { orders: { some: {} } },
    });

    const conversionRate =
      totalUsers > 0 ? (usersWithOrders / totalUsers) * 100 : 0;

    return {
      type: 'customer-insights',
      summary: `Análise de ${totalUsers} clientes`,
      data: { totalUsers, usersWithOrders, conversionRate },
      aiInsight: `👥 **Insights de Clientes**\n\n📊 Total: ${totalUsers}\n✅ Com pedidos: ${usersWithOrders}\n📈 Taxa de conversão: ${conversionRate.toFixed(1)}%\n\n**Recomendações:**\n- ${conversionRate < 20 ? 'Melhorar onboarding de novos usuários' : 'Manter estratégia atual'}\n- Criar campanhas de reativação\n- Implementar programa de indicação`,
      recommendations: [
        'Melhorar experiência de primeira compra',
        'Criar programa de indicação',
        'Email marketing segmentado',
      ],
    };
  }
}
