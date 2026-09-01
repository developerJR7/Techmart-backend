import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SellersService } from './sellers.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoreService {
  constructor(
    private prisma: PrismaService,
    private sellersService: SellersService,
  ) {}

  async create(userId: string, dto: CreateStoreDto) {
    const seller = await this.sellersService.getApprovedSellerByUserId(userId);

    try {
      return await this.prisma.store.create({
        data: {
          sellerId: seller.id,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Você já possui uma loja, ou o slug informado já está em uso',
        );
      }
      throw error;
    }
  }

  /**
   * A Store é sempre resolvida pelo sellerId do usuário autenticado — não
   * existe :id na rota, então não há como um Seller pedir a Store de
   * outro Seller através deste endpoint.
   */
  async findMine(userId: string) {
    const seller = await this.sellersService.getApprovedSellerByUserId(userId);

    const store = await this.prisma.store.findUnique({
      where: { sellerId: seller.id },
    });

    if (!store) {
      throw new NotFoundException('Você ainda não possui uma loja');
    }

    return store;
  }

  async update(userId: string, dto: UpdateStoreDto) {
    const seller = await this.sellersService.getApprovedSellerByUserId(userId);

    const store = await this.prisma.store.findUnique({
      where: { sellerId: seller.id },
    });

    if (!store) {
      throw new NotFoundException('Você ainda não possui uma loja');
    }

    try {
      return await this.prisma.store.update({
        where: { sellerId: seller.id },
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Slug já está em uso por outra loja');
      }
      throw error;
    }
  }
}
