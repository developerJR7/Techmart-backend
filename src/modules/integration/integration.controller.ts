import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Integrations')
@Controller('integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Post()
  @ApiOperation({ summary: 'Criar ou atualizar integração' })
  @ApiResponse({ status: 200, description: 'Integração salva com sucesso' })
  createOrUpdate(
    @Body()
    data: {
      name: string;
      provider: string;
      value: string;
      settings?: any;
    },
  ) {
    return this.integrationService.createOrUpdate(data);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as integrações' })
  findAll() {
    return this.integrationService.findAll();
  }

  @Get(':name')
  @ApiOperation({ summary: 'Buscar integração por nome' })
  findByName(@Param('name') name: string) {
    return this.integrationService.findByName(name);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/Desativar integração' })
  toggleActive(@Param('id') id: string) {
    return this.integrationService.toggleActive(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Testar conexão da integração' })
  @ApiResponse({ status: 200, description: 'Teste realizado com sucesso' })
  testConnection(@Param('id') id: string) {
    return this.integrationService.testConnection(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover integração' })
  delete(@Param('id') id: string) {
    return this.integrationService.delete(id);
  }
}
