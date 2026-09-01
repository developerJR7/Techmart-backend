import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../types/express';

@ApiTags('Cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Obter carrinho do usuário' })
  getCart(@CurrentUser() user: RequestUser) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Adicionar item ao carrinho' })
  addItem(
    @CurrentUser() user: RequestUser,
    @Body() addToCartDto: AddToCartDto,
  ) {
    return this.cartService.addItem(user.id, addToCartDto);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Atualizar quantidade de item' })
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(
      user.id,
      productId,
      updateCartItemDto.quantity,
    );
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remover item do carrinho' })
  removeItem(
    @CurrentUser() user: RequestUser,
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(user.id, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Limpar carrinho' })
  clearCart(@CurrentUser() user: RequestUser) {
    return this.cartService.clearCart(user.id);
  }

  @Post('merge')
  @ApiOperation({
    summary: 'Mesclar carrinho de convidado com carrinho do usuário',
  })
  mergeCart(
    @CurrentUser() user: RequestUser,
    @Body() guestCartItems: AddToCartDto[],
  ) {
    return this.cartService.mergeGuestCart(user.id, guestCartItems);
  }
}
