import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrdersService } from '../orders/orders.service';
import { OrderStatus, PaymentMethod } from '@prisma/client';

interface AdminOrdersQuery {
  page?: string;
  limit?: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
}

@ApiTags('Admin - Orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os pedidos (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentMethod', required: false })
  async findAll(@Query() query: AdminOrdersQuery) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;

    return this.ordersService.findAllPaginated({
      page,
      limit,
      status: query.status,
      paymentMethod: query.paymentMethod,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes do pedido (Admin)' })
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOneAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status do pedido (Admin)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatus },
  ) {
    return this.ordersService.updateStatus(id, body.status);
  }
}
