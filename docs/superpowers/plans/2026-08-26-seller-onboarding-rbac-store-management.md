# Seller Onboarding + RBAC + Store Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated CUSTOMER apply to become a Seller, let an ADMIN approve/reject/suspend that application, and let an APPROVED Seller manage exactly one Store of their own — all enforced by real HTTP-level RBAC and covered by automated tests, with zero schema changes.

**Architecture:** Two new NestJS modules reusing 100% of the existing auth stack: `SellersModule` (onboarding endpoint + seller/store ownership endpoints) and a new `AdminSellersController` slotted into the existing `AdminModule` (list/approve/reject/suspend). Authorization is done entirely with the existing `JwtAuthGuard` + `RolesGuard` + `@Roles(...)` mechanism — no new guard type. Approving/suspending a Seller flips `User.role` between `CUSTOMER` and `SELLER` inside a Prisma transaction, which is safe because `JwtStrategy.validate()` re-reads `role` from the DB on every request (never trusts the JWT payload's role claim), so the change takes effect immediately without forcing a re-login.

**Tech Stack:** NestJS 11, Prisma 6 (PostgreSQL), class-validator, Jest + Supertest (e2e), all already in `backend/package.json` — no new dependencies.

**Spec:** No separate spec file exists — the full spec was provided inline by the user in this conversation (section markers 1–21, "TECHMART — FASE 1.2 — SELLER ONBOARDING + RBAC + STORE MANAGEMENT"). See "Contexto e decisões de design" below for how this plan resolves each open question the spec raised.

## Global Constraints

- Fonte oficial do projeto: WSL `~/techmart` (repo git real vive em `~/techmart/backend`, branch `master`). NÃO sincronizar com a cópia Windows em `C:\Users\jrmon\techmart`.
- Ponto de partida confirmado nesta análise: commit `b908df0` "Fase 1.1: fundação do marketplace (Seller, Store, SubOrder)", `git status` limpo exceto `package-lock.json` modificado (pré-existente, não relacionado a esta fase).
- NÃO criar uma segunda implementação de autenticação/RBAC. Reaproveitar sempre: `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, o `ValidationPipe` global (`whitelist: true, forbidNonWhitelisted: true`), `PrismaService`.
- NENHUM DTO aceita `status`, `userId`, `sellerId`, `role`, `approvedBy`, `id`, `createdAt` vindo do cliente — identidade e ownership vêm sempre de `req.user` (JWT) ou de uma linha já resolvida no banco, nunca do body/params do cliente.
- NÃO criar migration nesta fase — `Seller`, `Store`, `SellerStatus`, `UserRole.SELLER` já existem desde a Fase 1.1 e cobrem tudo que a Fase 1.2 precisa.
- NÃO implementar: painel frontend completo do Seller, catálogo do vendedor, criação de produtos pelo Seller, checkout multi-vendedor, split payment, comissão, payout, SubOrder no checkout, frete marketplace, chat, IA, afiliados, TechCoins, TechMart+, Elasticsearch, deploy cloud, endpoint público de Store.
- NÃO fazer push, force-push, nem reescrever histórico.
- Um único commit ao final da fase (Task 6), criado somente depois de `prisma validate`, `prisma generate`, `npm run build`, `npm test` e `npm run test:e2e` passarem. Tasks 1–5 NÃO commitam — apenas deixam o working tree pronto (`git add` é aceitável para conferência, `git commit` não).

## Contexto e decisões de design

Levantado ao analisar `AuthModule`, `UsersModule`, `RolesGuard`, `JwtStrategy`, `AuditInterceptor`, o schema Prisma e os módulos `addresses`/`admin` como referência de padrão:

1. **`User.role` muda automaticamente na aprovação/suspensão? SIM.** `JwtStrategy.validate()` (`backend/src/modules/auth/strategies/jwt.strategy.ts:20-37`) busca `role` fresco do banco a cada request — nunca confia no payload do JWT. Isso significa que o mecanismo de RBAC já existente (`@Roles('SELLER')` + `RolesGuard`) funciona automaticamente para proteger `/seller/store` **sem precisar de um guard novo baseado em `Seller.status`**, contanto que `User.role` seja mantido em sincronia com `Seller.status` numa transação atômica:
   - `approve`: `Seller.status → APPROVED` + `User.role → SELLER` (mesma `$transaction`).
   - `suspend`: `Seller.status → SUSPENDED` + `User.role → CUSTOMER` (mesma `$transaction`).
   - `reject`: só `Seller.status → REJECTED` — o usuário nunca foi promovido, então não há role pra reverter.

   Isso é a opção "mais consistente com a arquitetura atual" pedida no item 5 do spec: reaproveita o `RolesGuard` já usado em todo o resto do projeto (`UsersController`, `AdminOrdersController`, `AdminUsersController` fazem exatamente isso) em vez de inventar um `SellerStatusGuard` paralelo. O `Seller` continua existindo e não é apagado em nenhum caso — só o `role` (que já é mutável hoje via `PATCH /admin/users/:id/role`) reflete o estado atual.

2. **Reaplicação de `REJECTED` — regra explícita e seguraF:** `Seller.userId` é `@unique` no schema, então "reaplicar" nunca pode significar criar uma segunda linha para o mesmo usuário — o Prisma rejeitaria com uma constraint violation. A regra: se não existe `Seller` para o `userId` → cria `PENDING`; se existe e está `REJECTED` → faz `update` da mesma linha de volta pra `PENDING` (reaproveitando/atualizando `document`/`phone` se reenviados); se existe em qualquer outro status (`PENDING`, `APPROVED`, `SUSPENDED`) → `409 Conflict`.

3. **Quem pode chamar `POST /sellers/apply`:** protegido com `@Roles('CUSTOMER')`. Isso resolve de uma vez três regras do spec: ADMIN não tem "justificativa arquitetural" apresentada → bloqueado (403) por padrão; um usuário já `SELLER` (role já promovido) é bloqueado no próprio gate de role antes de tocar a tabela `Seller`; um `SUSPENDED` (que teve o role revertido pra `CUSTOMER` no passo 1) passa no gate de role mas é barrado em seguida pela regra de negócio do item 2 (409, pois a linha existe e não está `REJECTED`).

4. **Motivo de rejeição:** não existe hoje nenhum campo de "motivo" reutilizável em `Seller` (o único precedente é `Refund.reason`, que é de outro domínio). Não crio um campo novo nem uma tabela paralela de auditoria só pra isso — `PATCH /admin/sellers/:id/reject` registra apenas a mudança de status, como o próprio spec permite explicitamente ("Pode inicialmente registrar apenas o status, mas documente essa decisão"). Um campo de motivo textual pode entrar em fase futura se virar requisito de produto real.

5. **Quem executou a ação (approve/reject/suspend):** já coberto pela arquitetura existente sem mudança nenhuma — `AuditInterceptor` (`backend/src/common/interceptors/audit.interceptor.ts`) é global (registrado como `APP_INTERCEPTOR` em `app.module.ts`) e grava automaticamente `userId` (de `request.user.id`), `action` (`CREATE`/`UPDATE`) e `entity` pra **toda** requisição `POST/PUT/PATCH/DELETE**, incluindo as novas rotas desta fase. Não é criado nenhum sistema de auditoria paralelo.

6. **IDOR em `/seller/store`:** o spec pede endpoints sem `:id` na rota (`POST/GET/PATCH /seller/store`, sempre no singular, sempre "a própria loja"). Isso **elimina estruturalmente** o vetor de IDOR pros cenários "Seller A acessa/altera Store B" (testes 7 e 8 do spec) — não existe um ID pra manipular; a Store é sempre resolvida via `Store.findUnique({ where: { sellerId: <resolvido do JWT> } })`. Os testes e2e desta fase provam isso demonstrando que a resposta de B nunca contém dados de A, em vez de tentar passar o ID de A na URL (que a rota nem aceita).

7. **Paginação:** reaproveita exatamente o formato já usado em `AdminUsersController.findAll` (`backend/src/modules/admin/admin-users.controller.ts:36-81`): `{ data: [...], meta: { total, page, lastPage, limit } }`, `page`/`limit` via query string com defaults `1`/`20`.

8. **Endpoint público de Store:** não existe hoje (confirmado via busca no código) e não é criado nesta fase, conforme item 11 do spec.

9. **SUSPENDED é terminal nesta fase (decisão consciente, não descoberta em revisão):** nenhuma transição desta fase aceita `SUSPENDED` como origem — não existe reativação via API. Um Seller suspenso só volta a `APPROVED` por edição direta no banco. Isso é intencional para o escopo desta fase (o spec não pediu reativação) mas deve virar um endpoint explícito (`PATCH /admin/sellers/:id/reactivate`, reaproveitando a mesma transação de `approve`) assim que a operação precisar disso — não implementado agora para não expandir escopo sem necessidade real.

## File Structure

```
backend/src/modules/sellers/                     (NOVO módulo)
├── sellers.module.ts
├── sellers.controller.ts        # POST /sellers/apply
├── sellers.service.ts           # apply/findAllForAdmin/approve/reject/suspend/getApprovedSellerByUserId
├── store.controller.ts          # POST|GET|PATCH /seller/store
├── store.service.ts             # create/findMine/update (sempre via sellerId resolvido)
├── sellers.service.spec.ts
├── store.service.spec.ts
└── dto/
    ├── apply-seller.dto.ts
    ├── create-store.dto.ts
    └── update-store.dto.ts

backend/src/modules/admin/
├── admin-sellers.controller.ts  # NOVO: GET/PATCH admin/sellers/*
└── admin.module.ts              # MODIFICADO: registra SellersModule + AdminSellersController

backend/src/app.module.ts        # MODIFICADO: registra SellersModule

backend/test/
├── seller-onboarding.e2e-spec.ts  # NOVO: apply + admin approve/reject/suspend + RBAC
└── seller-store.e2e-spec.ts       # NOVO: store create/get/update + ownership isolation
```

---

### Task 1: `SellersModule` scaffold + `POST /sellers/apply`

**Files:**
- Create: `backend/src/modules/sellers/dto/apply-seller.dto.ts`
- Create: `backend/src/modules/sellers/sellers.service.ts`
- Create: `backend/src/modules/sellers/sellers.service.spec.ts`
- Create: `backend/src/modules/sellers/sellers.controller.ts`
- Create: `backend/src/modules/sellers/sellers.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `SellersService.apply(userId: string, dto: ApplySellerDto): Promise<Seller>` — used by `SellersController` in this task and referenced (read-only, via `getApprovedSellerByUserId`) by `StoreService` in Task 4.
- Produces: `SellersService.getApprovedSellerByUserId(userId: string): Promise<Seller>` — throws `ForbiddenException` if no seller row or `status !== 'APPROVED'`. Consumed by `StoreService` in Task 4 and `PATCH /admin/sellers/:id/approve|reject|suspend` internals in Tasks 2–3 indirectly (same service, different methods).

- [ ] **Step 1: Confirm baseline before touching anything**

```bash
wsl bash -lc "cd ~/techmart/backend && git status && git log -1 --oneline"
```

Expected: clean tree except the pre-existing `package-lock.json` diff, `HEAD` at `b908df0`.

- [ ] **Step 2: Write the DTO**

`backend/src/modules/sellers/dto/apply-seller.dto.ts`:
```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplySellerDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
```

- [ ] **Step 3: Write the failing unit test for `apply`**

`backend/src/modules/sellers/sellers.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SellersService } from './sellers.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SellersService', () => {
  let service: SellersService;

  const mockPrisma = {
    seller: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<any>[]) => Promise.all(ops)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SellersService>(SellersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('apply', () => {
    it('cria um Seller PENDING quando o usuário nunca solicitou antes', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      mockPrisma.seller.create.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });

      const result = await service.apply('u1', { document: '12345678900' });

      expect(mockPrisma.seller.create).toHaveBeenCalledWith({
        data: { userId: 'u1', document: '12345678900', phone: undefined },
      });
      expect(result.status).toBe('PENDING');
    });

    it.each(['PENDING', 'APPROVED', 'SUSPENDED'])(
      'rejeita reaplicação com 409 quando status atual é %s',
      async (status) => {
        mockPrisma.seller.findUnique.mockResolvedValue({
          id: 's1',
          userId: 'u1',
          status,
        });

        await expect(service.apply('u1', {})).rejects.toThrow(
          ConflictException,
        );
        expect(mockPrisma.seller.create).not.toHaveBeenCalled();
      },
    );

    it('reaproveita a linha existente e volta pra PENDING quando estava REJECTED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'REJECTED',
        document: 'old-doc',
        phone: 'old-phone',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'PENDING' });

      const result = await service.apply('u1', { document: 'new-doc' });

      expect(mockPrisma.seller.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { status: 'PENDING', document: 'new-doc', phone: 'old-phone' },
      });
      expect(mockPrisma.seller.create).not.toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
    });
  });

  describe('getApprovedSellerByUserId', () => {
    it('retorna o seller quando APPROVED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      const result = await service.getApprovedSellerByUserId('u1');
      expect(result.id).toBe('s1');
    });

    it('403 quando não existe seller', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      await expect(
        service.getApprovedSellerByUserId('u1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('403 quando existe mas não está APPROVED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      await expect(
        service.getApprovedSellerByUserId('u1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
```

(The `approve`/`reject`/`suspend` describe blocks are added in Tasks 2–3, next to the methods they test, to keep RED→GREEN tight per method.)

- [ ] **Step 4: Run it, confirm it fails**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/sellers.service.spec.ts"
```

Expected: FAIL — `Cannot find module './sellers.service'`.

- [ ] **Step 5: Implement `SellersService` (apply + getApprovedSellerByUserId only for now)**

`backend/src/modules/sellers/sellers.service.ts`:
```ts
import {
  ForbiddenException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

@Injectable()
export class SellersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Seller.userId é único no schema, então "reaplicar" nunca pode
   * significar criar uma segunda linha pro mesmo usuário. REJECTED
   * reaproveita a própria linha voltando pra PENDING; qualquer outro
   * status existente (PENDING/APPROVED/SUSPENDED) é 409.
   */
  async apply(userId: string, dto: ApplySellerDto) {
    const existing = await this.prisma.seller.findUnique({
      where: { userId },
    });

    if (!existing) {
      return this.prisma.seller.create({
        data: {
          userId,
          document: dto.document,
          phone: dto.phone,
        },
      });
    }

    if (existing.status !== 'REJECTED') {
      throw new ConflictException(
        `Você já possui uma solicitação de vendedor com status ${existing.status}`,
      );
    }

    return this.prisma.seller.update({
      where: { userId },
      data: {
        status: 'PENDING',
        document: dto.document ?? existing.document,
        phone: dto.phone ?? existing.phone,
      },
    });
  }

  /** Usado pelo StoreService — nunca aceita sellerId vindo do cliente. */
  async getApprovedSellerByUserId(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });

    if (!seller || seller.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Apenas vendedores aprovados podem executar esta ação',
      );
    }

    return seller;
  }

  protected async findByIdOrThrow(id: string) {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) {
      throw new NotFoundException('Solicitação de vendedor não encontrada');
    }
    return seller;
  }
}
```

- [ ] **Step 6: Run tests again, confirm they pass**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/sellers.service.spec.ts"
```

Expected: PASS (all tests in `apply` and `getApprovedSellerByUserId` describe blocks).

- [ ] **Step 7: Controller + module, wired into `AppModule`**

`backend/src/modules/sellers/sellers.controller.ts`:
```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SellersService } from './sellers.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

@ApiTags('Sellers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post('apply')
  @ApiOperation({ summary: 'Solicitar tornar-se vendedor (onboarding)' })
  apply(@CurrentUser() user: any, @Body() dto: ApplySellerDto) {
    return this.sellersService.apply(user.id, dto);
  }
}
```

`backend/src/modules/sellers/sellers.module.ts` (StoreController/StoreService added in Task 4 — for now just Sellers):
```ts
import { Module } from '@nestjs/common';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
```

Modify `backend/src/app.module.ts`: add `import { SellersModule } from './modules/sellers/sellers.module';` near the other module imports, and add `SellersModule` to the `imports` array (right after `AdminModule`, alongside the other feature modules).

- [ ] **Step 8: Build check**

```bash
wsl bash -lc "cd ~/techmart/backend && npx prisma generate && npm run build"
```

Expected: build succeeds (no new Prisma types needed — `Seller`/`SellerStatus` already generated from the Fase 1.1 schema).

- [ ] **Step 9: `git add` for review (no commit yet)**

```bash
wsl bash -lc "cd ~/techmart/backend && git add src/modules/sellers src/app.module.ts && git status"
```

---

### Task 2: `GET /admin/sellers` (list + pagination + status filter)

**Files:**
- Modify: `backend/src/modules/sellers/sellers.service.ts` (add `findAllForAdmin`)
- Modify: `backend/src/modules/sellers/sellers.service.spec.ts` (add describe block)
- Create: `backend/src/modules/admin/admin-sellers.controller.ts`
- Modify: `backend/src/modules/admin/admin.module.ts`

**Interfaces:**
- Consumes: `SellersService` (exported by `SellersModule`, Task 1).
- Produces: `SellersService.findAllForAdmin(params: { page: number; limit: number; status?: SellerStatus }): Promise<{ data: Seller[]; meta: { total: number; page: number; lastPage: number; limit: number } }>` — same shape as `AdminUsersController.findAll`, consumed only by `AdminSellersController` in this task.

- [ ] **Step 1: Add the failing unit test**

Add to `backend/src/modules/sellers/sellers.service.spec.ts` (inside the top-level `describe('SellersService', ...)`, e.g. right after `describe('apply', ...)`):
```ts
  describe('findAllForAdmin', () => {
    it('retorna dados paginados no formato { data, meta }', async () => {
      mockPrisma.seller.findMany.mockResolvedValue([
        { id: 's1', status: 'PENDING' },
      ]);
      mockPrisma.seller.count.mockResolvedValue(1);

      const result = await service.findAllForAdmin({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [{ id: 's1', status: 'PENDING' }],
        meta: { total: 1, page: 1, lastPage: 1, limit: 20 },
      });
    });

    it('filtra por status quando informado', async () => {
      mockPrisma.seller.findMany.mockResolvedValue([]);
      mockPrisma.seller.count.mockResolvedValue(0);

      await service.findAllForAdmin({ page: 1, limit: 20, status: 'PENDING' });

      expect(mockPrisma.seller.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
      expect(mockPrisma.seller.count).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
      });
    });
  });
```

- [ ] **Step 2: Run, confirm it fails**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/sellers.service.spec.ts -t findAllForAdmin"
```

Expected: FAIL — `service.findAllForAdmin is not a function`.

- [ ] **Step 3: Implement `findAllForAdmin`**

Add to `SellersService` in `backend/src/modules/sellers/sellers.service.ts`:
```ts
  async findAllForAdmin(params: {
    page: number;
    limit: number;
    status?: SellerStatus;
  }) {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.seller.findMany({
        where,
        select: {
          id: true,
          userId: true,
          document: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.seller.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, lastPage: Math.max(Math.ceil(total / limit), 1), limit },
    };
  }
```

- [ ] **Step 4: Run, confirm it passes**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/sellers.service.spec.ts"
```

Expected: PASS (all describe blocks so far).

- [ ] **Step 5: Admin controller**

`backend/src/modules/admin/admin-sellers.controller.ts`:
```ts
import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SellersService } from '../sellers/sellers.service';
import { SellerStatus } from '@prisma/client';

@ApiTags('Admin - Sellers')
@Controller('admin/sellers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminSellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar solicitações de vendedor (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'],
  })
  findAll(@Query() query: any) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;
    return this.sellersService.findAllForAdmin({
      page,
      limit,
      status: query.status as SellerStatus | undefined,
    });
  }
}
```

Modify `backend/src/modules/admin/admin.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAIController } from './admin-ai.controller';
import { AdminSellersController } from './admin-sellers.controller';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { SellersModule } from '../sellers/sellers.module';

