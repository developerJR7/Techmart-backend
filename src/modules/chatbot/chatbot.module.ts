import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { ChatbotGateway } from './chatbot.gateway';
import { AIService } from './ai.service';
import { AdminAIService } from './admin-ai.service';
import { AIProductGeneratorService } from './ai-product-generator.service';
import { AIRecommendationService } from './ai-recommendation.service';
import { AIPublicController } from './ai-public.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatbotController, AIPublicController],
  providers: [
    ChatbotService,
    ChatbotGateway,
    AIService,
    AdminAIService,
    AIProductGeneratorService,
    AIRecommendationService,
  ],
  exports: [
    ChatbotService,
    AIService,
    AdminAIService,
    AIProductGeneratorService,
    AIRecommendationService,
  ],
})
export class ChatbotModule {}
