import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type AuthenticatedUser = {
  sub: string;
  email: string;
  organizationId?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  }
);
