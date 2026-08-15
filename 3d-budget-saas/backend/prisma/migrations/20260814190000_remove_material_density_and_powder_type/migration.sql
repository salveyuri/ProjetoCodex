-- Remove o campo "densidade" de materiais (nunca usado em nenhum calculo
-- de custo) e a opcao "PO" do tipo de material, deixando so
-- Filamento/Resina/Outro.

-- Reatribui materiais existentes do tipo POWDER para OTHER antes de
-- remover esse valor do enum (Postgres nao deixa remover um valor de enum
-- ainda referenciado por alguma linha).
UPDATE "materials" SET "type" = 'OTHER' WHERE "type" = 'POWDER';

-- Recria o enum MaterialType sem POWDER (Postgres nao suporta remover um
-- valor de enum diretamente).
ALTER TYPE "MaterialType" RENAME TO "MaterialType_old";
CREATE TYPE "MaterialType" AS ENUM ('FILAMENT', 'RESIN', 'OTHER');
ALTER TABLE "materials" ALTER COLUMN "type" TYPE "MaterialType" USING ("type"::text::"MaterialType");
DROP TYPE "MaterialType_old";

-- Remove a coluna de densidade.
ALTER TABLE "materials" DROP COLUMN "density";
