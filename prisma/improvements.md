// Add this to your existing schema.prisma file

// Soft delete support - add to models that need it
model Product {
  // ... existing fields
  deletedAt DateTime? // Soft delete timestamp
  
  @@index([deletedAt]) // Index for filtering
}

model Category {
  // ... existing fields
  deletedAt DateTime?
  
  @@index([deletedAt])
}

model User {
  // ... existing fields
  deletedAt DateTime?
  
  @@index([deletedAt])
}

// Full-text search support (PostgreSQL)
// Add to Product model
model Product {
  // ... existing fields
  
  // Full-text search index
  @@index([name(ops: raw("gin_trgm_ops"))], type: Gin)
  @@index([description(ops: raw("gin_trgm_ops"))], type: Gin)
}

// Connection pooling configuration
// Add to datasource block
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL") // For migrations
  
  // Connection pool settings
  relationMode = "prisma"
}

// Audit log model (already created separately)
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  action    String
  entity    String
  entityId  String?
  changes   Json?
  ipAddress String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([entity])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
