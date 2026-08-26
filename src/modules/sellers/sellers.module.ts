import { Module } from '@nestjs/common';
import { SellersController } from './sellers.controller';
import { StoreController } from './store.controller';
import { SellersService } from './sellers.service';
import { StoreService } from './store.service';

@Module({
  controllers: [SellersController, StoreController],
  providers: [SellersService, StoreService],
  exports: [SellersService],
})
export class SellersModule {}
