import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { LoggerService } from '../logger/logger.service';
import { getErrorMessage, getErrorStack } from '../utils/error.util';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const userId = request.user?.id;

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          const statusCode = response.statusCode;
          const responseTime = Date.now() - now;

          this.logger.logRequest(method, url, statusCode, responseTime, userId);
        },
        error: (error: unknown) => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `${method} ${url} - Error: ${getErrorMessage(error)} (${responseTime}ms)`,
            getErrorStack(error),
            'HttpLoggingInterceptor',
          );
        },
      }),
    );
  }
}