@Module({
  imports: [OrdersModule, PrismaModule, ChatbotModule, SellersModule],
  controllers: [
    AdminOrdersController,
    AdminCouponsController,
    AdminUsersController,
    AdminAnalyticsController,
    AdminAIController,
    AdminSellersController,
  ],
})
export class AdminModule {}
```

- [ ] **Step 6: Build check**

```bash
wsl bash -lc "cd ~/techmart/backend && npm run build"
```

Expected: succeeds.

- [ ] **Step 7: `git add` for review (no commit)**

```bash
wsl bash -lc "cd ~/techmart/backend && git add src/modules/sellers src/modules/admin"
```

---

### Task 3: Admin approve / reject / suspend

**Files:**
- Modify: `backend/src/modules/sellers/sellers.service.ts` (add `approve`, `reject`, `suspend`)
- Modify: `backend/src/modules/sellers/sellers.service.spec.ts` (add describe blocks)
- Modify: `backend/src/modules/admin/admin-sellers.controller.ts` (add 3 `PATCH` routes)

**Interfaces:**
- Produces: `SellersService.approve(id: string)`, `.reject(id: string)`, `.suspend(id: string)` — all `Promise<Seller>`, all throw `NotFoundException` if the id doesn't exist and `ConflictException` on an invalid state transition. Consumed only by `AdminSellersController`.

- [ ] **Step 1: Add the failing unit tests**

Add to `backend/src/modules/sellers/sellers.service.spec.ts`:
```ts
  describe('approve', () => {
    it('promove Seller pra APPROVED e User pra SELLER na mesma transação', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'APPROVED' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'SELLER' });

      const result = await service.approve('s1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: 'SELLER' },
      });
      expect(result.status).toBe('APPROVED');
    });

    it('404 quando o Seller não existe', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue(null);
      await expect(service.approve('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409 quando o Seller não está PENDING', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      await expect(service.approve('s1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('rejeita um PENDING', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'REJECTED' });

      const result = await service.reject('s1');

      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('409 quando não está PENDING', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      await expect(service.reject('s1')).rejects.toThrow(ConflictException);
    });
  });

  describe('suspend', () => {
    it('suspende um APPROVED e reverte User pra CUSTOMER', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'APPROVED',
      });
      mockPrisma.seller.update.mockResolvedValue({ id: 's1', status: 'SUSPENDED' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'CUSTOMER' });

      const result = await service.suspend('s1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: 'CUSTOMER' },
      });
      expect(result.status).toBe('SUSPENDED');
    });

    it('409 quando não está APPROVED', async () => {
      mockPrisma.seller.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'PENDING',
      });
      await expect(service.suspend('s1')).rejects.toThrow(ConflictException);
    });
  });
