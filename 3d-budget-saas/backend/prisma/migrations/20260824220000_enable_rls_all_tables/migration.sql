-- Habilita Row Level Security (RLS) em todas as tabelas do schema public,
-- sem nenhuma policy. Motivo: alerta do Supabase ("Table public.X is
-- public, but RLS has not been enabled") - o linter do Supabase expõe
-- automaticamente via PostgREST qualquer tabela do schema public sem
-- RLS, mesmo que a aplicação nunca use PostgREST/o client JS do
-- Supabase. Este backend só acessa o banco via Prisma com o role
-- "postgres" (dono das tabelas via connection pooler do Supabase, ver
-- DATABASE_URL em produção) - esse role faz BYPASS de RLS automático
-- (dono de tabela sempre ignora RLS, a menos que FORCE ROW LEVEL
-- SECURITY seja setado, o que não é o caso aqui). Ou seja: habilitar RLS
-- sem nenhuma policy fecha o buraco real (acesso direto via API REST do
-- Supabase usando a anon key, caso ela vaze algum dia) sem quebrar nada
-- da aplicação - Prisma continua enxergando os dados normalmente.
-- Confirmado: nenhum uso de @supabase/supabase-js, SUPABASE_ANON_KEY ou
-- PostgREST em nenhum lugar do código (grep em backend/src e
-- frontend/src). Ver Contextos/Decisoes.md (2026-08-24).

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "machines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "machine_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pricing_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "formulas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_formulas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_errors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_logs" ENABLE ROW LEVEL SECURITY;
