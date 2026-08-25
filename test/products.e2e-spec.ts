import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Replica o setup relevante de main.ts (prefixo global + validação),
    // já que o bootstrap real só roda em bootstrap(), não no AppModule.
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

    // Clean database
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    // Create test user, then promote it to ADMIN directly via Prisma —
    // não existe (nem deve existir) um endpoint de auto-promoção na API,
    // então o teste precisa elevar o papel por fora, como um seed faria.
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'Test User',
      });

    authToken = registerResponse.body.accessToken;

    await prisma.user.update({
      where: { id: registerResponse.body.user.id },
      data: { role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('/api/v1/products (GET)', () => {
    it('should return empty array initially', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200)
        .expect([]);
    });

    it('should return products with pagination', async () => {
      // Create test category
      const category = await prisma.category.create({
        data: {
          name: 'Electronics',
          slug: 'electronics',
        },
      });

      // Create test products
      await prisma.product.createMany({
        data: [
          {
            name: 'Product 1',
            slug: 'product-1',
            description: 'Description 1',
            price: 100,
            categoryId: category.id,
            stock: 10,
          },
          {
            name: 'Product 2',
            slug: 'product-2',
            description: 'Description 2',
            price: 200,
            categoryId: category.id,
            stock: 20,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/products?page=1&limit=10')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });
  });

  describe('/api/v1/products/:id (GET)', () => {
    it('should return a product by id', async () => {
      const product = await prisma.product.findFirst();

      if (!product) throw new Error('Product not found');

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}`)
        .expect(200);

      expect(response.body.id).toBe(product.id);
      expect(response.body.name).toBe(product.name);
    });

    it('should return 404 for non-existent product', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products/non-existent-id')
        .expect(404);
    });
  });

  describe('/api/v1/products (POST)', () => {
    it('should create a new product', async () => {
      const category = await prisma.category.findFirst();

      if (!category) throw new Error('Category not found');

      const response = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Product',
          slug: 'new-product',
          description: 'New Description',
          price: 300,
          categoryId: category.id,
          stock: 30,
        })
        .expect(201);

      expect(response.body.name).toBe('New Product');
      expect(response.body.price).toBe(300);
    });

    it('should fail without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/products')
        .send({
          name: 'Unauthorized Product',
        })
        .expect(401);
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Product',
          // Missing required fields
        })
        .expect(400);
    });
  });

  describe('/api/v1/products/:id (PATCH)', () => {
    it('should update a product', async () => {
      const product = await prisma.product.findFirst();

      if (!product) throw new Error('Product not found');

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Product',
          price: 999,
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Product');
      expect(response.body.price).toBe(999);
    });
  });

  describe('/api/v1/products/:id (DELETE)', () => {
    it('should delete a product', async () => {
      const product = await prisma.product.findFirst();

      if (!product) throw new Error('Product not found');

      await request(app.getHttpServer())
        .delete(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const deletedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });

      expect(deletedProduct).toBeNull();
    });
  });
});
