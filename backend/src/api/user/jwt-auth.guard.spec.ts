import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { UserRole } from './user.schema';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
describe('Authentication and authorization', () => {
  const request: any = { headers: { authorization: 'Bearer token' } };
  const context = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => null, getClass: () => null } as unknown as ExecutionContext;
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-id', role: 'Administrator' }) };
  const users = { findOne: jest.fn() };
  const guard = new JwtAuthGuard(jwt as any, users as any);
  it('uses the current database role, not the stale token role', async () => {
    users.findOne.mockResolvedValue({ _id: 'user-id', email: 'user@example.com', username: 'user', role: UserRole.SUBMITTER, isActive: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.role).toBe(UserRole.SUBMITTER);
    const roles = new RolesGuard({ getAllAndOverride: () => [UserRole.ADMINISTRATOR] } as any);
    expect(() => roles.canActivate(context)).toThrow(ForbiddenException);
  });
  it('rejects inactive users', async () => {
    users.findOne.mockResolvedValue({ isActive: false });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
