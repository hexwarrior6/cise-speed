import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsNumber, Min, Max } from 'class-validator';
import { ArticleService } from './article.service';
import { CreateArticleDto, ReviewArticleDto } from './create-article.dto';
import { ArticleStatus } from './article.schema';
import { JwtAuthGuard, AuthenticatedUser } from '../user/jwt-auth.guard';
import { Roles, RolesGuard } from '../user/roles.guard';
import { UserRole } from '../user/user.schema';
class RatingDto {
  @IsNumber() @Min(0.5) @Max(5)
  score: number;
}
const publicFields = new Set(['customId','title','authors','source','pubyear','doi','claim','evidence','status','averageRating','createdAt','updatedAt']);
function publicArticle(article: any) {
  const value = typeof article.toObject === 'function' ? article.toObject() : article;
  return Object.fromEntries(Object.entries(value).filter(([key]) => publicFields.has(key)));
}
@Controller('api/articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}
  @Get('/test')
  test() { return 'Article API is working'; }
  @Get('/')
  async findAll(@Query('status') status?: ArticleStatus) {
    if (status && status !== ArticleStatus.APPROVED) throw new ForbiddenException('Only approved articles are public');
    return (await this.articleService.findAll(status)).map(publicArticle);
  }
  @Get('/search/advanced')
  async searchArticles(
    @Query('keywords') keywords: string,
    @Query('evidenceType') evidenceType?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortDirection') sortDirection: 'asc' | 'desc' = 'desc',
    @Query('pubYearFrom') pubYearFrom?: string,
    @Query('pubYearTo') pubYearTo?: string,
    @Query('authors') authors?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
  ) {
    if (status && status !== ArticleStatus.APPROVED) throw new ForbiddenException('Only approved articles are public');
    const articles = await this.articleService.searchArticles(keywords, evidenceType, sortBy, sortDirection, pubYearFrom, pubYearTo, authors, status as ArticleStatus, source);
    return articles.map(publicArticle);
  }
  @Get('/moderator/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMINISTRATOR)
  getPendingArticles() { return this.articleService.findAll(ArticleStatus.PENDING); }
  @Get('/moderator/notification-issues')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMINISTRATOR)
  listNotificationIssues() { return this.articleService.listNotificationIssues(); }

  @Post('/:id/notification/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMINISTRATOR)
  async retryNotification(@Param('id') id: string) {
    await this.articleService.retryNotification(id);
    return { message: 'Notification queued for retry' };
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    const article = await this.articleService.findOne(id);
    if (!article || article.status !== ArticleStatus.APPROVED) throw new NotFoundException('Article not found');
    return publicArticle(article);
  }
  @Post('/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUBMITTER, UserRole.ADMINISTRATOR)
  async submitArticle(@Body() dto: CreateArticleDto, @Req() req: { user: AuthenticatedUser }) {
    const article = await this.articleService.submitArticle({
      ...dto,
      submitterId: req.user.sub,
      submitterEmail: dto.useEmailForNotification === false ? undefined : req.user.email,
    });
    return { message: 'Article submitted successfully', article };
  }
  @Post(':id/rating')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SEARCHER, UserRole.ANALYST)
  async addRating(@Param('id') id: string, @Body() body: RatingDto, @Req() req: { user: AuthenticatedUser }) {
    return publicArticle(await this.articleService.addRating(id, req.user.sub, body.score));
  }
  @Put('/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async updateArticle(@Param('id') id: string, @Body() dto: CreateArticleDto) {
    const { customId, useEmailForNotification, ...metadata } = dto;
    const updated = await this.articleService.update(id, metadata);
    if (!updated) throw new NotFoundException('Article not found');
    return { message: 'Article updated successfully' };
  }
  @Post('/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMINISTRATOR)
  async reviewArticle(@Param('id') id: string, @Body() dto: ReviewArticleDto, @Req() req: { user: AuthenticatedUser }) {
    const article = await this.articleService.reviewArticle(id, dto, req.user.sub);
    return { message: 'Article reviewed successfully', article };
  }
  @Post('/check-duplicate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMINISTRATOR)
  checkDuplicates(@Body('doi') doi: string, @Body('excludeId') excludeId?: string) {
    if (typeof doi !== 'string' || !doi.trim() || doi.length > 500 || (excludeId !== undefined && typeof excludeId !== 'string')) throw new BadRequestException('Invalid DOI or article ID');
    return this.articleService.findArticlesBySimilarDOI(doi, excludeId);
  }
  @Delete('/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async deleteArticle(@Param('id') id: string) {
    const article = await this.articleService.delete(id);
    if (!article) throw new NotFoundException('Article not found');
    return { message: 'Article deleted successfully' };
  }
}
