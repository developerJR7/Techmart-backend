import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // Security - Helmet
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Compression
  app.use(compression());

  // Cookies (refresh token httpOnly + CSRF double-submit token)
  app.use(cookieParser());

  // CORS
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',')
    : ['http://localhost:3000', 'http://localhost:3001'];

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'stripe-signature',
      'X-XSRF-Token',
    ],
  };
  app.enableCors(corsOptions);

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger - Only in development
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('TechMart API')
      .setDescription(
        'API completa para e-commerce profissional com IA, pagamentos e muito mais',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Autenticação e autorização')
      .addTag('Products', 'Gerenciamento de produtos')
      .addTag('Orders', 'Pedidos e checkout')
      .addTag('Payments', 'Pagamentos (Stripe, PIX)')
      .addTag('Chatbot', 'Assistente de IA')
      .addTag('Loyalty', 'Programa de fidelidade')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document, {
      customSiteTitle: 'TechMart API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
    });
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);

  // Startup Banner
  logger.log('');
  logger.log('╔═══════════════════════════════════════════════════════╗');
  logger.log('║                                                       ║');
  logger.log('║              🚀 TECHMART BACKEND API 🚀               ║');
  logger.log('║                                                       ║');
  logger.log('╚═══════════════════════════════════════════════════════╝');
  logger.log('');
  logger.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  logger.log(`🔗 Server: http://localhost:${port}/api/v1`);

  if (!isProduction) {
    logger.log(`📚 Swagger: http://localhost:${port}/api/v1/docs`);
  }

  logger.log(`🔒 CORS: ${allowedOrigins.join(', ')}`);
  logger.log('');
  logger.log('✅ Server is ready to accept connections');
  logger.log('');
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
