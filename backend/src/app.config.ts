import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Article, ArticleDocument } from './api/article/article.schema';

export function configureApp(app: INestApplication) {
  const origins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(v => v.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
}

export async function verifyArticleIndexes(app: INestApplication) {
  const model = app.get<Model<ArticleDocument>>(getModelToken(Article.name));
  await model.init();
  const indexes = await model.collection.indexes();
  const isDoi = (index: any) => index.key.doi === 1 && Object.keys(index.key).length === 1;
  if (indexes.some(index => isDoi(index) && index.unique && !index.partialFilterExpression)) {
    throw new Error('Legacy unique DOI index detected. Stop writers and run the documented DOI migration.');
  }
  if (!indexes.some(index => isDoi(index) && index.unique && index.partialFilterExpression?.status === 'Approved')) {
    throw new Error('Approved-only unique DOI index is missing. Run the documented DOI migration.');
  }
  if (!indexes.some(index => index.unique && index.key.customId === 1 && Object.keys(index.key).length === 1)) {
    throw new Error('Unique article ID index is missing.');
  }
}
