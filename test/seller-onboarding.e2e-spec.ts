import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Seller onboarding + RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let customerToken: string;
  let customerId: string;
  let adminToken: string;

  const register = async (email: string, name: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Test123!@#', name });
    return { token: res.body.accessToken, id: res.body.user.id };
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
    await prisma.seller.deleteMany({
      where: { user: { email: { contains: 'seller-onb-e2e' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'seller-onb-e2e' } },
    });

    const customer = await register(
      'customer-seller-onb-e2e@example.com',
      'Customer',
    );
    customerToken = customer.token;
    customerId = customer.id;

    const admin = await register('admin-seller-onb-e2e@example.com', 'Admin');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });
    adminToken = admin.token;
  });

  afterAll(async () => {
    await prisma.seller.deleteMany({
      where: { user: { email: { contains: 'seller-onb-e2e' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'seller-onb-e2e' } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/sellers/apply', () => {
    it('CUSTOMER autenticado solicita ser vendedor → 201 PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sellers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ document: '12345678900', phone: '11999999999' })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.userId).toBe(customerId);
    });

    it('reaplicação enquanto PENDING → 409', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sellers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({})
        .expect(409);
    });

    it('sem autenticação → 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/sellers/apply')
        .send({})
        .expect(401);
    });

    it('rejeita campos administrativos enviados pelo cliente (status, userId, role)', async () => {
      const other = await register(
        'mass-assign-seller-onb-e2e@example.com',
        'Mass Assign',
      );

      await request(app.getHttpServer())
        .post('/api/v1/sellers/apply')
        .set('Authorization', `Bearer ${other.token}`)
        .send({ status: 'APPROVED', userId: customerId, role: 'ADMIN' })
        .expect(400);

      const seller = await prisma.seller.findUnique({
        where: { userId: other.id },
      });
      expect(seller).toBeNull();
    });
  });

  describe('RBAC de /api/v1/admin/sellers', () => {
    it('CUSTOMER não acessa endpoints admin → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/sellers')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch('/api/v1/admin/sellers/any-id/approve')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('sem autenticação → 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/sellers')
        .expect(401);
    });

    it('ADMIN lista solicitações e filtra por status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/sellers?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.every((s: any) => s.status === 'PENDING')).toBe(
        true,
      );
      expect(res.body.meta).toBeDefined();
    });

    it('ADMIN aprova Seller inexistente → 404', () => {
      return request(app.getHttpServer())
        .patch(
          '/api/v1/admin/sellers/00000000-0000-0000-0000-000000000000/approve',
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Ciclo de vida: aprovar', () => {
    it('ADMIN aprova o Seller PENDING → 200, status APPROVED, User.role vira SELLER', async () => {
      const seller = await prisma.seller.findUnique({
        where: { userId: customerId },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/sellers/${seller!.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('APPROVED');

      const user = await prisma.user.findUnique({ where: { id: customerId } });
      expect(user!.role).toBe('SELLER');
    });

    it('aprovar de novo (já APPROVED) → 409', async () => {
      const seller = await prisma.seller.findUnique({
        where: { userId: customerId },
      });

      return request(app.getHttpServer())
        .patch(`/api/v1/admin/sellers/${seller!.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });

  describe('Ciclo de vida: rejeitar', () => {
    it('ADMIN rejeita um Seller PENDING → status REJECTED, role não muda', async () => {
      const applicant = await register(
        'reject-seller-onb-e2e@example.com',
        'Reject Me',
      );
      await request(app.getHttpServer())
        .post('/api/v1/sellers/apply')
        .set('Authorization', `Bearer ${applicant.token}`)
        .send({})
        .expect(201);

      const seller = await prisma.seller.findUnique({
        where: { userId: applicant.id },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/sellers/${seller!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('REJECTED');

      const user = await prisma.user.findUnique({
        where: { id: applicant.id },
      });
      expect(user!.role).toBe('CUSTOMER');
    });
  });

  describe('Ciclo de vida: suspender', () => {
    it('ADMIN suspende um Seller APPROVED → SUSPENDED, User.role volta a CUSTOMER', async () => {
      const seller = await prisma.seller.findUnique({
        where: { userId: customerId },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/sellers/${seller!.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('SUSPENDED');

      const user = await prisma.user.findUnique({ where: { id: customerId } });
      expect(user!.role).toBe('CUSTOMER');
    });

    it('Seller SUSPENDED tenta administrar Store → 403 (RolesGuard, role revertido a CUSTOMER)', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/seller/store')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Tentativa pós-suspensão' })
        .expect(403);
    });

    it('suspender de novo (já SUSPENDED) → 409', async () => {
      const seller = await prisma.seller.findUnique({
        where: { userId: customerId },
      });

      return request(app.getHttpServer())
        .patch(`/api/v1/admin/sellers/${seller!.id}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });

  describe('getApprovedSellerByUserId independent check', () => {
    it('role SELLER sem Seller APPROVED (ex: setado manualmente) ainda é bloqueado por getApprovedSellerByUserId → 403', async () => {
      const user = await register(
        'seller-manual-role-seller-onb-e2e@example.com',
        'Manual Role User',
      );

      // Apply to create a Seller with status PENDING
      await request(app.getHttpServer())
        .post('/api/v1/sellers/apply')
        .set('Authorization', `Bearer ${user.token}`)
        .send({})
        .expect(201);

      // Manually set User.role to SELLER (simulating admin doing this via PATCH /admin/users/:id/role)
      // The Seller remains PENDING, not APPROVED
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'SELLER' },
      });

      // Now the user has role=SELLER but Seller.status=PENDING
      // RolesGuard will pass (role is SELLER), but getApprovedSellerByUserId should block with 403
      return request(app.getHttpServer())
        .post('/api/v1/seller/store')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Loja Bloqueada', slug: `loja-bloqueada-${Date.now()}` })
        .expect(403);
    });
  });
});
