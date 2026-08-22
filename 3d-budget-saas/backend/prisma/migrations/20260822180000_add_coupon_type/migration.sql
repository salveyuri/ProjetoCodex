-- Dois tipos de cupom: RECURRING (desconto vale pra sempre, ja era o unico
-- comportamento ate aqui) e ONE_TIME (desconto so no primeiro ciclo -
-- assim que o webhook confirma esse primeiro pagamento, o valor da
-- assinatura no Asaas e atualizado de volta pro preco cheio do plano). Ver
-- Contextos/Decisoes.md (2026-08-22).

CREATE TYPE "CouponType" AS ENUM ('RECURRING', 'ONE_TIME');

ALTER TABLE "coupons" ADD COLUMN "type" "CouponType" NOT NULL DEFAULT 'RECURRING';
