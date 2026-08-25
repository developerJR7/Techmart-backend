import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get comprehensive dashboard metrics (Admin only)' })
  async getDashboard(@Query('days') days?: string) {
    const period = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getDashboardMetrics(period);
  }

  @Get('realtime')
  @ApiOperation({ summary: 'Get real-time statistics (Admin only)' })
  async getRealtimeStats() {
    return this.analyticsService.getRealtimeStats();
  }

  @Get('abandoned-carts')
  @ApiOperation({ summary: 'Get abandoned carts for recovery (Admin only)' })
  async getAbandonedCarts(@Query('hours') hours?: string) {
    const period = hours ? parseInt(hours, 10) : 24;
    return this.analyticsService.getAbandonedCarts(period);
  }
}
