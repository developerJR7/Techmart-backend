import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private buildAccessTokenPayload(user: {
    id: string;
    email: string;
    role: string;
  }) {
    return { sub: user.id, email: user.email, role: user.role };
  }

  private getRefreshExpirationDate() {
    const refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    const match = refreshExpiresIn.match(/(\d+)([dhm])/);
    if (!match) {
      const fallback = 7 * 24 * 60 * 60 * 1000;
      return new Date(Date.now() + fallback);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    let multiplier = 24 * 60 * 60 * 1000; // days

    if (unit === 'h') {
      multiplier = 60 * 60 * 1000;
    } else if (unit === 'm') {
      multiplier = 60 * 1000;
    }

    return new Date(Date.now() + value * multiplier);
  }

  private async createRefreshToken(userId: string, expiresAt: Date) {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);

    const refreshToken = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return `${refreshToken.id}.${rawToken}`;
  }

  private async revokeRefreshToken(tokenId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        id: tokenId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private async buildAuthResponse(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const accessToken = this.jwtService.sign(
      this.buildAccessTokenPayload(user),
    );
    const refreshTokenExpiresAt = this.getRefreshExpirationDate();
    const refreshToken = await this.createRefreshToken(
      user.id,
      refreshTokenExpiresAt,
    );

    return {
      user,
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já está em uso');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        name: registerDto.name,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return this.buildAuthResponse(user.id);
  }

  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      const attempts = user.loginAttempts + 1;
      const shouldLock = attempts >= AuthService.MAX_LOGIN_ATTEMPTS;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + AuthService.LOCKOUT_DURATION_MS)
            : null,
        },
      });

      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return this.buildAuthResponse(user.id);
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return user;
  }

  async refreshToken(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Token de atualização não informado');
    }

    const [tokenId, tokenValue] = refreshToken.split('.');

    if (!tokenId || !tokenValue) {
      throw new UnauthorizedException('Token de atualização inválido');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt < new Date() ||
      !storedToken.user ||
      !storedToken.user.isActive
    ) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const isValid = await bcrypt.compare(tokenValue, storedToken.tokenHash);

    if (!isValid) {
      await this.revokeRefreshToken(tokenId);
      throw new UnauthorizedException('Token inválido');
    }

    await this.revokeRefreshToken(tokenId);

    return this.buildAuthResponse(storedToken.user.id);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const [tokenId] = refreshToken.split('.');
      if (tokenId) {
        await this.prisma.refreshToken.updateMany({
          where: {
            id: tokenId,
            userId,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }
      return { success: true };
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    const passwordReset = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      message: 'Token de recuperação gerado',
      resetToken:
        this.configService.get('NODE_ENV') === 'development'
          ? `${passwordReset.id}.${rawToken}`
          : undefined,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const [tokenId, tokenValue] = token.split('.');

    if (!tokenId || !tokenValue) {
      throw new BadRequestException('Token inválido');
    }

    const storedToken = await this.prisma.passwordResetToken.findUnique({
      where: { id: tokenId },
    });

    if (
      !storedToken ||
      storedToken.usedAt ||
      storedToken.expiresAt < new Date()
    ) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const isValid = await bcrypt.compare(tokenValue, storedToken.tokenHash);

    if (!isValid) {
      throw new BadRequestException('Token inválido');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: storedToken.userId },
        data: {
          password: hashedPassword,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: storedToken.id },
        data: {
          usedAt: new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: storedToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return { message: 'Senha atualizada com sucesso' };
  }
}
