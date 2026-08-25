import { IsString, IsOptional, MinLength } from 'class-validator';

/**
 * Campos que o próprio usuário pode alterar em si mesmo via PATCH /users/me.
 * Propositalmente não inclui email, role, isActive nem qualquer outro campo
 * sensível — o ValidationPipe global (whitelist + forbidNonWhitelisted)
 * rejeita qualquer campo fora desta lista antes de chegar ao service.
 */
export class UpdateProfileDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}
