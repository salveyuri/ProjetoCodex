-- "Desconto/Acréscimo" no orçamento: campo abaixo de "Pagamento Cartão" na
-- tela de criação/edição. adjustment_type nulo = nenhum aplicado.
-- adjustment_percent é o percentual digitado; adjustment_amount é o valor
-- real (snapshot, sinalizado: negativo pra DISCOUNT, positivo pra
-- SURCHARGE) aplicado em cima do preço já com a taxa de cartão, mesmo
-- padrão de card_payment/card_fee_amount. Ver Contextos/Decisoes.md
-- (2026-08-22).

CREATE TYPE "QuoteAdjustmentType" AS ENUM ('DISCOUNT', 'SURCHARGE');

ALTER TABLE "quotes" ADD COLUMN "adjustment_type" "QuoteAdjustmentType";
ALTER TABLE "quotes" ADD COLUMN "adjustment_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotes" ADD COLUMN "adjustment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
