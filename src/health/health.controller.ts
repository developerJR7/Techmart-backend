import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from '../common/utils/error.util';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check básico' })
  @ApiResponse({ status: 200, description: 'Servidor está funcionando' })
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Get('db')
  @ApiOperation({ summary: 'Verificar conexão com banco de dados' })
  @ApiResponse({ status: 200, description: 'Banco de dados conectado' })
  @ApiResponse({ status: 503, description: 'Banco de dados não disponível' })
  async databaseCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        error: getErrorMessage(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe para Kubernetes/Docker' })
  @ApiResponse({
    status: 200,
    description: 'Aplicação pronta para receber tráfego',
  })
  async readinessCheck() {
    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ready',
        checks: {
          database: 'ok',
          server: 'ok',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'not_ready',
        checks: {
          database: 'failed',
          server: 'ok',
        },
        error: getErrorMessage(error),
        timestamp: new Date().toISOString(),
      };
    }
  }
}
