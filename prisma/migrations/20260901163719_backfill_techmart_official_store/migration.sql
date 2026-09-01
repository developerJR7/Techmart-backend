-- Backfill: "TechMart Official Store".
--
-- Seller.userId é nullable de propósito (ver comentário no schema.prisma):
-- essa é a loja usada para produtos legados sem vendedor real, e por isso
-- usa um Seller sem User vinculado em vez de uma conta de sistema falsa.
-- Essa migration nunca tinha sido criada, então test/marketplace-foundation
-- .e2e-spec.ts (que assume essa loja já existir) falhava com "não existe
-- nenhuma Store com slug 'techmart-official'".
--
-- IDs fixos (em vez de gen_random_uuid()) para o registro ser idempotente
-- e previsível — é um singleton da plataforma, não um dado de usuário.
INSERT INTO "sellers" ("id", "userId", "document", "phone", "status", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  NULL,
  NULL,
  'APPROVED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "stores" ("id", "sellerId", "name", "slug", "description", "isActive", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'TechMart Official Store',
  'techmart-official',
  'Produtos oficiais TechMart, sem vendedor terceiro associado.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
