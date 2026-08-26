import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@ApiTags('Seller - Store')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SELLER')
@Controller('seller/store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @ApiOperation({ summary: 'Criar a loja do vendedor autenticado' })
  create(@CurrentUser() user: any, @Body() dto: CreateStoreDto) {
    return this.storeService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obter a própria loja' })
  findMine(@CurrentUser() user: any) {
    return this.storeService.findMine(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualizar a própria loja' })
  update(@CurrentUser() user: any, @Body() dto: UpdateStoreDto) {
    return this.storeService.update(user.id, dto);
  }
}
