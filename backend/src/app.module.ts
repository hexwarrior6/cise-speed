import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ArticleModule } from './api/article/article.module';
import { UserModule } from './api/user/user.module';
import { EmailModule } from './services/email.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (config: ConfigService) => {
      const uri = config.get<string>('DB_URI');
      if (!uri) throw new Error('DB_URI is required');
      return { uri, serverSelectionTimeoutMS: 10000 };
    } }),
    ArticleModule,
    UserModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
