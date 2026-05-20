import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ requestId?: string; headers: Record<string, string | undefined> }>();
    request.requestId = request.headers["x-request-id"] ?? randomUUID();
    return next.handle();
  }
}
