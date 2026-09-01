import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Namespace desta suite dentro do Postgres compartilhado entre todos os
// arquivos .e2e-spec.ts no mesmo job de CI (ver docs/e2e-isolation.md).
// Nunca usar deleteMany() sem filtro aqui — outra suite pode ter usuários
// reais na mesma tabela no momento em que este arquivo roda (a ordem dos
// arquivos não é alfabética nem fixa).
const NS = 'users-e2e';
const USER_A_EMAIL = `user-a-${NS}@example.com`;
const USER_B_EMAIL = `user-b-${NS}@example.com`;

describe('Users / Profile / Avatar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;

  const cleanup = () =>
    prisma.user.deleteMany({ where: { email: { contains: NS } } });

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
    // Defensivo: limpa resíduo de uma execução anterior que tenha
    // crashado antes do próprio afterAll.
    await cleanup();

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: USER_A_EMAIL,
        password: 'Test123!@#',
        name: 'User A',
      });
    userAToken = registerA.body.accessToken;
    userAId = registerA.body.user.id;

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: USER_B_EMAIL,
        password: 'Test123!@#',
        name: 'User B',
      });
    userBToken = registerB.body.accessToken;
    userBId = registerB.body.user.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/users/me', () => {
    it('retorna o perfil do próprio usuário autenticado', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(response.body.id).toBe(userAId);
      expect(response.body.email).toBe(USER_A_EMAIL);
    });

    it('sem autenticação → 401', () => {
      return request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('atualiza o próprio nome', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'User A Atualizado' })
        .expect(200);

      expect(response.body.name).toBe('User A Atualizado');
      expect(response.body.id).toBe(userAId);
    });

    it('sem autenticação → 401', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ name: 'Hacker' })
        .expect(401);
    });

    // O usuário nunca envia o próprio ID no corpo — ele vem do token. Um
    // corpo malicioso tentando mirar outro usuário simplesmente não tem
    // como fazer isso: não existe :id na rota, e campos fora do DTO
    // (whitelist) são rejeitados pelo ValidationPipe global.
    it('usuário A não consegue alterar o perfil do usuário B', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ name: 'Tentativa de Invasão', id: userBId, userId: userBId })
        .expect(400); // forbidNonWhitelisted rejeita os campos id/userId

      const userB = await prisma.user.findUnique({ where: { id: userBId } });
      expect(userB?.name).toBe('User B');
    });

    it('não permite alterar campos sensíveis (role) via este endpoint', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ role: 'ADMIN' })
        .expect(400);

      const userA = await prisma.user.findUnique({ where: { id: userAId } });
      expect(userA?.role).toBe('CUSTOMER');
    });
  });

  describe('Upload de avatar (POST /api/v1/upload/avatar + PATCH /api/v1/users/me)', () => {
    it('sem autenticação → 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/upload/avatar')
        .expect(401);
    });

    it('persiste a URL do avatar no próprio perfil após o upload', async () => {
      // Simula o fluxo do frontend: upload retorna uma URL, depois o
      // cliente persiste essa URL no perfil via PATCH /users/me.
      const fakeAvatarUrl = 'https://res.cloudinary.com/demo/avatar-fake.png';

      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ avatar: fakeAvatarUrl })
        .expect(200);

      expect(response.body.avatar).toBe(fakeAvatarUrl);

      const userB = await prisma.user.findUnique({ where: { id: userBId } });
      expect(userB?.avatar).toBe(fakeAvatarUrl);

      // E o usuário A continua sem avatar — a alteração não vazou.
      const userA = await prisma.user.findUnique({ where: { id: userAId } });
      expect(userA?.avatar).toBeNull();
    });
  });
});
