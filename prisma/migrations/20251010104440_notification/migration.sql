/*
  Warnings:

  - You are about to drop the column `notify` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "notify",
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
