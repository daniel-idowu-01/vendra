import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const details = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = status >= 500 ? "Internal server error" : "Request failed";
    const timestamp = new Date().toISOString();

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception ${status} ${request.method} ${request.url} requestId=${request.requestId ?? "n/a"}`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception)
      );
    }

    response.status(status).json({
      error: message,
      statusCode: status,
      details,
      path: request.url,
      requestId: request.requestId,
      timestamp
    });
  }
}
