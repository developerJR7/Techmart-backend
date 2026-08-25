import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoyaltyService } from './loyalty.service';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user loyalty profile (points and history)' })
  getProfile(@Req() req: any) {
    return this.loyaltyService.getLoyaltyProfile(req.user.id);
  }

  @Get('calculate-earn')
  @ApiOperation({ summary: 'Calculate points earned for an amount' })
  calculateEarn(@Query('amount') amount: string) {
    return {
      points: this.loyaltyService.calculatePointsEarned(parseFloat(amount)),
    };
  }

  @Get('calculate-value')
  @ApiOperation({ summary: 'Calculate discount value for points' })
  calculateValue(@Query('points') points: string) {
    return {
      value: this.loyaltyService.calculateDiscountValue(parseInt(points, 10)),
    };
  }
}
