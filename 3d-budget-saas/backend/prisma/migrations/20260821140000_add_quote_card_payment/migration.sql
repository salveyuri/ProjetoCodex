-- Novo campo no orçamento: "Pagamento Cartão". Quando marcado, a taxa de
-- cartão configurada em Settings é somada por cima do preço calculado pela
-- fórmula (em vez de sempre embutida, como era antes). card_fee_amount
-- guarda o valor real (snapshot) que foi acrescido. Ver
-- Contextos/Decisoes.md (2026-08-21).

ALTER TABLE "quotes" ADD COLUMN "card_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quotes" ADD COLUMN "card_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
