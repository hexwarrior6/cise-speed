// article.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ArticleController } from './article.controller';
import { ArticleService } from './article.service';
import { NotificationWorker } from './notification.worker';
import { Article, ArticleSchema } from './article.schema';
import { EmailModule } from '../../services/email.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Article.name, schema: ArticleSchema }]),
    ConfigModule,
    UserModule,
    EmailModule,
  ],
  controllers: [ArticleController],
  providers: [ArticleService, NotificationWorker],
})
export class ArticleModule {}
