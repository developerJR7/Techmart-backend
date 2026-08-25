import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAIController } from './admin-ai.controller';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChatbotModule } from '../chatbot/chatbot.module';

@Module({
  imports: [OrdersModule, PrismaModule, ChatbotModule],
  controllers: [
    AdminOrdersController,
    AdminCouponsController,
    AdminUsersController,
    AdminAnalyticsController,
    AdminAIController,
  ],
})
export class AdminModule {}
