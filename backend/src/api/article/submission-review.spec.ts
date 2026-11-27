import { ArticleService } from './article.service';
import { ArticleStatus, EvidenceType } from './article.schema';
import { normalizeDoi } from './doi';
const dto = { title:'Study', authors:'Author', source:'Journal', pubyear:'2024', doi:'https://doi.org/10.1000/TEST', claim:'Evidence claim', evidence:EvidenceType.NEUTRAL };
describe('Submission and moderation', () => {
  const model: any = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn() };
  const email: any = { sendMail: jest.fn() };
  const service = new ArticleService(model, email);
  const query = (value: any) => ({ exec: jest.fn().mockResolvedValue(value), sort: jest.fn().mockReturnThis() });
  beforeEach(() => jest.clearAllMocks());
  it('normalizes DOI', () => expect(normalizeDoi(dto.doi)).toBe('10.1000/test'));
  it('keeps a duplicate submission pending with a new ID', async () => {
    model.findOne.mockReturnValue(query({ customId:'original' }));
    model.create.mockImplementation(async value => value);
    const result = await service.submitArticle(dto);
    expect(result).toMatchObject({ doi:'10.1000/test', status:ArticleStatus.PENDING, isDuplicate:true, duplicateOf:'original' });
    expect(result.customId).not.toBe('original');
  });
  it('rejects a repeated review', async () => {
    model.findOne.mockReturnValue(query({ status:ArticleStatus.APPROVED }));
    await expect(service.reviewArticle('1', { status:'Rejected' }, 'reviewer')).rejects.toThrow('Article already reviewed');
  });
  it('rejects a self-reference', async () => {
    model.findOne.mockReturnValue(query({ customId:'1', status:ArticleStatus.PENDING, doi:'10.1000/test' }));
    await expect(service.reviewArticle('1', { status:'Rejected', isDuplicate:true, duplicateOf:'1' }, 'reviewer')).rejects.toThrow('Cannot mark article as duplicate of itself');
  });
  it('clears stale duplicate references atomically', async () => {
    model.findOne.mockReturnValue(query({ customId:'1', status:ArticleStatus.PENDING, doi:'10.1000/test' }));
    model.findOneAndUpdate.mockReturnValue(query({ customId:'1', status:ArticleStatus.REJECTED }));
    await service.reviewArticle('1', { status:'Rejected', isDuplicate:false }, 'reviewer');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ customId:'1', status:ArticleStatus.PENDING }, expect.objectContaining({ $unset:{ duplicateOf:1 } }), expect.anything());
  });
});
