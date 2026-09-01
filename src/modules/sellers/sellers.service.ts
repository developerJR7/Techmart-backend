import {
  ForbiddenException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SellerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

@Injectable()
export class SellersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Seller.userId é único no schema, então "reaplicar" nunca pode
   * significar criar uma segunda linha pro mesmo usuário. REJECTED
   * reaproveita a própria linha voltando pra PENDING; qualquer outro
   * status existente (PENDING/APPROVED/SUSPENDED) é 409.
   */
  async apply(userId: string, dto: ApplySellerDto) {
    const existing = await this.prisma.seller.findUnique({
      where: { userId },
    });

    if (!existing) {
      try {
        return await this.prisma.seller.create({
          data: {
            userId,
            document: dto.document,
            phone: dto.phone,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'Você já possui uma solicitação de vendedor com esse ID de usuário',
          );
        }
        throw error;
      }
    }

    if (existing.status !== 'REJECTED') {
      throw new ConflictException(
        `Você já possui uma solicitação de vendedor com status ${existing.status}`,
      );
    }

    return this.prisma.seller.update({
      where: { userId },
      data: {
        status: 'PENDING',
        document: dto.document ?? existing.document,
        phone: dto.phone ?? existing.phone,
      },
    });
  }

  async findAllForAdmin(params: {
    page: number;
    limit: number;
    status?: SellerStatus;
  }) {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.seller.findMany({
        where,
        select: {
          id: true,
          userId: true,
          document: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.seller.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.max(Math.ceil(total / limit), 1),
        limit,
      },
    };
  }

  /** Usado pelo StoreService — nunca aceita sellerId vindo do cliente. */
  async getApprovedSellerByUserId(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });

    if (!seller || seller.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Apenas vendedores aprovados podem executar esta ação',
      );
    }

    return seller;
  }

  protected async findByIdOrThrow(id: string) {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) {
      throw new NotFoundException('Solicitação de vendedor não encontrada');
    }
    return seller;
  }

  /**
   * Promove pra SELLER na mesma transação: o resto da API já protege
   * rotas de vendedor com @Roles('SELLER') + RolesGuard (mesmo mecanismo
   * usado em todo o projeto), e o JwtStrategy busca role sempre fresco do
   * banco a cada request — não é preciso o usuário logar de novo.
   */
  async approve(id: string) {
    const seller = await this.findByIdOrThrow(id);

    if (seller.status !== 'PENDING') {
      throw new ConflictException(
        `Só é possível aprovar solicitações PENDING (atual: ${seller.status})`,
      );
    }

    if (!seller.userId) {
      throw new ConflictException(
        'Seller da plataforma não possui usuário vinculado',
      );
    }

    const userId = seller.userId;

    const [updatedSeller] = await this.prisma.$transaction([
      this.prisma.seller.update({
        where: { id },
        data: { status: 'APPROVED' },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { role: 'SELLER' },
      }),
    ]);

    return updatedSeller;
  }

  async reject(id: string) {
    const seller = await this.findByIdOrThrow(id);

    if (seller.status !== 'PENDING') {
      throw new ConflictException(
        `Só é possível rejeitar solicitações PENDING (atual: ${seller.status})`,
      );
    }

    return this.prisma.seller.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  /**
   * Reverte User.role pra CUSTOMER: as rotas /seller/store são protegidas
   * por @Roles('SELLER'), então isso já basta pra bloquear o vendedor sem
   * precisar de um guard paralelo baseado em Seller.status. Seller e
   * Store não são apagados nem desativados — só o acesso.
   */
  async suspend(id: string) {
    const seller = await this.findByIdOrThrow(id);

    if (seller.status !== 'APPROVED') {
      throw new ConflictException(
        `Só é possível suspender solicitações APPROVED (atual: ${seller.status})`,
      );
    }

    if (!seller.userId) {
      throw new ConflictException(
        'Seller da plataforma não possui usuário vinculado',
      );
    }

    const userId = seller.userId;

    const [updatedSeller] = await this.prisma.$transaction([
      this.prisma.seller.update({
        where: { id },
        data: { status: 'SUSPENDED' },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { role: 'CUSTOMER' },
      }),
    ]);

    return updatedSeller;
  }
}
