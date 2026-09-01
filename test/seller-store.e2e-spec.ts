import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Seller store management + ownership (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let sellerAToken: string;
  let sellerBToken: string;
  let customerToken: string;

  const register = async (email: string, name: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Test123!@#', name });
    return { token: res.body.accessToken, id: res.body.user.id };
  };

  const applyAndApprove = async (token: string, userId: string) => {
    await request(app.getHttpServer())
      .post('/api/v1/sellers/apply')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const seller = await prisma.seller.findUniqueOrThrow({
      where: { userId },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/sellers/${seller.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await prisma.store.deleteMany({
      where: { seller: { user: { email: { contains: 'seller-store-e2e' } } } },
    });
    await prisma.seller.deleteMany({
      where: { user: { email: { contains: 'seller-store-e2e' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'seller-store-e2e' } },
    });

    const admin = await register('admin-seller-store-e2e@example.com', 'Admin');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    adminToken = admin.token;

    const customer = await register(
      'customer-seller-store-e2e@example.com',
      'Customer',
    );
    customerToken = customer.token;

    const sellerA = await register(
      'seller-a-seller-store-e2e@example.com',
      'Seller A',
    );
    sellerAToken = sellerA.token;
    await applyAndApprove(sellerAToken, sellerA.id);

    const sellerB = await register(
      'seller-b-seller-store-e2e@example.com',
      'Seller B',
    );
    sellerBToken = sellerB.token;
    await applyAndApprove(sellerBToken, sellerB.id);
  });

  afterAll(async () => {
    await prisma.store.deleteMany({
      where: { seller: { user: { email: { contains: 'seller-store-e2e' } } } },
    });
    await prisma.seller.deleteMany({
      where: { user: { email: { contains: 'seller-store-e2e' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'seller-store-e2e' } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('CUSTOMER não pode criar loja → 403', () => {
    return request(app.getHttpServer())
      .post('/api/v1/seller/store')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Loja Ilegal', slug: `loja-ilegal-${Date.now()}` })
      .expect(403);
  });

  it('SELLER pendente não pode criar loja → 403 (RolesGuard, role ainda é CUSTOMER)', async () => {
    const pending = await register(
      'seller-pending-seller-store-e2e@example.com',
      'Pending Seller',
    );
    await request(app.getHttpServer())
      .post('/api/v1/sellers/apply')
      .set('Authorization', `Bearer ${pending.token}`)
      .send({})
      .expect(201);

    return request(app.getHttpServer())
      .post('/api/v1/seller/store')
      .set('Authorization', `Bearer ${pending.token}`)
      .send({ name: 'Loja Pendente', slug: `loja-pendente-${Date.now()}` })
      .expect(403);
  });

  it('SELLER aprovado cria a própria loja → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ name: 'Loja A', slug: `loja-a-${Date.now()}` })
      .expect(201);

    expect(res.body.name).toBe('Loja A');
  });

  it('SELLER não pode criar uma segunda loja → 409', () => {
    return request(app.getHttpServer())
      .post('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ name: 'Segunda Loja A', slug: `segunda-loja-a-${Date.now()}` })
      .expect(409);
  });

  it('GET /seller/store retorna a própria loja, nunca a de outro vendedor', async () => {
    const resA = await request(app.getHttpServer())
      .get('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(resA.body.name).toBe('Loja A');

    await request(app.getHttpServer())
      .get('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .expect(404);
  });

  it('PATCH /seller/store de um vendedor nunca altera a loja de outro', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .send({ name: 'Loja B', slug: `loja-b-${Date.now()}` })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .send({ name: 'Loja B Atualizada' })
      .expect(200);

    const resA = await request(app.getHttpServer())
      .get('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(resA.body.name).toBe('Loja A');
  });

  it('não permite alterar campos administrativos da loja (sellerId, id, createdAt)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/seller/store')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ sellerId: 'outro-id', id: 'outro-id', createdAt: '2000-01-01' })
      .expect(400);

    const store = await prisma.store.findFirst({ where: { name: 'Loja A' } });
    expect(store).not.toBeNull();
  });

  it('sem autenticação → 401 em todas as rotas de loja', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/seller/store')
      .send({})
      .expect(401);
    await request(app.getHttpServer()).get('/api/v1/seller/store').expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/seller/store')
      .send({})
      .expect(401);
  });
});
