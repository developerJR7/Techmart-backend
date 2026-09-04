/*
  Warnings:

  - Added the required column `neighborhood` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `number` to the `addresses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "complement" TEXT,
ADD COLUMN     "neighborhood" TEXT NOT NULL,
ADD COLUMN     "number" TEXT NOT NULL;
