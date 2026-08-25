import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Wishlist')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter lista de desejos do usuário' })
  getWishlist(@Request() req) {
    return this.wishlistService.getWishlist(req.user.id);
  }

  @Post('items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adicionar produto à lista de desejos' })
  addItem(@Request() req, @Body() addToWishlistDto: AddToWishlistDto) {
    return this.wishlistService.addItem(
      req.user.id,
      addToWishlistDto.productId,
    );
  }

  @Delete('items/:productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover produto da lista de desejos' })
  @ApiParam({ name: 'productId', description: 'ID do produto' })
  removeItem(@Request() req, @Param('productId') productId: string) {
    return this.wishlistService.removeItem(req.user.id, productId);
  }

  @Get('check/:productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar se produto está na lista de desejos' })
  @ApiParam({ name: 'productId', description: 'ID do produto' })
  async checkItem(@Request() req, @Param('productId') productId: string) {
    const inWishlist = await this.wishlistService.checkIfInWishlist(
      req.user.id,
      productId,
    );
    return { inWishlist };
  }

  @Post('share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gerar link de compartilhamento da lista de desejos',
  })
  generateShareLink(@Request() req) {
    return this.wishlistService.generateShareLink(req.user.id);
  }

  @Get('shared/:shareToken')
  @ApiOperation({ summary: 'Obter lista de desejos compartilhada (público)' })
  @ApiParam({ name: 'shareToken', description: 'Token de compartilhamento' })
  getSharedWishlist(@Param('shareToken') shareToken: string) {
    return this.wishlistService.getSharedWishlist(shareToken);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Limpar lista de desejos' })
  clearWishlist(@Request() req) {
    return this.wishlistService.clearWishlist(req.user.id);
  }
}
