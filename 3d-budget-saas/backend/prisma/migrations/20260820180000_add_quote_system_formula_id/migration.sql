-- Persiste qual fórmula do SISTEMA (não da empresa) foi selecionada num
-- orçamento. Até aqui, "quotes.formula_id" só referenciava "formulas"
-- (tabela por empresa) - selecionar uma fórmula do sistema fazia o backend
-- gravar NULL de propósito (não havia FK segura pra guardar), então reabrir
-- o orçamento pra editar sempre voltava pra fórmula padrão. Ver
-- Contextos/Decisoes.md (2026-08-20).

ALTER TABLE "quotes" ADD COLUMN "system_formula_id" UUID;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_system_formula_id_fkey"
  FOREIGN KEY ("system_formula_id") REFERENCES "system_formulas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "quotes_system_formula_id_idx" ON "quotes"("system_formula_id");
