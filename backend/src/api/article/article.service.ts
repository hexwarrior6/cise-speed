// article.service.ts
import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Article, ArticleDocument, ArticleStatus } from './article.schema';
import { CreateArticleDto, ReviewArticleDto } from './create-article.dto';
import { EmailService } from '../../services/email.service';
import { randomUUID } from 'node:crypto';
import { normalizeDoi, escapeRegex } from './doi';

@Injectable()
export class ArticleService {
  constructor(
    @InjectModel(Article.name) private articleModel: Model<ArticleDocument>,
    private emailService: EmailService,
  ) {}

  async findAll(status?: ArticleStatus): Promise<Article[]> {
    const query = status ? { status } : { status: ArticleStatus.APPROVED };
    return this.articleModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Article> {
    const article = await this.articleModel.findOne({ customId: id }).exec();
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  async addRating(articleId: string, userId: string, rating: number) {
    // 验证评分值
    if (rating < 0.5 || rating > 5 || (rating * 2) % 1 !== 0) {
      throw new BadRequestException(
        'Rating must be between 0.5 and 5 with 0.5 step',
      );
    }

    const article = await this.articleModel.findOne({ customId: articleId });
    if (!article || article.status !== ArticleStatus.APPROVED) {
      throw new NotFoundException('Article not found');
    }

    // 查找用户是否已评分
    const existingRatingIndex = article.ratings.findIndex(
      (r) => r.userId === userId,
    );
    if (existingRatingIndex >= 0) {
      // 更新现有评分
      article.ratings[existingRatingIndex].rating = rating;
    } else {
      // 添加新评分
      article.ratings.push({
        userId,
        rating,
      });
    }

    // 计算新的平均评分
    const totalRating = article.ratings.reduce((sum, r) => sum + r.rating, 0);
    article.averageRating =
      Math.round((totalRating / article.ratings.length) * 10) / 10; // 保留一位小数

    return article.save();
  }

  async checkDuplicateByDOI(doi: string): Promise<boolean> {
    return !!(await this.getDuplicateByDOI(doi));
  }

  async getDuplicateByDOI(doi: string): Promise<Article | null> {
    return this.articleModel.findOne({ doi: normalizeDoi(doi), status: { $ne: ArticleStatus.REJECTED } }).sort({ createdAt: 1 }).exec();
  }

  async findArticlesBySimilarDOI(doi: string, excludeId?: string): Promise<Article[]> {
    const query: any = { doi: normalizeDoi(doi), status: { $ne: ArticleStatus.REJECTED } };
    if (excludeId) query.customId = { $ne: excludeId };
    return this.articleModel.find(query).sort({ createdAt: 1 }).exec();
  }

  async submitArticle(dto: CreateArticleDto): Promise<Article> {
    const customId = dto.customId?.trim() || randomUUID();
    const doi = normalizeDoi(dto.doi);
    const duplicate = await this.getDuplicateByDOI(doi);
    const { useEmailForNotification, ...fields } = dto;
    try {
      return await this.articleModel.create({
        ...fields, customId, doi,
        status: ArticleStatus.PENDING,
        isDuplicate: !!duplicate && duplicate.customId !== customId,
        duplicateOf: duplicate && duplicate.customId !== customId ? duplicate.customId : undefined,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new HttpException('Article ID already exists, or the legacy DOI index must be migrated', HttpStatus.CONFLICT);
      throw error;
    }
  }

  async update(id: string, dto: CreateArticleDto) {
    const doi = normalizeDoi(dto.doi);
    // A published article's DOI is its stable identity; changes require a new submission.
    const article = await this.articleModel.findOne({ customId: id }).exec();
    if (!article) return null;
    if (normalizeDoi(article.doi) !== doi) throw new BadRequestException('Changing DOI requires a new submission');
    return this.articleModel.findOneAndUpdate({ customId: id }, { ...dto, doi }, { new: true, runValidators: true }).exec();
  }

  async reviewArticle(id: string, reviewData: ReviewArticleDto, reviewerId: string): Promise<Article> {
    if (![ArticleStatus.APPROVED, ArticleStatus.REJECTED].includes(reviewData.status as ArticleStatus)) throw new BadRequestException('Invalid review status');
    const article = await this.articleModel.findOne({ customId: id }).exec();
    if (!article) throw new NotFoundException('Article not found');
    if (article.status !== ArticleStatus.PENDING) throw new HttpException('Article already reviewed', HttpStatus.CONFLICT);
    const updateData: Record<string, unknown> = {
      status: reviewData.status, reviewerId,
      reviewComment: reviewData.reviewComment?.trim() || '',
      isDuplicate: !!reviewData.isDuplicate,
      notificationStatus: article.submitterEmail ? 'Pending' : 'Skipped',
      notificationAttempts: 0,
      notificationNextAttempt: new Date(),
    };
    if (reviewData.isDuplicate) {
      if (reviewData.duplicateOf === id) throw new BadRequestException('Cannot mark article as duplicate of itself');
      if (!reviewData.duplicateOf) throw new BadRequestException('Select the original article');
      const original = await this.articleModel.findOne({ customId: reviewData.duplicateOf, status: ArticleStatus.APPROVED }).exec();
      if (!original || original.isDuplicate || normalizeDoi(original.doi) !== normalizeDoi(article.doi)) throw new BadRequestException('Duplicate must reference an approved original with the same DOI');
      if (reviewData.status !== ArticleStatus.REJECTED) throw new BadRequestException('Duplicate submissions must be rejected');
      updateData.duplicateOf = original.customId;
    }
    const doi = normalizeDoi(article.doi);
    if (reviewData.status === ArticleStatus.APPROVED) {
      const existing = await this.articleModel.findOne({ doi, status: ArticleStatus.APPROVED, customId: { $ne: id } }).exec();
      if (existing) throw new HttpException('An approved article already uses this DOI', HttpStatus.CONFLICT);
    }
    let updatedArticle;
    try {
      updatedArticle = await this.articleModel.findOneAndUpdate(
        { customId: id, status: ArticleStatus.PENDING },
        { $set: { ...updateData, doi }, ...(!reviewData.isDuplicate ? { $unset: { duplicateOf: 1 } } : {}) },
        { new: true, runValidators: true },
      ).exec();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new HttpException('An approved article already uses this DOI', HttpStatus.CONFLICT);
      throw error;
    }
    if (!updatedArticle) throw new HttpException('Article already reviewed', HttpStatus.CONFLICT);
    return updatedArticle;
  }

  // A persistent outbox on each reviewed article. Claim before sending so multiple
  // workers cannot send the same pending notification concurrently.
  async processNextNotification(): Promise<boolean> {
    const now = new Date();
    const claimed = await this.articleModel.findOneAndUpdate(
      { status: { $in: [ArticleStatus.APPROVED, ArticleStatus.REJECTED] },
        submitterEmail: { $exists: true, $nin: ['', null] },
        notificationStatus: { $in: ['Pending', 'Failed'] },
        notificationAttempts: { $lt: 3 }, notificationNextAttempt: { $lte: now } },
      { $set: { notificationStatus: 'Sending', notificationClaimedAt: now }, $inc: { notificationAttempts: 1 } },
      { new: true, sort: { notificationNextAttempt: 1 } },
    ).exec();
    if (!claimed) return false;
    const sent = await this.sendReviewNotificationEmail(claimed);
    const attempts = claimed.notificationAttempts || 1;
    await this.articleModel.updateOne(
      { _id: claimed._id, notificationStatus: 'Sending', notificationClaimedAt: now },
      { $set: { notificationStatus: sent ? 'Sent' : 'Failed', notificationNextAttempt: new Date(Date.now() + attempts * 60000) }, $unset: { notificationClaimedAt: 1 } },
    ).exec();
    return true;
  }

  async retryNotification(id: string): Promise<void> {
    const result = await this.articleModel.findOneAndUpdate(
      { customId: id, notificationStatus: { $in: ['Failed', 'Sending'] }, $or: [
        { notificationStatus: 'Failed' },
        { notificationStatus: 'Sending', notificationClaimedAt: { $lt: new Date(Date.now() - 15 * 60000) } },
      ] },
      { $set: { notificationStatus: 'Pending', notificationAttempts: 0, notificationNextAttempt: new Date() }, $unset: { notificationClaimedAt: 1 } },
    ).exec();
    if (!result) throw new HttpException('Notification is not eligible for retry', HttpStatus.CONFLICT);
  }

  async listNotificationIssues() {
    return this.articleModel.find({ notificationStatus: { $in: ['Failed', 'Sending'] } })
      .select('customId title status notificationStatus notificationAttempts notificationClaimedAt')
      .sort({ updatedAt: -1 }).limit(100).exec();
  }

  private async sendReviewNotificationEmail(article: Article): Promise<boolean> {
    const escapeHtml = (value: string) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

    if (!article.submitterEmail) {
      console.warn(
        `No submitter email found for article ${article.customId} - article.service.ts:228`,
      );
      return false;
    }

    let subject = '';
    let htmlContent = '';

    if (article.status === ArticleStatus.APPROVED) {
      subject = 'Your Article Has Been Approved - CISE_SPEED';
      htmlContent = `
        <h2>Article Review Result Notification</h2>
        <p>Hello,</p>
        <p>Your article <strong>"${escapeHtml(article.title)}"</strong> has been approved and added to the database.</p>
        <p><strong>Article Details:</strong></p>
        <ul>
          <li>Title: ${escapeHtml(article.title)}</li>
          <li>ID: ${escapeHtml(article.customId)}</li>
          <li>Authors: ${escapeHtml(article.authors)}</li>
          <li>Publication Year: ${escapeHtml(article.pubyear)}</li>
          <li>Evidence Type: ${escapeHtml(article.evidence)}</li>
        </ul>
        <p>Thank you for contributing to the CISE_SPEED database!</p>
        <p>If you have any questions, please feel free to contact us.</p>
      `;
    } else if (article.status === ArticleStatus.REJECTED) {
      subject = 'Article Review Result - CISE_SPEED';
      htmlContent = `
        <h2>Article Review Result Notification</h2>
        <p>Hello,</p>
        <p>Unfortunately, your article <strong>"${escapeHtml(article.title)}"</strong> did not pass the review.</p>

        ${article.reviewComment ? `<p><strong>Review Comment:</strong> ${escapeHtml(article.reviewComment || '')}</p>` : ''}

        <p><strong>Article Details:</strong></p>
        <ul>
          <li>Title: ${escapeHtml(article.title)}</li>
          <li>ID: ${escapeHtml(article.customId)}</li>
          <li>Authors: ${escapeHtml(article.authors)}</li>
          <li>Publication Year: ${escapeHtml(article.pubyear)}</li>
        </ul>
        <p>Thank you for your interest and contribution to the CISE_SPEED database!</p>
        <p>If you have any questions, please feel free to contact us.</p>
      `;
    } else {
      console.log(
        `Article ${escapeHtml(article.customId)} status changed to ${article.status}, no email notification required.`,
      );
      return false;
    }

    console.log(
      `Attempting to send email to ${article.submitterEmail} with subject: ${subject}`,
    );

    try {
      const result = await this.emailService.sendMail(
        article.submitterEmail,
        subject,
        htmlContent,
        `CISE_SPEED: Your article "${article.title}" has been reviewed`,
        'CISE_SPEED System',
      );

      if (result) {
        console.log(
          `Notification email sent successfully to ${article.submitterEmail} for article ${article.customId}`,
        );
      } else {
        console.error(
          `Failed to send notification email to ${article.submitterEmail} for article ${article.customId}`,
        );
      }
      return result;
    } catch (error) {
      console.error(
        `Error sending notification email to ${article.submitterEmail} for article ${article.customId}:`,
        error,
      );
      return false;
    }
  }

  async searchArticles(
    keywords: string,
    evidenceType?: string,
    sortBy: string = 'createdAt',
    sortDirection: 'asc' | 'desc' = 'desc',
    pubYearFrom?: string,
    pubYearTo?: string,
    authors?: string,
    status?: ArticleStatus,
    source?: string,
  ): Promise<Article[]> {
    const query: any = {
      status: ArticleStatus.APPROVED,
    };

    if (keywords) {
      const keywordRegex = new RegExp(escapeRegex(keywords), 'i');
      query.$or = [
        { title: keywordRegex },
        { authors: keywordRegex },
        { claim: keywordRegex },
        { source: keywordRegex },
        { doi: keywordRegex },
      ];
    }

    if (evidenceType) {
      query.evidence = evidenceType;
    }

    if (pubYearFrom || pubYearTo) {
      query.pubyear = {};
      if (pubYearFrom) {
        const fromYear = parseInt(pubYearFrom, 10);
        if (!isNaN(fromYear)) {
          query.pubyear.$gte = pubYearFrom;
        }
      }
      if (pubYearTo) {
        const toYear = parseInt(pubYearTo, 10);
        if (!isNaN(toYear)) {
          query.pubyear.$lte = pubYearTo;
        }
      }
    }

    if (authors) {
      query.authors = new RegExp(escapeRegex(authors), 'i');
    }

    if (status) {
      query.status = status;
    }

    if (source) {
      query.source = new RegExp(escapeRegex(source), 'i');
    }

    const sortObject: any = {};
    const allowedSortFields = [
      'createdAt',
      'title',
      'pubyear',
      'authors',
      'source',
      'averageRating',
    ];
    if (allowedSortFields.includes(sortBy)) {
      sortObject[sortBy] = sortDirection;
    } else {
      sortObject['createdAt'] = 'desc';
    }

    return this.articleModel.find(query).sort(sortObject).exec();
  }

  async delete(id: string) {
    return this.articleModel.findOneAndDelete({ customId: id }).exec();
  }
}
