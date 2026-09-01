import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { SetDefaultAddressDto } from './dto/set-default-address.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../types/express';

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar endereço' })
  create(
    @CurrentUser() user: RequestUser,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    return this.addressesService.create(user.id, createAddressDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar endereços do usuário' })
  findAll(@CurrentUser() user: RequestUser) {
    return this.addressesService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter endereço por ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.addressesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar endereço' })
  update(
    @Param('id') id: string,
    @Body() updateAddressDto: Partial<CreateAddressDto>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.addressesService.update(id, user.id, updateAddressDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover endereço' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.addressesService.remove(id, user.id);
  }

  @Post('set-default')
  @ApiOperation({ summary: 'Definir endereço padrão' })
  setDefault(
    @CurrentUser() user: RequestUser,
    @Body() dto: SetDefaultAddressDto,
  ) {
    return this.addressesService.setDefault(user.id, dto.addressId);
  }
}
