import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createReviewDto: CreateReviewDto) {
    // Verificar se o produto existe
    const product = await this.prisma.product.findUnique({
      where: { id: createReviewDto.productId },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Verificar se o usuário já avaliou este produto
    const existingReview = await this.prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: createReviewDto.productId,
        },
      },
    });

    if (existingReview) {
      throw new ConflictException('Você já avaliou este produto');
    }

    // Verificar se é compra verificada
    const hasOrdered = await this.prisma.orderItem.findFirst({
      where: {
        productId: createReviewDto.productId,
        order: {
          userId,
          status: 'DELIVERED',
        },
      },
    });

    const review = await this.prisma.review.create({
      data: {
        userId,
        productId: createReviewDto.productId,
        rating: createReviewDto.rating,
        title: createReviewDto.title,
        comment: createReviewDto.comment,
        isVerifiedPurchase: !!hasOrdered,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Atualizar rating médio do produto
    await this.updateProductRating(createReviewDto.productId);

    return review;
  }

  async findByProduct(productId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          productId,
          isApproved: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ isVerifiedPurchase: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: {
          productId,
          isApproved: true,
        },
      }),
    ]);

    return {
      reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    return review;
  }

  async update(id: string, userId: string, updateReviewDto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    if (review.userId !== userId) {
      throw new BadRequestException('Você não pode editar esta avaliação');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: updateReviewDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Atualizar rating médio se a nota mudou
    if (updateReviewDto.rating) {
      await this.updateProductRating(review.productId);
    }

    return updated;
  }

  async remove(id: string, userId: string, isAdmin = false) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    if (!isAdmin && review.userId !== userId) {
      throw new BadRequestException('Você não pode deletar esta avaliação');
    }

    await this.prisma.review.delete({
      where: { id },
    });

    // Atualizar rating médio
    await this.updateProductRating(review.productId);

    return { message: 'Avaliação removida com sucesso' };
  }

  async moderate(id: string, isApproved: boolean) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    return this.prisma.review.update({
      where: { id },
      data: { isApproved },
    });
  }

  private async updateProductRating(productId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        productId,
        isApproved: true,
      },
      select: {
        rating: true,
      },
    });

    if (reviews.length === 0) {
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          averageRating: null,
          reviewCount: 0,
        },
      });
      return;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: Math.round(averageRating * 100) / 100,
        reviewCount: reviews.length,
      },
    });
  }
}
