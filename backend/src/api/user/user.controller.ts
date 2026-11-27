import { Body, Controller, Get, Post, Put, UseGuards, Param, Req, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, LoginUserDto, LoginResponseDto, UpdateRoleDto } from './user.dto';
import { JwtAuthGuard, AuthenticatedUser } from './jwt-auth.guard';
import { Roles, RolesGuard } from './roles.guard';
import { UserRole } from './user.schema';

@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Post('/register')
  async register(@Body() dto: CreateUserDto) {
    const user = await this.userService.register(dto);
    const { password, ...result } = user.toObject();
    return { message: 'User registered successfully', user: { ...result, id: user._id.toString() } };
  }
  @Post('/login')
  login(@Body() dto: LoginUserDto): Promise<LoginResponseDto> { return this.userService.login(dto); }
  @Get('/me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: AuthenticatedUser }) {
    const { sub, ...user } = req.user;
    return { ...user, id: sub };
  }
  @Get('/')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async findAll() {
    const users = await this.userService.findAll();
    return users.map(user => {
      const { password, ...result } = user.toObject();
      return { ...result, id: user._id.toString() };
    });
  }
  @Put('/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async updateUserRole(@Param('id') id: string, @Body() body: UpdateRoleDto, @Req() req: { user: AuthenticatedUser }) {
    if (id === req.user.sub && body.role !== UserRole.ADMINISTRATOR) throw new ForbiddenException('Cannot remove your own administrator role');
    const user = await this.userService.update(id, { role: body.role });
    if (!user) throw new NotFoundException('User not found');
    const { password, ...result } = user.toObject();
    return { message: 'User role updated successfully', user: { ...result, id: user._id.toString() } };
  }
}
