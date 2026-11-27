import { ValidationPipe } from '@nestjs/common';
import { CreateArticleDto } from './create-article.dto';
import { EvidenceType } from './article.schema';

describe('CreateArticleDto request validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metadata = { type: 'body' as const, metatype: CreateArticleDto };
  const payload = { title: 'Empirical study', authors: 'Alice; Bob', source: 'Journal', pubyear: '2024', doi: 'https://doi.org/10.1000/TEST', claim: 'Empirical evidence supports the claim', evidence: EvidenceType.NEUTRAL };
  it('accepts a normal request with notification opt-out', async () => {
    await expect(pipe.transform({ ...payload, useEmailForNotification: false }, metadata)).resolves.toMatchObject({ ...payload, useEmailForNotification: false });
  });
  it('accepts omitted optional values', async () => {
    await expect(pipe.transform(payload, metadata)).resolves.toMatchObject(payload);
  });
  it.each(['submitterId', 'submitterEmail', 'reviewerId', 'status'])('rejects server-owned %s', async field => {
    await expect(pipe.transform({ ...payload, [field]: 'forged' }, metadata)).rejects.toMatchObject({ response: expect.objectContaining({ message: expect.arrayContaining([expect.stringContaining(field)]) }) });
  });
});
