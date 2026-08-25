import { HttpException, HttpStatus } from '@nestjs/common';

export class ProductNotFoundException extends HttpException {
  constructor(id: string) {
    super(`Product with ID ${id} not found`, HttpStatus.NOT_FOUND);
  }
}

export class CategoryNotFoundException extends HttpException {
  constructor(id: string) {
    super(`Category with ID ${id} not found`, HttpStatus.NOT_FOUND);
  }
}

export class OrderNotFoundException extends HttpException {
  constructor(id: string) {
    super(`Order with ID ${id} not found`, HttpStatus.NOT_FOUND);
  }
}

export class UserNotFoundException extends HttpException {
  constructor(id: string) {
    super(`User with ID ${id} not found`, HttpStatus.NOT_FOUND);
  }
}

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super('Invalid email or password', HttpStatus.UNAUTHORIZED);
  }
}

export class AccountLockedException extends HttpException {
  constructor(lockedUntil: Date) {
    super(
      `Account is locked until ${lockedUntil.toISOString()}`,
      HttpStatus.FORBIDDEN,
    );
  }
}

export class InsufficientStockException extends HttpException {
  constructor(productName: string, available: number) {
    super(
      `Insufficient stock for ${productName}. Available: ${available}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CouponExpiredException extends HttpException {
  constructor(code: string) {
    super(`Coupon ${code} has expired`, HttpStatus.BAD_REQUEST);
  }
}

export class CouponUsageLimitException extends HttpException {
  constructor(code: string) {
    super(`Coupon ${code} has reached its usage limit`, HttpStatus.BAD_REQUEST);
  }
}

export class PaymentFailedException extends HttpException {
  constructor(reason?: string) {
    super(
      `Payment failed${reason ? `: ${reason}` : ''}`,
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
