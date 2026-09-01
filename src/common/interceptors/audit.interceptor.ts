import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getErrorMessage } from '../utils/error.util';

interface AuditLogParams {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  after: unknown;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, user } = request;
    const body = request.body as { id?: string } | undefined;
    const ip = request.ip;
    const userAgent = request.get('user-agent');

    // Only audit write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Extract entity and action from URL
    const urlParts = url.split('/');
    const entity = urlParts[3]; // Assuming /api/v1/entity/...
    const action = this.getAction(method);

    return next.handle().pipe(
      tap({
        next: (data: { id?: string } | undefined) => {
          void this.createAuditLog({
            userId: user?.id,
            action,
            entity,
            entityId: data?.id ?? body?.id,
            after: data,
            ip,
            userAgent,
          });
        },
      }),
    );
  }

  private async createAuditLog(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          changes: {
            before: null,
            after: params.after as Prisma.InputJsonValue,
          },
          ipAddress: params.ip,
          userAgent: params.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to create audit log:', getErrorMessage(error));
    }
  }

  private getAction(method: string): string {
    const actionMap: Record<string, string> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    return actionMap[method] || 'UNKNOWN';
  }
}
