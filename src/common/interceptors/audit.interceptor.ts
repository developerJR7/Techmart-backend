import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user } = request;
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
        next: async (data) => {
          try {
            await this.prisma.auditLog.create({
              data: {
                userId: user?.id,
                action,
                entity,
                entityId: data?.id || body?.id,
                changes: { before: null, after: data },
                ipAddress: ip,
                userAgent,
              },
            });
          } catch (error) {
            console.error('Failed to create audit log:', error);
          }
        },
      }),
    );
  }

  private getAction(method: string): string {
    const actionMap = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    return actionMap[method] || 'UNKNOWN';
  }
}
