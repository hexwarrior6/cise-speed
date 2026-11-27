import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { UserRole } from './user.schema';

export interface AuthenticatedUser { sub: string; email: string; username: string; role: UserRole; }

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private users: UserService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Authentication required');
    try {
      const payload = await this.jwtService.verifyAsync(token, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string') throw new UnauthorizedException();
      const user = await this.users.findOne(payload.sub);
      if (!user?.isActive) throw new UnauthorizedException();
      request.user = { sub: user._id.toString(), email: user.email, username: user.username, role: user.role } satisfies AuthenticatedUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
