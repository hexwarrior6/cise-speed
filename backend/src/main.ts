import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, verifyArticleIndexes } from './app.config';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  try {
    configureApp(app);
    await app.init();
    await verifyArticleIndexes(app);
    app.enableShutdownHooks();
    const port = process.env.PORT || 8082;
    await app.listen(port, () => console.log('Server running on port ' + port));
  } catch (error) {
    await app.close();
    throw error;
  }
}
bootstrap().catch(error => { console.error(error); process.exitCode = 1; });
