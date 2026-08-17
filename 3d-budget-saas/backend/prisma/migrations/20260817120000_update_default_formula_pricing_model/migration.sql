-- Corrige um bug real: horas de pintura/acabamento eram somadas por mesa
-- em vez de uma vez so pro orcamento inteiro, dobrando/triplicando esse
-- custo quando havia mais de uma mesa. A formula agora e avaliada uma
-- unica vez pro orcamento inteiro (nao mais por mesa) e "custo_base" passa
-- a ser o agregado de todas as mesas, com a taxa de erro aplicada so sobre
-- material+energia. Ver Contextos/Decisoes.md (2026-08-17).
UPDATE "system_formulas"
SET "expression" = '(custo_base + (valor_hora_acabamento * horas_acabamento) + (valor_hora_pintura * horas_pintura)) * (1 + taxas_percentuais + margem_lucro)',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'system_default';
