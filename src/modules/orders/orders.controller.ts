import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrderStatus } from '@prisma/client';
import type { RequestUser } from '../../types/express';

import { UpsellService } from './upsell.service';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly upsellService: UpsellService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar novo pedido' })
  create(
    @CurrentUser() user: RequestUser,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.id, createOrderDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos do usuário' })
  findAll(@CurrentUser() user: RequestUser) {
    return this.ordersService.findAll(user.id);
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar todos os pedidos (Admin)' })
  findAllAdmin() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter pedido por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.findOne(
      id,
      user.role === 'ADMIN' ? undefined : user.id,
    );
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar status do pedido (Admin)' })
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.ordersService.updateStatus(id, status);
  }

  @Get(':id/upsell-offers')
  @ApiOperation({ summary: 'Get upsell offers for completed order' })
  async getUpsellOffers(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Garante que o pedido pertence ao usuário (ou é admin) antes de gerar ofertas
    await this.ordersService.findOne(
      id,
      user.role === 'ADMIN' ? undefined : user.id,
    );
    return this.upsellService.generateUpsellOffers(id);
  }

  @Post(':id/upsell/:productId')
  @ApiOperation({ summary: 'Process one-click upsell purchase' })
  processUpsell(
    @Param('id') orderId: string,
    @Param('productId') productId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.upsellService.processUpsell(orderId, productId, user.id);
  }
}
