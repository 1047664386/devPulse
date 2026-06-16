import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Allows unauthenticated requests but still parses JWT if present.
 * Use this for endpoints that behave differently for logged-in vs anonymous users.
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(_err: any, user: TUser): TUser {
    // Don't throw on auth failure — just return undefined (no user)
    return user;
  }

  canActivate(context: ExecutionContext) {
    // Always allow the request through; Passport will set user if token is valid
    return super.canActivate(context);
  }
}
