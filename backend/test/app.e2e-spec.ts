import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import mongoose, { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { configureApp, verifyArticleIndexes } from '../src/app.config';
import { Article, ArticleStatus, EvidenceType } from '../src/api/article/article.schema';
import { User, UserRole } from '../src/api/user/user.schema';
import { EmailService } from '../src/services/email.service';
const { migrateDoiIndexes } = require('../scripts/migrate-doi-index');

jest.setTimeout(60000);
describe('SPEED authentication and moderation (MongoDB integration)', () => {
  let app: INestApplication;
  let users: Model<User>;
  let articles: Model<Article>;
  const email = { sendMail: jest.fn().mockResolvedValue(false), isConfigured: () => false };
  const credentials = { username: 'submitter', email: 'submitter@example.com', password: 'test-password-123' };
  const article = { title:'Empirical study', authors:'Alice; Bob', source:'Journal', pubyear:'2024', doi:'https://doi.org/10.1000/TEST', claim:'Empirical evidence supports the claim', evidence:EvidenceType.NEUTRAL };
  const http = () => request(app.getHttpServer());
  const token = (value: string) => 'Bearer ' + value;
  const login = async (email: string) => (await http().post('/api/users/login').send({email,password:credentials.password}).expect(201)).body.access_token as string;
  let submitter: string, moderator: string, admin: string;

  beforeAll(async () => {
    // Never run destructive fixture cleanup against a configured production DB.
    if (!process.env.DB_URI || !/\/cise_speed_test(?:\?|$)/.test(process.env.DB_URI)) throw new Error('Use a disposable cise_speed_test database for e2e tests');
    const connection = await mongoose.createConnection(process.env.DB_URI).asPromise();
    try {
      await connection.dropDatabase();
      const collection = connection.collection('articles');
      await collection.createIndex({doi:1}, {unique:true});
      await collection.insertOne({customId:'legacy',doi:'https://doi.org/10.1000/LEGACY',status:'Approved'});
      await migrateDoiIndexes(collection);
      await migrateDoiIndexes(collection); // idempotence
      expect((await collection.findOne({customId:'legacy'}))?.doi).toBe('10.1000/legacy');
      const indexes = await collection.indexes();
      expect(indexes.some((i:any) => i.name === 'approved_doi_unique' && i.unique)).toBe(true);
      expect(indexes.some((i:any) => i.name === 'doi_1' && i.unique)).toBe(false);
      await collection.deleteMany({});
    } finally { await connection.close(); }
    const module = await Test.createTestingModule({imports:[AppModule]}).overrideProvider(EmailService).useValue(email).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    await verifyArticleIndexes(app);
    users = app.get(getModelToken(User.name));
    articles = app.get(getModelToken(Article.name));
    await users.init();
    const registration = await http().post('/api/users/register').send({...credentials,role:UserRole.ADMINISTRATOR}).expect(201);
    expect(registration.body.user.role).toBe(UserRole.SUBMITTER);
    expect(registration.body.user.password).toBeUndefined();
    for (const role of [UserRole.MODERATOR,UserRole.ADMINISTRATOR]) {
      const address = role.toLowerCase() + '@example.com';
      await http().post('/api/users/register').send({...credentials,username:role,email:address}).expect(201);
      await users.updateOne({email:address},{$set:{role}});
    }
    submitter = await login(credentials.email);
    moderator = await login('moderator@example.com');
    admin = await login('administrator@example.com');
  });

  afterAll(async () => { if (app) await app.close(); });

  it('enforces authentication, current roles and user response privacy', async () => {
    await http().get('/api/users/me').expect(401);
    await http().get('/api/users/me').set('Authorization',token(submitter)).expect(200);
    await http().get('/api/users').set('Authorization',token(submitter)).expect(403);
    const list = await http().get('/api/users').set('Authorization',token(admin)).expect(200);
    expect(list.body.every((u:any) => !('password' in u))).toBe(true);
    const person = await users.findOne({email:'moderator@example.com'});
    await http().put('/api/users/'+person!._id+'/role').set('Authorization',token(admin)).send({role:UserRole.SEARCHER}).expect(200);
    await http().get('/api/articles/moderator/pending').set('Authorization',token(moderator)).expect(403);
    await users.updateOne({_id:person!._id},{$set:{role:UserRole.MODERATOR}});
    await http().get('/api/articles/moderator/pending').set('Authorization',token(moderator)).expect(200);
    await http().post('/email/send').send({}).expect(404);
  });

  it('normalizes duplicate submissions, protects private fields, and atomically publishes only one original', async () => {
    await http().post('/api/articles/submit').send(article).expect(401);
    await http().post('/api/articles/submit').set('Authorization',token(moderator)).send(article).expect(403);
    await http().post('/api/articles/submit').set('Authorization',token(submitter)).send({...article,submitterEmail:'forged@example.com'}).expect(400);
    const first = await http().post('/api/articles/submit').set('Authorization',token(submitter)).send({...article,useEmailForNotification:false}).expect(201);
    const second = await http().post('/api/articles/submit').set('Authorization',token(submitter)).send({...article,doi:'10.1000/test'}).expect(201);
    const a = first.body.article, b = second.body.article;
    expect(a.customId).not.toBe(b.customId);
    expect(a.submitterEmail).toBeUndefined();
    expect(b.submitterEmail).toBe(credentials.email);
    expect(b.isDuplicate).toBe(true);
    await http().get('/api/articles/'+a.customId).expect(404);
    await http().get('/api/articles?status=Pending').expect(403);
    await http().get('/api/articles/search/advanced?status=Rejected').expect(403);
    await http().delete('/api/articles/'+a.customId).expect(401);
    await http().post('/api/articles/'+a.customId+'/review').set('Authorization',token(submitter)).send({status:'Approved'}).expect(403);
    const results = await Promise.all([a,b].map(row => http().post('/api/articles/'+row.customId+'/review').set('Authorization',token(moderator)).send({status:'Approved'})));
    expect(results.map(res=>res.status).sort()).toEqual([201,409]);
    const approved = await articles.findOne({doi:'10.1000/test',status:ArticleStatus.APPROVED});
    const pending = await articles.findOne({doi:'10.1000/test',status:ArticleStatus.PENDING});
    expect(approved).not.toBeNull(); expect(pending).not.toBeNull();
    await http().post('/api/articles/'+approved!.customId+'/review').set('Authorization',token(moderator)).send({status:'Rejected'}).expect(409);
    await http().post('/api/articles/'+pending!.customId+'/review').set('Authorization',token(moderator)).send({status:'Rejected',isDuplicate:true,duplicateOf:pending!.customId}).expect(400);
    await http().post('/api/articles/'+pending!.customId+'/review').set('Authorization',token(moderator)).send({status:'Rejected',isDuplicate:true,duplicateOf:approved!.customId,reviewComment:'Internal comment'}).expect(201);
    const pub = await http().get('/api/articles/'+approved!.customId).expect(200);
    for (const key of ['submitterId','submitterEmail','reviewerId','reviewComment','ratings','notificationStatus']) expect(pub.body[key]).toBeUndefined();
    const all = await http().get('/api/articles').expect(200);
    expect(all.body).toHaveLength(1);
    const service = app.get(require('../src/api/article/article.service').ArticleService) as import('../src/api/article/article.service').ArticleService;
    expect(await service.processNextNotification()).toBe(true);
    expect(email.sendMail).toHaveBeenCalledTimes(1);
    const failed = await articles.findOne({ notificationStatus: 'Failed' });
    expect(failed?.notificationAttempts).toBe(1);
    await http().post('/api/articles/'+failed!.customId+'/notification/retry').set('Authorization',token(submitter)).expect(403);
    await http().post('/api/articles/'+failed!.customId+'/notification/retry').set('Authorization',token(moderator)).expect(201);
    email.sendMail.mockResolvedValueOnce(true);
    expect(await service.processNextNotification()).toBe(true);
    expect((await articles.findOne({customId:failed!.customId}))?.notificationStatus).toBe('Sent');
  });
});
