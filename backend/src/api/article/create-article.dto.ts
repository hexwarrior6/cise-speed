import { IsBoolean, IsIn, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { EvidenceType } from './article.schema';
export class CreateArticleDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(100)
  customId?: string;
  @IsString() @Length(1, 500)
  title: string;
  @IsString() @Length(1, 2000)
  authors: string;
  @IsString() @Length(1, 500)
  source: string;
  @IsString() @Matches(/^\d{4}$/)
  pubyear: string;
  @IsString() @Length(1, 500)
  doi: string;
  @IsString() @Length(1, 10000)
  claim: string;
  @IsEnum(EvidenceType)
  evidence: EvidenceType;
  @IsOptional() @IsBoolean()
  useEmailForNotification?: boolean;
}

// Internal service input only: never instantiate or validate this as a request DTO.
export type ArticleSubmission = CreateArticleDto & {
  submitterId?: string;
  submitterEmail?: string;
};
export class ReviewArticleDto {
  @IsIn(['Approved', 'Rejected'])
  status: 'Approved' | 'Rejected';
  @IsOptional() @IsString() @MaxLength(4000)
  reviewComment?: string;
  @IsOptional() @IsBoolean()
  isDuplicate?: boolean;
  @IsOptional() @IsString() @MaxLength(100)
  duplicateOf?: string;
}
