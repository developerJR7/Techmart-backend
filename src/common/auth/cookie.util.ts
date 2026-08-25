import type { Response } from 'express';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const CSRF_TOKEN_COOKIE = 'XSRF-TOKEN';

// Assina o token de CSRF com CSRF_SECRET (documentado em .env.example) para
// que um cookie "arremessado" por um atacante (ex.: via subdomínio) não
// consiga produzir um par cookie/header válido sem conhecer o segredo do
// servidor. Se CSRF_SECRET não estiver configurado (ex.: dev local), cai
// para uma chave gerada uma única vez por processo — ainda assinado, só
// não sobrevive a um restart do servidor.
let ephemeralSecret: string | undefined;
function getCsrfSecret(): string {
  if (process.env.CSRF_SECRET) {
    return process.env.CSRF_SECRET;
  }
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
  }
  return ephemeralSecret;
}

function sign(value: string): string {
  return createHmac('sha256', getCsrfSecret()).update(value).digest('hex');
}

export function isValidCsrfToken(token: string | undefined): boolean {
  if (!token) return false;
  const [value, signature] = token.split('.');
  if (!value || !signature) return false;

  const expected = sign(value);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

// O refresh token só é enviado para as rotas de auth que precisam dele,
// reduzindo a exposição do cookie httpOnly às demais rotas da API.
const AUTH_COOKIE_PATH = '/api/v1/auth';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  expiresAt: Date,
) {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: AUTH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: AUTH_COOKIE_PATH,
  });
}

// Cookie de CSRF (double-submit assinado): legível por JS de propósito,
// para o axios ecoar o valor em um header customizado que um form/site
// externo não consegue forjar nem ler (CORS bloqueia leitura cross-site).
export function setCsrfCookie(res: Response) {
  const value = randomBytes(24).toString('hex');
  const token = `${value}.${sign(value)}`;
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: '/',
  });
  return token;
}
