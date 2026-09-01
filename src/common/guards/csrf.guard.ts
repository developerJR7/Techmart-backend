import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_TOKEN_COOKIE, isValidCsrfToken } from '../auth/cookie.util';

/**
 * Double-submit CSRF check (com token assinado por CSRF_SECRET) para os
 * endpoints que autenticam via cookie (refresh/logout). As demais rotas
 * usam Bearer token no header Authorization, que não é enviado
 * automaticamente pelo navegador em requisições cross-site, então não
 * precisam desta proteção.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieToken: unknown = request.cookies?.[CSRF_TOKEN_COOKIE];
    const headerToken = request.headers['x-xsrf-token'];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      !cookieToken ||
      !headerToken ||
      cookieToken !== headerToken ||
      !isValidCsrfToken(cookieToken)
    ) {
      throw new ForbiddenException('Token CSRF inválido ou ausente');
    }

    return true;
  }
}
