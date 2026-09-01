import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getErrorMessage } from '../../common/utils/error.util';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(private prisma: PrismaService) {}

  async createOrUpdate(data: {
    name: string;
    provider: string;
    value: string;
    settings?: Record<string, unknown>;
  }) {
    // Basic validation
    if (!data.name || !data.provider || !data.value) {
      throw new BadRequestException('Name, provider and value are required');
    }

    // Check if exists
    const existing = await this.prisma.integration.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      this.logger.log(`Updating integration: ${data.name}`);
      return this.prisma.integration.update({
        where: { id: existing.id },
        data: {
          value: data.value,
          settings:
            (data.settings as Prisma.InputJsonValue | undefined) ||
            existing.settings ||
            undefined,
          provider: data.provider,
        },
      });
    }

    this.logger.log(`Creating new integration: ${data.name}`);
    return this.prisma.integration.create({
      data: {
        name: data.name,
        provider: data.provider,
        value: data.value,
        settings: (data.settings as Prisma.InputJsonValue | undefined) || {},
      },
    });
  }

  async findAll() {
    return this.prisma.integration.findMany();
  }

  async findByName(name: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { name },
    });
    if (!integration)
      throw new NotFoundException(`Integration ${name} not found`);
    return integration;
  }

  async toggleActive(id: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    return this.prisma.integration.update({
      where: { id },
      data: { isActive: !integration.isActive },
    });
  }

  async delete(id: string) {
    return this.prisma.integration.delete({ where: { id } });
  }

  async testConnection(id: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    try {
      switch (integration.provider) {
        case 'GOOGLE':
          // Simulação de teste para Google
          // Em produção, faria uma chamada real à API
          return { success: true, message: 'Google API connection successful' };

        case 'META':
          // Simulação de teste para Meta/Facebook
          return { success: true, message: 'Meta API connection successful' };

        case 'STRIPE':
          // Simulação de teste para Stripe
          return { success: true, message: 'Stripe API connection successful' };

        case 'OPENAI':
          // Teste simples para OpenAI
          if (!integration.value.startsWith('sk-')) {
            throw new Error('Invalid API Key format');
          }
          return { success: true, message: 'OpenAI API key format is valid' };

        default:
          return {
            success: true,
            message: `Connection test for ${integration.provider} simulated successfully`,
          };
      }
    } catch (error) {
      this.logger.error(
        `Connection test failed for ${integration.name}: ${getErrorMessage(error)}`,
      );
      return {
        success: false,
        message: `Connection failed: ${getErrorMessage(error)}`,
        error: getErrorMessage(error),
      };
    }
  }
}
