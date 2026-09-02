import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { RequestUser } from '../../types/express';

/**
 * Mesma estratégia JWT do JwtAuthGuard, mas nunca rejeita a requisição por
 * falta (ou invalidade) de token — usado em endpoints públicos que também
 * quer reconhecer um usuário autenticado quando ele existe (ex.: chatbot
 * público). NUNCA usar em rotas que exigem autenticação: aqui a ausência
 * de `request.user` é um estado válido, não um erro.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = RequestUser>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    // Passport chama isto com user=false tanto pra "sem token" quanto pra
    // "token inválido/expirado" — nos dois casos, seguimos como anônimo em
    // vez de lançar 401, e nunca propagamos `_err`.
    return user || undefined;
  }
}
