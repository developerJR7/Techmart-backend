import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UpsellService } from './upsell.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [PrismaModule, LoyaltyModule],
  controllers: [OrdersController],
  providers: [OrdersService, UpsellService],
  exports: [OrdersService, UpsellService],
})
export class OrdersModule {}
