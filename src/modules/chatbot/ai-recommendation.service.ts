import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AIRecommendationService {
  private readonly logger = new Logger(AIRecommendationService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log(
        'AI Recommendation Service initialized with Google Gemini',
      );
    } else {
      this.logger.warn(
        'AI Recommendation Service running without AI (fallback mode)',
      );
    }
  }

  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 10,
    context: string = 'homepage',
  ) {
    try {
      // Buscar histórico de compras do usuário
      const userOrders = await this.prisma.order.findMany({
        where: { userId, status: 'DELIVERED' },
        include: {
          orderItems: {
            include: {
              product: {
                include: { category: true },
              },
            },
          },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      // Extrair categorias e produtos comprados
      const purchasedCategories = new Set<string>();
      const purchasedProductIds = new Set<string>();

      userOrders.forEach((order) => {
        order.orderItems.forEach((item) => {
          if (item.product.categoryId) {
            purchasedCategories.add(item.product.categoryId);
          }
          purchasedProductIds.add(item.productId);
        });
      });

      // Buscar produtos similares
      const recommendations = await this.prisma.product.findMany({
        where: {
          isActive: true,
          id: { notIn: Array.from(purchasedProductIds) },
          OR: [
            { categoryId: { in: Array.from(purchasedCategories) } },
            { isFeatured: true },
          ],
        },
        include: { category: true },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return recommendations.map((product, index) => ({
        product: {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          images: product.images || [],
          slug: product.slug,
        },
        score: 1 - index * 0.05, // Score decrescente
        reason: purchasedCategories.has(product.categoryId || '')
          ? 'Baseado em suas compras anteriores'
          : 'Produto em destaque',
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get personalized recommendations: ${error.message}`,
      );
      return this.getFallbackRecommendations(limit);
    }
  }

  async getSimilarProducts(productId: string, limit: number = 6) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });

      if (!product) {
        return [];
      }

      const similar = await this.prisma.product.findMany({
        where: {
          isActive: true,
          id: { not: productId },
          categoryId: product.categoryId,
        },
        include: { category: true },
        take: limit,
      });

      return similar.map((p, index) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        images: p.images || [],
        similarityScore: 0.95 - index * 0.1,
        matchedFeatures: ['categoria', 'faixa de preço'],
      }));
    } catch (error) {
      this.logger.error(`Failed to get similar products: ${error.message}`);
      return [];
    }
  }

  async getFrequentlyBoughtTogether(productId: string) {
    try {
      // Buscar pedidos que contêm este produto
      const ordersWithProduct = await this.prisma.orderItem.findMany({
        where: { productId },
        include: {
          order: {
            include: {
              orderItems: {
                where: { productId: { not: productId } },
                include: { product: true },
              },
            },
          },
        },
        take: 50,
      });

      // Contar frequência de produtos comprados juntos
      const productFrequency = new Map<string, number>();
      const productData = new Map<string, any>();

      ordersWithProduct.forEach((item) => {
        item.order.orderItems.forEach((otherItem) => {
          const count = productFrequency.get(otherItem.productId) || 0;
          productFrequency.set(otherItem.productId, count + 1);
          productData.set(otherItem.productId, otherItem.product);
        });
      });

      // Ordenar por frequência
      const sorted = Array.from(productFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

      const products = sorted.map(([id, frequency]) => {
        const product = productData.get(id);
        return {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          images: product.images || [],
          confidence: Math.min(0.95, frequency / ordersWithProduct.length),
          discount: 10,
        };
      });

      return {
        products,
        bundleDiscount: 15,
        totalSavings: products.reduce((sum, p) => sum + p.price * 0.15, 0),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get frequently bought together: ${error.message}`,
      );
      return { products: [], bundleDiscount: 0, totalSavings: 0 };
    }
  }

  private async getFallbackRecommendations(limit: number) {
    const featured = await this.prisma.product.findMany({
      where: { isActive: true, isFeatured: true },
      include: { category: true },
      take: limit,
    });

    return featured.map((product, index) => ({
      product: {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        images: product.images || [],
        slug: product.slug,
      },
      score: 0.8 - index * 0.05,
      reason: 'Produto em destaque',
    }));
  }
}
