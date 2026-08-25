import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add points to user account
   */
  async addPoints(
    userId: string,
    amount: number,
    type: 'EARN' | 'ADJUSTMENT' | 'REFUND',
    description: string,
    orderId?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      // Create transaction record
      await tx.loyaltyTransaction.create({
        data: {
          userId,
          amount,
          type,
          description,
          orderId,
        },
      });

      // Update user balance
      const user = await tx.user.update({
        where: { id: userId },
        data: { points: { increment: amount } },
      });

      return { success: true, newBalance: user.points };
    });
  }

  /**
   * Redeem points for discount
   */
  async redeemPoints(userId: string, amount: number, orderId?: string) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.points < amount) {
        throw new BadRequestException('Insufficient points');
      }

      // Create transaction record
      await tx.loyaltyTransaction.create({
        data: {
          userId,
          amount: -amount,
          type: 'REDEEM',
          description: 'Points redemption for discount',
          orderId,
        },
      });

      // Update user balance
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: amount } },
      });

      return { success: true, newBalance: updatedUser.points };
    });
  }

  /**
   * Get user points balance and history
   */
  async getLoyaltyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });

    const history = await this.prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      points: user?.points || 0,
      history,
    };
  }

  /**
   * Calculate points to be earned for an order amount
   * Rule: 1 point per R$ 1.00 spent
   */
  calculatePointsEarned(amount: number): number {
    return Math.floor(amount);
  }

  /**
   * Calculate discount value for points
   * Rule: 100 points = R$ 5.00 discount (0.05 per point)
   */
  calculateDiscountValue(points: number): number {
    return points * 0.05;
  }
}
