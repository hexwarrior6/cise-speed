import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ArticleService } from './article.service';
import { EmailService } from '../../services/email.service';

@Injectable()
export class NotificationWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(NotificationWorker.name);
  constructor(private articles: ArticleService, private email: EmailService) {}
  onApplicationBootstrap() {
    if (process.env.NOTIFICATION_WORKER_ENABLED === 'false' || !this.email.isConfigured()) return;
    this.timer = setInterval(() => void this.tick(), 10000);
    this.timer.unref();
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < 5; i++) if (!(await this.articles.processNextNotification())) break;
    } catch { this.logger.error('Notification queue processing failed'); }
    finally { this.running = false; }
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }
}