```

- [ ] **Step 2: Run, confirm failures**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/sellers.service.spec.ts -t 'approve|reject|suspend'"
```

Expected: FAIL — methods don't exist yet.

- [ ] **Step 3: Implement `approve`, `reject`, `suspend`**

Add to `SellersService`:
```ts
  /**
   * Promove pra SELLER na mesma transação: o resto da API já protege
   * rotas de vendedor com @Roles('SELLER') + RolesGuard (mesmo mecanismo
   * usado em todo o projeto), e o JwtStrategy busca role sempre fresco do
   * banco a cada request — não é preciso o usuário logar de novo.
   */
  async approve(id: string) {
    const seller = await this.findByIdOrThrow(id);

    if (seller.status !== 'PENDING') {
      throw new ConflictException(
        `Só é possível aprovar solicitações PENDING (atual: ${seller.status})`,
      );
    }

    const [updatedSeller] = await this.prisma.$transaction([
      this.prisma.seller.update({
        where: { id },
        data: { status: 'APPROVED' },
      }),
      this.prisma.user.update({
        where: { id: seller.userId! },
        data: { role: 'SELLER' },
      }),
    ]);

    return updatedSeller;
  }

  async reject(id: string) {
    const seller = await this.findByIdOrThrow(id);

    if (seller.status !== 'PENDING') {
      throw new ConflictException(
        `Só é possível rejeitar solicitações PENDING (atual: ${seller.status})`,
      );
    }

    return this.prisma.seller.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  /**
   * Reverte User.role pra CUSTOMER: as rotas /seller/store são protegidas
   * por @Roles('SELLER'), então isso já basta pra bloquear o vendedor sem
   * precisar de um guard paralelo baseado em Seller.status. Seller e
   * Store não são apagados nem desativados — só o acesso.
   */
  async suspend(id: string) {
    const seller = await this.findByIdOrThrow(id);

    if (seller.status !== 'APPROVED') {
      throw new ConflictException(
        `Só é possível suspender solicitações APPROVED (atual: ${seller.status})`,
      );
    }

    const [updatedSeller] = await this.prisma.$transaction([
      this.prisma.seller.update({
        where: { id },
        data: { status: 'SUSPENDED' },
      }),
      this.prisma.user.update({
        where: { id: seller.userId! },
        data: { role: 'CUSTOMER' },
      }),
    ]);

    return updatedSeller;
  }
```

