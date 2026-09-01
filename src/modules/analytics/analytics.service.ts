import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AnalyticsMetrics {
  revenue: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    growth: number; // % vs previous period
  };
  orders: {
    total: number;
    today: number;
    pending: number;
    completed: number;
    averageValue: number;
  };
  conversion: {
    rate: number;
    cartAbandonment: number;
    checkoutAbandonment: number;
  };
  products: {
    totalActive: number;
    lowStock: number;
    outOfStock: number;
    topSelling: Array<{
      id: string;
      name: string;
      sales: number;
      revenue: number;
    }>;
  };
  customers: {
    total: number;
    new: number;
    returning: number;
    averageLifetimeValue: number;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get comprehensive analytics dashboard
   */
  async getDashboardMetrics(days: number = 30): Promise<AnalyticsMetrics> {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);

    // Revenue metrics
    const revenue = await this.getRevenueMetrics(
      periodStart,
      startOfToday,
      startOfWeek,
      startOfMonth,
    );

    // Order metrics
    const orders = await this.getOrderMetrics(periodStart);

    // Conversion metrics
    const conversion = await this.getConversionMetrics();

    // Product metrics
    const products = await this.getProductMetrics(periodStart);

    // Customer metrics
    const customers = await this.getCustomerMetrics(periodStart);

    return {
      revenue,
      orders,
      conversion,
      products,
      customers,
    };
  }

  private async getRevenueMetrics(
    periodStart: Date,
    startOfToday: Date,
    startOfWeek: Date,
    startOfMonth: Date,
  ) {
    const [totalRevenue, todayRevenue, weekRevenue, monthRevenue] =
      await Promise.all([
        this.calculateRevenue(periodStart),
        this.calculateRevenue(startOfToday),
        this.calculateRevenue(startOfWeek),
        this.calculateRevenue(startOfMonth),
      ]);

    // Calculate growth (compare with previous period)
    const previousPeriodStart = new Date(periodStart);
    previousPeriodStart.setDate(
      previousPeriodStart.getDate() -
        (new Date().getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const previousRevenue = await this.calculateRevenue(
      previousPeriodStart,
      periodStart,
    );
    const growth =
      previousRevenue > 0
        ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
        : 0;

    return {
      total: totalRevenue,
      today: todayRevenue,
      thisWeek: weekRevenue,
      thisMonth: monthRevenue,
      growth,
    };
  }

  private async calculateRevenue(from: Date, to?: Date) {
    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: from },
      status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] },
    };
    if (to) {
      (where.createdAt as Prisma.DateTimeFilter).lte = to;
    }

    const orders = await this.prisma.order.findMany({ where });
    return orders.reduce((sum, order) => sum + Number(order.total), 0);
  }

  private async getOrderMetrics(periodStart: Date) {
    const [allOrders, todayOrders, pendingOrders, completedOrders] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { createdAt: { gte: periodStart } },
        }),
        this.prisma.order.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        this.prisma.order.count({
          where: { status: 'PENDING' },
        }),
        this.prisma.order.count({
          where: { status: 'DELIVERED' },
        }),
      ]);

    const totalRevenue = allOrders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const averageValue =
      allOrders.length > 0 ? totalRevenue / allOrders.length : 0;

    return {
      total: allOrders.length,
      today: todayOrders,
      pending: pendingOrders,
      completed: completedOrders,
      averageValue,
    };
  }

  private async getConversionMetrics() {
    const [totalUsers, totalOrders, cartsWithItems, ordersCount] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.order.count(),
        this.prisma.cart.count({
          where: { items: { some: {} } },
        }),
        this.prisma.order.count(),
      ]);

    const conversionRate =
      totalUsers > 0 ? (totalOrders / totalUsers) * 100 : 0;
    const cartAbandonment =
      cartsWithItems > 0
        ? ((cartsWithItems - ordersCount) / cartsWithItems) * 100
        : 0;

    return {
      rate: conversionRate,
      cartAbandonment,
      checkoutAbandonment: 0, // Would need checkout tracking
    };
  }

  private async getProductMetrics(periodStart: Date) {
    const [totalActive, lowStock, outOfStock, orderItems] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({
        where: { isActive: true, stock: { gt: 0, lte: 10 } },
      }),
      this.prisma.product.count({
        where: { isActive: true, stock: 0 },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: periodStart },
            status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] },
          },
        },
        include: { product: true },
      }),
    ]);

    // Calculate top selling products
    const productSales = new Map<
      string,
      { name: string; sales: number; revenue: number }
    >();

    orderItems.forEach((item) => {
      const existing = productSales.get(item.productId) || {
        name: item.product.name,
        sales: 0,
        revenue: 0,
      };
      existing.sales += item.quantity;
      existing.revenue += Number(item.price) * item.quantity;
      productSales.set(item.productId, existing);
    });

    const topSelling = Array.from(productSales.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalActive,
      lowStock,
      outOfStock,
      topSelling,
    };
  }

  private async getCustomerMetrics(periodStart: Date) {
    const [totalCustomers, newCustomers, orders] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.user.count({
        where: {
          role: 'CUSTOMER',
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.order.findMany({
        where: {
          status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] },
        },
        select: { userId: true, total: true },
      }),
    ]);

    // Calculate customer lifetime value
    const customerRevenue = new Map<string, number>();
    orders.forEach((order) => {
      const current = customerRevenue.get(order.userId) || 0;
      customerRevenue.set(order.userId, current + Number(order.total));
    });

    const totalLifetimeValue = Array.from(customerRevenue.values()).reduce(
      (sum, val) => sum + val,
      0,
    );
    const averageLifetimeValue =
      customerRevenue.size > 0 ? totalLifetimeValue / customerRevenue.size : 0;

    const returningCustomers = Array.from(customerRevenue.entries()).filter(
      ([, value]) => value > 0,
    ).length;

    return {
      total: totalCustomers,
      new: newCustomers,
      returning: returningCustomers,
      averageLifetimeValue,
    };
  }

  /**
   * Get abandoned carts for recovery campaigns
   */
  async getAbandonedCarts(hours: number = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    const carts = await this.prisma.cart.findMany({
      where: {
        updatedAt: { gte: cutoff },
        items: { some: {} },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, price: true, images: true },
            },
          },
        },
      },
    });

    // Filter out users who completed orders
    const abandonedCarts: Array<
      (typeof carts)[number] & { estimatedValue: number }
    > = [];
    for (const cart of carts) {
      if (!cart.userId) continue;

      const recentOrder = await this.prisma.order.findFirst({
        where: {
          userId: cart.userId,
          createdAt: { gte: cart.updatedAt },
        },
      });

      if (!recentOrder) {
        const cartValue = cart.items.reduce(
          (sum, item) => sum + Number(item.product.price) * item.quantity,
          0,
        );
        abandonedCarts.push({
          ...cart,
          estimatedValue: cartValue,
        });
      }
    }

    return abandonedCarts;
  }

  /**
   * Get real-time stats for dashboard
   */
  async getRealtimeStats() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last1h = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      ordersLast24h,
      ordersLast1h,
      revenueLast24h,
      activeUsers,
      lowStockAlerts,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { createdAt: { gte: last24h } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: last1h } },
      }),
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: last24h },
          status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] },
        },
      }),
      this.prisma.user.count({
        where: {
          updatedAt: { gte: last1h },
        },
      }),
      this.prisma.product.count({
        where: { stock: { lte: 5 }, isActive: true },
      }),
    ]);

    const revenue24h = revenueLast24h.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

    return {
      ordersLast24h,
      ordersLast1h,
      revenueLast24h: revenue24h,
      activeUsers,
      lowStockAlerts,
      timestamp: now,
    };
  }
}
