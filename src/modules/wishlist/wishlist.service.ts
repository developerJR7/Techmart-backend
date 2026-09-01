import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';

// nanoid v5+ é ESM-only (sem build CommonJS) e quebra em runtime nesse
// projeto, que compila para CommonJS — gerador nativo equivalente, sem
// dependência extra.
function generateToken(length: number): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

@Injectable()
export class WishlistService {
  constructor(private prisma: PrismaService) {}

  async getWishlist(userId: string) {
    let wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({
        data: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: true,
                },
              },
            },
          },
        },
      });
    }

    return wishlist;
  }

  async addItem(userId: string, productId: string) {
    // Verificar se o produto existe
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Produto não encontrado');
    }

    // Obter ou criar wishlist
    let wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({
        data: { userId },
      });
    }

    // Verificar se o item já existe
    const existingItem = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    if (existingItem) {
      throw new ConflictException('Produto já está na lista de desejos');
    }

    // Adicionar item
    await this.prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    return this.getWishlist(userId);
  }

  async removeItem(userId: string, productId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      throw new NotFoundException('Lista de desejos não encontrada');
    }

    const item = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado na lista de desejos');
    }

    await this.prisma.wishlistItem.delete({
      where: { id: item.id },
    });

    return this.getWishlist(userId);
  }

  async checkIfInWishlist(userId: string, productId: string): Promise<boolean> {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      return false;
    }

    const item = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    return !!item;
  }

  async generateShareLink(userId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      throw new NotFoundException('Lista de desejos não encontrada');
    }

    const shareToken = generateToken(16);

    await this.prisma.wishlist.update({
      where: { id: wishlist.id },
      data: {
        isPublic: true,
        shareToken,
      },
    });

    return {
      shareToken,
      shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wishlist/shared/${shareToken}`,
    };
  }

  async getSharedWishlist(shareToken: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { shareToken },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!wishlist || !wishlist.isPublic) {
      throw new NotFoundException('Lista de desejos não encontrada');
    }

    return wishlist;
  }

  async clearWishlist(userId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      throw new NotFoundException('Lista de desejos não encontrada');
    }

    await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id },
    });

    return this.getWishlist(userId);
  }
}
