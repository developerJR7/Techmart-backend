import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SellersService } from '../sellers/sellers.service';
import { SellerStatus } from '@prisma/client';

@ApiTags('Admin - Sellers')
@Controller('admin/sellers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminSellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar solicitações de vendedor (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'],
  })
  findAll(@Query() query: any) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;
    return this.sellersService.findAllForAdmin({
      page,
      limit,
      status: query.status as SellerStatus | undefined,
    });
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Aprovar solicitação de vendedor (Admin)' })
  approve(@Param('id') id: string) {
    return this.sellersService.approve(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rejeitar solicitação de vendedor (Admin)' })
  reject(@Param('id') id: string) {
    return this.sellersService.reject(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspender vendedor aprovado (Admin)' })
  suspend(@Param('id') id: string) {
    return this.sellersService.suspend(id);
  }
}