- [ ] **Step 4: Run, confirm all pass**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/sellers.service.spec.ts"
```

Expected: PASS — full file green.

- [ ] **Step 5: Wire the 3 routes into `AdminSellersController`**

Add to `backend/src/modules/admin/admin-sellers.controller.ts` (inside the class, after `findAll`):
```ts
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Aprovar solicitação de vendedor (Admin)' })
  approve(@Param('id') id: string) {
    return this.sellersService.approve(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rejeitar solicitação de vendedor (Admin)' })
  reject(@Param('id') id: string) {
    return this.sellersService.reject(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspender vendedor aprovado (Admin)' })
  suspend(@Param('id') id: string) {
    return this.sellersService.suspend(id);
  }
```

- [ ] **Step 6: Build check**

```bash
wsl bash -lc "cd ~/techmart/backend && npm run build"
```

- [ ] **Step 7: `git add` for review (no commit)**

```bash
wsl bash -lc "cd ~/techmart/backend && git add src/modules/sellers src/modules/admin"
```

---

### Task 4: `seller/store` management (create / get / update)

**Files:**
- Create: `backend/src/modules/sellers/dto/create-store.dto.ts`
- Create: `backend/src/modules/sellers/dto/update-store.dto.ts`
- Create: `backend/src/modules/sellers/store.service.ts`
- Create: `backend/src/modules/sellers/store.service.spec.ts`
- Create: `backend/src/modules/sellers/store.controller.ts`
- Modify: `backend/src/modules/sellers/sellers.module.ts`

**Interfaces:**
- Consumes: `SellersService.getApprovedSellerByUserId(userId)` (Task 1) — the only way `StoreService` learns which `sellerId` to use; never reads a client-supplied id.
- Produces: `StoreController` routes `POST|GET|PATCH /seller/store`, terminal for this plan (no later task depends on `StoreService`'s internals).

- [ ] **Step 1: DTOs**

`backend/src/modules/sellers/dto/create-store.dto.ts`:
```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiProperty({ example: 'Loja do João' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'loja-do-joao' })
  @IsString()
  @MaxLength(140)
  slug: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

`backend/src/modules/sellers/dto/update-store.dto.ts`:
```ts
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateStoreDto } from './create-store.dto';

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 2: Write the failing unit test**

`backend/src/modules/sellers/store.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StoreService } from './store.service';
import { SellersService } from './sellers.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StoreService', () => {
  let service: StoreService;

  const mockPrisma = {
    store: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSellersService = {
    getApprovedSellerByUserId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SellersService, useValue: mockSellersService },
      ],
    }).compile();

    service = module.get<StoreService>(StoreService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('cria a loja usando o sellerId resolvido pelo userId autenticado (nunca do body)', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.create.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });

      const result = await service.create('user-a', {
        name: 'Loja A',
        slug: 'loja-a',
      });

      expect(mockPrisma.store.create).toHaveBeenCalledWith({
        data: {
          sellerId: 'seller-a',
          name: 'Loja A',
          slug: 'loja-a',
          description: undefined,
        },
      });
      expect(result.sellerId).toBe('seller-a');
    });

    it('propaga o 403 quando o vendedor não está aprovado', async () => {
      mockSellersService.getApprovedSellerByUserId.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.create('user-a', { name: 'X', slug: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.store.create).not.toHaveBeenCalled();
    });

    it('409 quando slug/sellerId já existe (unique constraint)', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.0',
        }),
      );

      await expect(
        service.create('user-a', { name: 'X', slug: 'x' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findMine', () => {
    it('busca a Store pelo sellerId do usuário autenticado', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });

      const result = await service.findMine('user-a');

      expect(mockPrisma.store.findUnique).toHaveBeenCalledWith({
        where: { sellerId: 'seller-a' },
      });
      expect(result.id).toBe('store-1');
    });

    it('404 quando o vendedor aprovado ainda não criou loja', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findMine('user-a')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('atualiza somente a própria loja, sempre filtrando por sellerId', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue({
        id: 'store-1',
        sellerId: 'seller-a',
      });
      mockPrisma.store.update.mockResolvedValue({
        id: 'store-1',
        name: 'Novo nome',
      });

      const result = await service.update('user-a', { name: 'Novo nome' });

      expect(mockPrisma.store.update).toHaveBeenCalledWith({
        where: { sellerId: 'seller-a' },
        data: { name: 'Novo nome' },
      });
      expect(result.name).toBe('Novo nome');
    });

    it('404 quando o vendedor aprovado ainda não tem loja pra atualizar', async () => {
      mockSellersService.getApprovedSellerByUserId.mockResolvedValue({
        id: 'seller-a',
      });
      mockPrisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-a', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.store.update).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run, confirm it fails**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/store.service.spec.ts"
```

Expected: FAIL — `Cannot find module './store.service'`.

- [ ] **Step 4: Implement `StoreService`**

`backend/src/modules/sellers/store.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SellersService } from './sellers.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoreService {
  constructor(
    private prisma: PrismaService,
    private sellersService: SellersService,
  ) {}

  async create(userId: string, dto: CreateStoreDto) {
    const seller = await this.sellersService.getApprovedSellerByUserId(userId);

    try {
      return await this.prisma.store.create({
        data: {
          sellerId: seller.id,
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Você já possui uma loja, ou o slug informado já está em uso',
        );
      }
      throw error;
    }
  }

  /**
   * A Store é sempre resolvida pelo sellerId do usuário autenticado — não
   * existe :id na rota, então não há como um Seller pedir a Store de
   * outro Seller através deste endpoint.
   */
  async findMine(userId: string) {
    const seller = await this.sellersService.getApprovedSellerByUserId(userId);

    const store = await this.prisma.store.findUnique({
      where: { sellerId: seller.id },
    });

    if (!store) {
      throw new NotFoundException('Você ainda não possui uma loja');
    }

    return store;
  }

  async update(userId: string, dto: UpdateStoreDto) {
    const seller = await this.sellersService.getApprovedSellerByUserId(userId);

    const store = await this.prisma.store.findUnique({
      where: { sellerId: seller.id },
    });

    if (!store) {
      throw new NotFoundException('Você ainda não possui uma loja');
    }

    try {
      return await this.prisma.store.update({
        where: { sellerId: seller.id },
        data: dto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Slug já está em uso por outra loja');
      }
      throw error;
    }
  }
}
```

- [ ] **Step 5: Run, confirm it passes**

```bash
wsl bash -lc "cd ~/techmart/backend && npx jest src/modules/sellers/store.service.spec.ts"
```

Expected: PASS.

- [ ] **Step 6: Controller + module wiring**

`backend/src/modules/sellers/store.controller.ts`:
```ts
import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@ApiTags('Seller - Store')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SELLER')
@Controller('seller/store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @ApiOperation({ summary: 'Criar a loja do vendedor autenticado' })
  create(@CurrentUser() user: any, @Body() dto: CreateStoreDto) {
    return this.storeService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obter a própria loja' })
  findMine(@CurrentUser() user: any) {
    return this.storeService.findMine(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualizar a própria loja' })
  update(@CurrentUser() user: any, @Body() dto: UpdateStoreDto) {
    return this.storeService.update(user.id, dto);
  }
}
```

Replace `backend/src/modules/sellers/sellers.module.ts` with:
```ts
import { Module } from '@nestjs/common';
import { SellersController } from './sellers.controller';
import { StoreController } from './store.controller';
import { SellersService } from './sellers.service';
import { StoreService } from './store.service';

@Module({
  controllers: [SellersController, StoreController],
  providers: [SellersService, StoreService],
  exports: [SellersService],
})
export class SellersModule {}
```

- [ ] **Step 7: Build check**

```bash
wsl bash -lc "cd ~/techmart/backend && npm run build"
```

- [ ] **Step 8: `git add` for review (no commit)**

```bash
wsl bash -lc "cd ~/techmart/backend && git add src/modules/sellers"
```

---

### Task 5: E2E coverage — RBAC matrix + ownership isolation

**Files:**
- Create: `backend/test/seller-onboarding.e2e-spec.ts`
- Create: `backend/test/seller-store.e2e-spec.ts`

**Interfaces:**
- Consumes: every endpoint from Tasks 1–4 over real HTTP (via `supertest`), following the exact bootstrap pattern already used in `backend/test/users.e2e-spec.ts` (`Test.createTestingModule({ imports: [AppModule] })`, `app.setGlobalPrefix('api/v1')`, global `ValidationPipe`).

- [ ] **Step 1: Write `backend/test/seller-onboarding.e2e-spec.ts`**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
      expect(
        res.body.data.every((s: any) => s.status === 'PENDING'),
      ).toBe(true);
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

    it('Seller SUSPENDED tenta administrar Store → 403 (role já não é SELLER)', () => {
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
});
```

- [ ] **Step 2: Run it (expected to fail before Tasks 1–4 exist; expected to pass now that they do)**

```bash
wsl bash -lc "cd ~/techmart/backend && npm run test:e2e -- seller-onboarding"
```

Expected: PASS (Tasks 1–3 are already implemented at this point in the plan).

- [ ] **Step 3: Write `backend/test/seller-store.e2e-spec.ts`**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

    const admin = await register(
      'admin-seller-store-e2e@example.com',
      'Admin',
    );
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

  it('SELLER pendente (nunca aprovado) não pode criar loja → 403', async () => {
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
```

- [ ] **Step 4: Run it**

```bash
wsl bash -lc "cd ~/techmart/backend && npm run test:e2e -- seller-store"
```

Expected: PASS.

- [ ] **Step 5: `git add` for review (no commit)**

```bash
wsl bash -lc "cd ~/techmart/backend && git add test/seller-onboarding.e2e-spec.ts test/seller-store.e2e-spec.ts"
```

---

### Task 6: Full regression, security self-audit, single commit, final report

**Files:** none new — verification only, plus the one commit.

- [ ] **Step 1: Schema + build regression**

```bash
wsl bash -lc "cd ~/techmart/backend && npx prisma validate && npx prisma generate && npm run build"
```

Expected: all three succeed, and confirm no new migration file appeared under `prisma/migrations/` (`git status prisma/migrations` should be empty).

- [ ] **Step 2: Full unit test suite**

```bash
wsl bash -lc "cd ~/techmart/backend && npm test"
```

Expected: all pre-existing tests still pass, plus the new `sellers.service.spec.ts` and `store.service.spec.ts` — record the before/after test count to confirm nothing was deleted.

- [ ] **Step 3: Full e2e suite**

```bash
wsl bash -lc "cd ~/techmart/backend && npm run test:e2e"
```

Expected: all pre-existing e2e specs (`app.e2e-spec.ts`, `marketplace-foundation.e2e-spec.ts`, `products.e2e-spec.ts`, `users.e2e-spec.ts`) still pass, plus the two new files from Task 5.

- [ ] **Step 4: Security self-audit checklist (manual read-through, not a new test file)**

Confirm each item against the actual code just written:
- IDOR: `/seller/store` has no `:id` — ownership resolved only via `sellersService.getApprovedSellerByUserId(req.user.id)`. `/admin/sellers/:id/*` requires `@Roles('ADMIN')`, so `:id` there is only reachable by an admin, not by a peer seller.
- Mass assignment: `ApplySellerDto`/`CreateStoreDto`/`UpdateStoreDto` never declare `status`, `userId`, `sellerId`, `role`, `id`, `createdAt`, `approvedBy` — combined with the global `forbidNonWhitelisted: true` pipe, any such field in a request body is a `400`, proven by the e2e tests in Task 5.
- Privilege escalation: the only paths that write `User.role` are `SellersService.approve`/`.suspend` (server-derived, no client input) and the pre-existing `PATCH /admin/users/:id/role` (already ADMIN-gated, untouched by this phase).
- Cross-seller access: proven in `seller-store.e2e-spec.ts` (Seller B never sees/edits Seller A's store).
- Unapproved seller access: proven by the `PENDING`/`SUSPENDED` → `403` cases in both e2e files.
- Unauthenticated access: every new route has a `401` case in the e2e suite.

- [ ] **Step 5: Single commit**

```bash
wsl bash -lc "cd ~/techmart/backend && git status && git diff --stat"
```

Review the diff, then:
```bash
wsl bash -lc "cd ~/techmart/backend && git add src/modules/sellers src/modules/admin src/app.module.ts test/seller-onboarding.e2e-spec.ts test/seller-store.e2e-spec.ts && git commit -m 'Fase 1.2: seller onboarding, RBAC e store management'"
```

Do NOT `git push`.

- [ ] **Step 6: Final report to the user**

Produce the report requested in section 20 of the spec (Implementado / Endpoints / RBAC / Segurança / Testes / Banco / Git / Pendências), using the real output of Steps 1–5 above (actual test counts, actual `git log -1` and `git status` output) — not estimated numbers.
