-- Fecha um bug real: "Formula Padrao do Sistema" era, ate agora, uma copia
-- MUTAVEL por empresa (criada por FormulaService.ensureDefaultFormula, que
-- este migration substitui) - uma empresa editou a propria copia e removeu
-- o termo aditivo de base, ficando so com
-- "custo_base * (1+margem) * (taxa_cartao+taxa_administrativa)", que
-- calcula so a fatia da taxa (um valor pequeno) em vez do preco total,
-- parecendo "reduzir" o preco ao aplicar taxa de cartao/administrativa.
--
-- Formulas do sistema agora sao um recurso global, gerenciado só pelo admin
-- (tela /admin/system-formulas) - aparecem pra todas as empresas na
-- biblioteca de formulas, mas so leitura (nunca editaveis/apagaveis por
-- elas).
CREATE TABLE "system_formulas" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_formulas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_formulas_code_key" ON "system_formulas"("code");

INSERT INTO "system_formulas" ("id", "code", "name", "expression", "is_active", "is_default", "created_at", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000201',
  'system_default',
  'Formula Padrao do Sistema',
  '(custo_base * (1 + margem_lucro)) + (custo_base * (1 + margem_lucro) * (taxa_cartao + taxa_administrativa + taxa_erro))',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Remove as copias privadas por empresa (inclusive quaisquer editadas/
-- quebradas, exatamente o bug corrigido acima). Orcamentos ja criados que
-- apontavam pra uma dessas linhas so perdem a referencia (FK ON DELETE
-- SET NULL) - o valor calculado na epoca ja esta congelado no snapshot em
-- print_items, nada e recalculado.
DELETE FROM "formulas" WHERE "code" = 'system_default';
