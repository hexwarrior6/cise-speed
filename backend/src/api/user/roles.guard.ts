import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './user.schema';
import { AuthenticatedUser } from './jwt-auth.guard';
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>('roles', [context.getHandler(), context.getClass()]);
    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
    if (roles?.length && (!user || !roles.includes(user.role))) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
