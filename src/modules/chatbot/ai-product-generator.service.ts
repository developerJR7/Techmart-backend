import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.util';

export type CreatedProduct = Prisma.ProductGetPayload<{
  include: { category: true; specifications: true };
}>;

export interface ProductGenerationInput {
  category?: string;
  priceRange?: { min: number; max: number };
  keywords?: string[];
  description?: string;
}

export interface GeneratedProduct {
  name: string;
  description: string;
  price: number;
  category: string;
  specifications: Array<{ key: string; value: string }>;
  tags: string[];
}

@Injectable()
export class AIProductGeneratorService {
  private readonly logger = new Logger(AIProductGeneratorService.name);
  private genAI: GoogleGenerativeAI;
  private model?: GenerativeModel;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'No AI API key configured - Product generation will be disabled',
      );
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      this.logger.log('AI Product Generator initialized successfully');
    }
  }

  async generateProduct(
    input: ProductGenerationInput,
  ): Promise<GeneratedProduct> {
    if (!this.model) {
      throw new Error('AI service is not configured');
    }

    try {
      const prompt = this.buildProductGenerationPrompt(input);

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Parse JSON response
      const productData = this.parseProductResponse(text);

      this.logger.log(`Generated product: ${productData.name}`);
      return productData;
    } catch (error) {
      this.logger.error(
        `Failed to generate product: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async generateMultipleProducts(
    input: ProductGenerationInput,
    count: number = 5,
  ): Promise<GeneratedProduct[]> {
    if (!this.model) {
      throw new Error('AI service is not configured');
    }

    try {
      const prompt = this.buildMultipleProductsPrompt(input, count);

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Parse JSON array response
      const products = this.parseMultipleProductsResponse(text);

      this.logger.log(`Generated ${products.length} products`);
      return products;
    } catch (error) {
      this.logger.error(
        `Failed to generate multiple products: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async createProductInDatabase(
    productData: GeneratedProduct,
  ): Promise<CreatedProduct> {
    try {
      // Find or create category
      let category = await this.prisma.category.findFirst({
        where: {
          name: { contains: productData.category, mode: 'insensitive' },
        },
      });

      if (!category) {
        // Create slug from category name
        const slug = productData.category
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        category = await this.prisma.category.create({
          data: {
            name: productData.category,
            slug,
            description: `Produtos de ${productData.category}`,
          },
        });
      }

      // Create product slug
      const productSlug = productData.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Create product
      const product = await this.prisma.product.create({
        data: {
          name: productData.name,
          slug: productSlug,
          description: productData.description,
          price: productData.price,
          stock: Math.floor(Math.random() * 50) + 10, // Random stock between 10-60
          categoryId: category.id,
          isActive: true,
          isFeatured: false,
          specifications: {
            create: productData.specifications.map((spec) => ({
              key: spec.key,
              value: spec.value,
            })),
          },
        },
        include: {
          category: true,
          specifications: true,
        },
      });

      this.logger.log(`Created product in database: ${product.id}`);
      return product;
    } catch (error) {
      this.logger.error(
        `Failed to create product in database: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  private buildProductGenerationPrompt(input: ProductGenerationInput): string {
    let prompt = `Você é um especialista em e-commerce de tecnologia. Gere um produto REALISTA e DETALHADO para uma loja online.

IMPORTANTE: Retorne APENAS um objeto JSON válido, sem markdown, sem explicações, apenas o JSON puro.

`;

    if (input.category) {
      prompt += `Categoria: ${input.category}\n`;
    }

    if (input.priceRange) {
      prompt += `Faixa de preço: R$ ${input.priceRange.min} - R$ ${input.priceRange.max}\n`;
    }

    if (input.keywords && input.keywords.length > 0) {
      prompt += `Palavras-chave: ${input.keywords.join(', ')}\n`;
    }

    if (input.description) {
      prompt += `Descrição base: ${input.description}\n`;
    }

    prompt += `
Formato de resposta (JSON):
{
  "name": "Nome do produto (específico e atraente)",
  "description": "Descrição detalhada e persuasiva do produto (mínimo 200 caracteres)",
  "price": número (preço em reais, sem R$),
  "category": "Nome da categoria",
  "specifications": [
    { "key": "Especificação 1", "value": "Valor 1" },
    { "key": "Especificação 2", "value": "Valor 2" }
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Gere um produto REAL que existe no mercado, com especificações técnicas precisas.`;

    return prompt;
  }

  private buildMultipleProductsPrompt(
    input: ProductGenerationInput,
    count: number,
  ): string {
    let prompt = `Você é um especialista em e-commerce de tecnologia. Gere ${count} produtos REALISTAS e DIFERENTES para uma loja online.

IMPORTANTE: Retorne APENAS um array JSON válido, sem markdown, sem explicações, apenas o JSON puro.

`;

    if (input.category) {
      prompt += `Categoria: ${input.category}\n`;
    }

    if (input.priceRange) {
      prompt += `Faixa de preço: R$ ${input.priceRange.min} - R$ ${input.priceRange.max}\n`;
    }

    prompt += `
Formato de resposta (Array JSON):
[
  {
    "name": "Nome do produto 1",
    "description": "Descrição detalhada",
    "price": número,
    "category": "Categoria",
    "specifications": [{"key": "...", "value": "..."}],
    "tags": ["tag1", "tag2"]
  },
  ...
]

Gere produtos REAIS e VARIADOS dentro da categoria especificada.`;

    return prompt;
  }

  private parseProductResponse(text: string): GeneratedProduct {
    try {
      // Remove markdown code blocks if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```\n?/g, '');
      }

      const product = JSON.parse(cleanText) as GeneratedProduct;

      // Validate required fields
      if (!product.name || !product.description || !product.price) {
        throw new Error('Missing required fields in generated product');
      }

      return product;
    } catch (error) {
      this.logger.error(
        `Failed to parse product response: ${getErrorMessage(error)}`,
      );
      this.logger.debug(`Raw response: ${text}`);
      throw new Error('Failed to parse AI response');
    }
  }

  private parseMultipleProductsResponse(text: string): GeneratedProduct[] {
    try {
      // Remove markdown code blocks if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```\n?/g, '');
      }

      const products = JSON.parse(cleanText) as GeneratedProduct[];

      if (!Array.isArray(products)) {
        throw new Error('Response is not an array');
      }

      return products;
    } catch (error) {
      this.logger.error(
        `Failed to parse multiple products response: ${getErrorMessage(error)}`,
      );
      this.logger.debug(`Raw response: ${text}`);
      throw new Error('Failed to parse AI response');
    }
  }
}
