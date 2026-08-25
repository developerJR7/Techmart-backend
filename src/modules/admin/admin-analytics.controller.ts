import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Admin - Analytics')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Métricas do dashboard (Admin)' })
  async getDashboard() {
    const [totalRevenue, totalOrders, totalUsers, totalProducts, recentOrders] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] } },
          _sum: { total: true },
        }),
        this.prisma.order.count({
          where: { status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] } },
        }),
        this.prisma.user.count(),
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.order.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        }),
      ]);

    // Top products
    const orderItems = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: {
        quantity: true,
      },
      _count: {
        productId: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 5,
    });

    const topProductIds = orderItems.map((item) => item.productId);
    const topProducts = await this.prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true },
    });

    const topProductsWithStats = orderItems.map((item) => {
      const product = topProducts.find((p) => p.id === item.productId);
      return {
        id: item.productId,
        name: product?.name || 'Unknown',
        totalSold: item._sum.quantity || 0,
      };
    });

    return {
      totalRevenue: Number(totalRevenue._sum.total || 0),
      totalOrders,
      totalUsers,
      totalProducts,
      revenueGrowth: 0, // Calcular com dados históricos
      ordersGrowth: 0,
      usersGrowth: 0,
      topProducts: topProductsWithStats,
      recentOrders,
    };
  }

  @Get('sales')
  @ApiOperation({ summary: 'Relatório de vendas (Admin)' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({
    name: 'groupBy',
    required: false,
    enum: ['day', 'week', 'month'],
  })
  async getSalesReport(@Query() query: any) {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      data: orders.map((order) => ({
        date: order.createdAt.toISOString().split('T')[0],
        revenue: Number(order.total),
      })),
      summary: {
        totalRevenue,
        totalOrders,
        averageOrderValue,
      },
    };
  }
}
