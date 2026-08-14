-- Catalogo de referencia de impressoras (autocomplete no cadastro de
-- maquina) + custo de manutencao por hora como segunda variavel de custo
-- horario da maquina, ao lado da depreciacao ja existente.

CREATE TABLE "machine_catalog" (
    "id" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MachineType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "power_consumption_watts" DECIMAL(10,2) NOT NULL,
    "print_volume_x_mm" DECIMAL(10,2) NOT NULL,
    "print_volume_y_mm" DECIMAL(10,2) NOT NULL,
    "print_volume_z_mm" DECIMAL(10,2) NOT NULL,
    "depreciation_cost_per_hour" DECIMAL(10,4) NOT NULL,
    "maintenance_cost_per_hour" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "machine_catalog_brand_name_key" ON "machine_catalog"("brand", "name");
CREATE INDEX "machine_catalog_name_idx" ON "machine_catalog"("name");

-- Seed: 63 modelos atuais de FDM/resina (Bambu Lab, Creality, Prusa,
-- Anycubic, Elegoo, Phrozen, Qidi Tech, Flashforge, Sovol, Artillery,
-- Voxelab, Peopoly). price = referencia em R$ (pesquisa Mercado Livre/
-- AliExpress ou estimativa cambio+importacao — ver Contextos/Decisoes.md).
-- depreciation_cost_per_hour / maintenance_cost_per_hour ja vem calculado
-- com as formulas: FDM = (price*0.9)/10000 e (price*0.3)/2000; SLA/RESIN =
-- (price*0.9)/6000 e (price*0.35)/1500.
INSERT INTO "machine_catalog" ("id", "brand", "name", "type", "price", "power_consumption_watts", "print_volume_x_mm", "print_volume_y_mm", "print_volume_z_mm", "depreciation_cost_per_hour", "maintenance_cost_per_hour", "created_at", "updated_at")
VALUES
  ('5c7203ac-08b1-4898-bb10-5bc345e998b1', 'Bambu Lab', 'A1 Mini', 'FDM', 1799.00, 90.00, 180.00, 180.00, 180.00, 0.1619, 0.2698, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('888ab837-43c2-449a-a6e0-cb4093f44d42', 'Bambu Lab', 'A1', 'FDM', 2400.00, 90.00, 256.00, 256.00, 256.00, 0.2160, 0.3600, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('20b1d3db-65bd-42a1-a078-64f09e060a10', 'Bambu Lab', 'P1P', 'FDM', 4200.00, 100.00, 256.00, 256.00, 256.00, 0.3780, 0.6300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0ee39b06-1b8d-4847-b9f8-99f964e56df7', 'Bambu Lab', 'P1S', 'FDM', 5800.00, 100.00, 256.00, 256.00, 256.00, 0.5220, 0.8700, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('5c055fd0-014d-4d33-b8b8-2025eddac2fa', 'Bambu Lab', 'X1 Carbon', 'FDM', 9500.00, 350.00, 256.00, 256.00, 256.00, 0.8550, 1.4250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('e2587ec5-5195-4b85-bcb5-3ff4421a3e87', 'Bambu Lab', 'X1E', 'FDM', 12500.00, 350.00, 256.00, 256.00, 256.00, 1.1250, 1.8750, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('f755550f-1314-4205-ba81-34fc787a99c7', 'Creality', 'Ender-3 V3 SE', 'FDM', 1400.00, 350.00, 220.00, 220.00, 250.00, 0.1260, 0.2100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('014a777b-d437-44a0-a0f6-e39e111a7e8b', 'Creality', 'Ender-3 V3 KE', 'FDM', 2200.00, 350.00, 220.00, 220.00, 240.00, 0.1980, 0.3300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d4bde055-2654-4405-93b7-af677c164a37', 'Creality', 'K1', 'FDM', 3800.00, 350.00, 220.00, 220.00, 250.00, 0.3420, 0.5700, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('82f94966-caff-4847-95ec-05cd9311ac63', 'Creality', 'K1C', 'FDM', 4400.00, 350.00, 220.00, 220.00, 250.00, 0.3960, 0.6600, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7c75c2ed-05e3-4d40-9185-df7960ca4ad4', 'Creality', 'K1 Max', 'FDM', 5999.00, 1000.00, 300.00, 300.00, 300.00, 0.5399, 0.8999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0f2b4e9c-1e60-45c3-b429-a754b240bf7a', 'Creality', 'Ender-5 S1', 'FDM', 3200.00, 350.00, 220.00, 220.00, 280.00, 0.2880, 0.4800, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d9befa14-72e2-46b7-b0d1-91980edfd045', 'Creality', 'Halot-One Plus', 'RESIN', 1900.00, 55.00, 172.00, 102.00, 160.00, 0.2850, 0.4433, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('5bf6272f-d185-4aeb-a557-8b736b074fe5', 'Creality', 'Halot-Mage Pro', 'RESIN', 4800.00, 120.00, 228.00, 128.00, 230.00, 0.7200, 1.1200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('6f972a27-e120-4a07-903f-c8359a76528c', 'Prusa', 'MINI+', 'FDM', 3300.00, 120.00, 180.00, 180.00, 180.00, 0.2970, 0.4950, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4a33b5c4-79d8-4782-bf75-a8a34f66f215', 'Prusa', 'MK4S', 'FDM', 8000.00, 250.00, 250.00, 210.00, 220.00, 0.7200, 1.2000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('97cbb34c-b478-4180-95ab-488e2bbb6731', 'Prusa', 'Core One', 'FDM', 9500.00, 250.00, 250.00, 220.00, 270.00, 0.8550, 1.4250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fad37065-7547-441b-adfa-d182b92dc10a', 'Prusa', 'XL', 'FDM', 18000.00, 300.00, 360.00, 360.00, 360.00, 1.6200, 2.7000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('edea1d78-b32f-4085-ab1d-af3354e425cd', 'Anycubic', 'Kobra 2 Neo', 'FDM', 1600.00, 350.00, 220.00, 220.00, 250.00, 0.1440, 0.2400, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('e9d05e4a-dcf2-402d-b455-ca1d0a368539', 'Anycubic', 'Kobra 2 Pro', 'FDM', 2200.00, 350.00, 220.00, 220.00, 250.00, 0.1980, 0.3300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4f2957f5-56c1-4f9c-ac0c-b9cca0ad82d5', 'Anycubic', 'Kobra 3', 'FDM', 3200.00, 350.00, 250.00, 250.00, 260.00, 0.2880, 0.4800, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b5f87d0c-0084-45cd-9567-15d0bb0493c5', 'Anycubic', 'Kobra S1', 'FDM', 4500.00, 350.00, 260.00, 260.00, 325.00, 0.4050, 0.6750, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2c6158d3-1c0f-4d60-8820-d11f4790fa52', 'Anycubic', 'Photon Mono X', 'RESIN', 2400.00, 120.00, 192.00, 120.00, 245.00, 0.3600, 0.5600, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cbe358b4-cb7a-4a85-8f71-7cd4b33c7a48', 'Anycubic', 'Photon Mono M5s', 'RESIN', 3600.00, 90.00, 218.00, 123.00, 200.00, 0.5400, 0.8400, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7da320e8-0f15-4772-800f-527609d6d92d', 'Anycubic', 'Photon Mono M5s Pro', 'RESIN', 4800.00, 110.00, 224.00, 126.00, 200.00, 0.7200, 1.1200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('9eafedb4-f29a-4819-8bfc-23144aee4c81', 'Anycubic', 'Photon M3 Premium', 'RESIN', 5200.00, 100.00, 163.00, 102.00, 180.00, 0.7800, 1.2133, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a8fac88f-4c3e-41db-ae5b-c94fb5be3c1f', 'Elegoo', 'Neptune 4', 'FDM', 1800.00, 350.00, 225.00, 225.00, 265.00, 0.1620, 0.2700, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('95c60a4e-da29-469e-9833-7b175bfc18b4', 'Elegoo', 'Neptune 4 Pro', 'FDM', 2300.00, 350.00, 225.00, 225.00, 265.00, 0.2070, 0.3450, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c9483c0a-67d3-44de-a314-3441b7aaafba', 'Elegoo', 'Neptune 4 Max', 'FDM', 4000.00, 500.00, 420.00, 420.00, 480.00, 0.3600, 0.6000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4baac41a-31f2-4ee6-9dd0-db741bd6bee4', 'Elegoo', 'Centauri Carbon', 'FDM', 3500.00, 350.00, 256.00, 256.00, 256.00, 0.3150, 0.5250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2964d618-f8d9-411f-8b4a-e31f6d9c4e34', 'Elegoo', 'Mars 5', 'RESIN', 1900.00, 65.00, 153.00, 78.00, 150.00, 0.2850, 0.4433, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('84e5be91-28ed-4d04-ba92-8f7446f9c830', 'Elegoo', 'Mars 5 Ultra', 'RESIN', 2600.00, 72.00, 153.00, 78.00, 165.00, 0.3900, 0.6067, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('29670738-8c76-44fa-ae4b-405f453bf482', 'Elegoo', 'Saturn 4', 'RESIN', 3900.00, 130.00, 219.00, 123.00, 250.00, 0.5850, 0.9100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7ee09c6e-cfac-47f3-9fab-3b6d77fcf552', 'Elegoo', 'Saturn 4 Ultra', 'RESIN', 4800.00, 144.00, 219.00, 123.00, 220.00, 0.7200, 1.1200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3679c4e5-ea53-4d3c-af21-e4703804b7a4', 'Phrozen', 'Sonic Mini 8K S', 'RESIN', 2800.00, 55.00, 165.00, 72.00, 180.00, 0.4200, 0.6533, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4e748474-5c83-47ac-9d54-d7ae66bcaffe', 'Phrozen', 'Sonic Mega 8K S', 'RESIN', 8500.00, 90.00, 330.00, 185.00, 400.00, 1.2750, 1.9833, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dd056a5e-34c6-4f6c-bf95-560dd920ff75', 'Phrozen', 'Sonic Mighty 8K', 'RESIN', 6500.00, 100.00, 218.00, 123.00, 235.00, 0.9750, 1.5167, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0f4b2e7c-c258-49e7-ae95-aae4914ce06d', 'Phrozen', 'Sonic Mighty Revo 14K', 'RESIN', 13198.00, 130.00, 223.00, 126.00, 220.00, 1.9797, 3.0795, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('06a620bf-ddb1-4fa7-a5b8-122b77eccfe5', 'Phrozen', 'Sonic CS+', 'RESIN', 49998.00, 200.00, 192.00, 120.00, 246.00, 7.4997, 11.6662, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c305f4f0-2e59-40ec-baf2-5666ca7c6a88', 'Qidi Tech', 'X-Max 3', 'FDM', 5500.00, 500.00, 325.00, 325.00, 315.00, 0.4950, 0.8250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('0e897902-af30-453a-afd8-0c3f42dd58e5', 'Qidi Tech', 'X-Plus 3', 'FDM', 4420.00, 400.00, 280.00, 280.00, 270.00, 0.3978, 0.6630, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('4a2d01d0-c1ee-403b-a2e5-50dff47073d0', 'Qidi Tech', 'Q1 Pro', 'FDM', 3900.00, 350.00, 200.00, 200.00, 200.00, 0.3510, 0.5850, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('90d27507-512c-4882-90cb-fea82c24e143', 'Qidi Tech', 'X-CF Pro', 'FDM', 6800.00, 500.00, 300.00, 260.00, 300.00, 0.6120, 1.0200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8ce19cd9-20ea-4c9d-83ef-0ba5c9c047fd', 'Flashforge', 'Adventurer 5M', 'FDM', 2900.00, 350.00, 220.00, 220.00, 220.00, 0.2610, 0.4350, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('50f47573-4613-41c5-9895-969cda584675', 'Flashforge', 'Adventurer 5M Pro', 'FDM', 3800.00, 350.00, 220.00, 220.00, 220.00, 0.3420, 0.5700, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3d8fb832-3368-446a-8e2f-fe7ca263cecc', 'Flashforge', 'AD5X', 'FDM', 4500.00, 350.00, 220.00, 220.00, 220.00, 0.4050, 0.6750, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('77ff5f0f-6d7c-4e2d-8900-39eb3facba84', 'Flashforge', 'Guider 3 Ultra', 'FDM', 8200.00, 500.00, 300.00, 300.00, 300.00, 0.7380, 1.2300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('49c0fdeb-6c52-48e4-afb0-b213f6941fca', 'Sovol', 'SV06', 'FDM', 1500.00, 220.00, 220.00, 220.00, 250.00, 0.1350, 0.2250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b70ca00f-4ec6-4424-b27f-b70f9615f890', 'Sovol', 'SV06 Plus', 'FDM', 2400.00, 350.00, 300.00, 300.00, 340.00, 0.2160, 0.3600, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ae1c68d3-6eee-4ed2-90b5-c4ee1c0c87a6', 'Sovol', 'SV07 Plus', 'FDM', 3200.00, 350.00, 300.00, 300.00, 330.00, 0.2880, 0.4800, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('8ff8dee7-3569-4f8c-8d5d-62a0de07a1ec', 'Sovol', 'SV08', 'FDM', 3740.00, 500.00, 350.00, 350.00, 345.00, 0.3366, 0.5610, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ac83b7b7-1aad-4bc1-a145-08766f07a2fa', 'Artillery', 'Sidewinder X3 Plus', 'FDM', 2400.00, 350.00, 300.00, 300.00, 350.00, 0.2160, 0.3600, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3ca26bbd-1590-4a05-8d22-bff25ff72e44', 'Artillery', 'Genius Pro', 'FDM', 1900.00, 350.00, 220.00, 220.00, 250.00, 0.1710, 0.2850, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ddc88112-f51b-4123-af87-a8dfaccc5df3', 'Artillery', 'Hornet S', 'FDM', 1200.00, 220.00, 220.00, 220.00, 250.00, 0.1080, 0.1800, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('6c6a0794-ba30-43a8-9fc2-620596cc2045', 'Artillery', 'Sidewinder X4 Plus', 'FDM', 3100.00, 350.00, 300.00, 300.00, 350.00, 0.2790, 0.4650, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('252675cb-8afb-48bf-890b-75e3ea5bc823', 'Voxelab', 'Aquila X3', 'FDM', 1100.00, 350.00, 220.00, 220.00, 250.00, 0.0990, 0.1650, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('7290e9b7-32a0-4da9-9872-101a8a68a382', 'Voxelab', 'Aquila S3', 'FDM', 1300.00, 350.00, 220.00, 220.00, 280.00, 0.1170, 0.1950, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ffa2b59b-a633-4cf3-a33f-c79aed594159', 'Voxelab', 'Aries', 'FDM', 2900.00, 350.00, 220.00, 220.00, 250.00, 0.2610, 0.4350, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fe51bfd7-bc7e-478f-846d-20aca9e204de', 'Voxelab', 'Polaris', 'RESIN', 1700.00, 60.00, 143.00, 89.00, 165.00, 0.2550, 0.3967, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('15529031-4bf3-4ed9-b0b2-83a2041a7189', 'Peopoly', 'Phenom', 'RESIN', 9500.00, 200.00, 276.00, 155.00, 400.00, 1.4250, 2.2167, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0e81b5e-b977-4a65-9619-580af7d1f4b5', 'Peopoly', 'Phenom L', 'RESIN', 12000.00, 220.00, 343.00, 192.00, 400.00, 1.8000, 2.8000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('170e63e7-ceb8-4a70-b9fa-ac6b9d39a510', 'Peopoly', 'Phenom Forge', 'RESIN', 15500.00, 250.00, 270.00, 150.00, 400.00, 2.3250, 3.6167, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('2a6de3fc-c87c-4df8-8336-dfdc99d6fe6d', 'Peopoly', 'Phenom XXL Plus', 'RESIN', 26000.00, 320.00, 525.00, 295.00, 400.00, 3.9000, 6.0667, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- machines: novo campo "price" (valor da impressora, substitui a entrada
-- direta de depreciacao no formulario) e "maintenance_cost_per_hour"
-- (segunda variavel de custo horario, ao lado da depreciacao ja existente).
ALTER TABLE "machines"
  ADD COLUMN "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "maintenance_cost_per_hour" DECIMAL(10,4) NOT NULL DEFAULT 0;

-- Backfill de maquinas ja cadastradas: reconstroi um "price" plausivel a
-- partir da depreciation_cost_per_hour ja existente (formula invertida),
-- depois calcula a manutencao a partir desse price — mesmas formulas do
-- catalogo. Feito em dois passos porque um UPDATE nao pode ler o valor que
-- ele mesmo acabou de escrever em outra coluna na mesma instrucao.
UPDATE "machines" SET "price" = CASE "type"
  WHEN 'FDM' THEN ROUND("depreciation_cost_per_hour" * 10000 / 0.9, 2)
  ELSE ROUND("depreciation_cost_per_hour" * 6000 / 0.9, 2)
END;

UPDATE "machines" SET "maintenance_cost_per_hour" = CASE "type"
  WHEN 'FDM' THEN ROUND("price" * 0.3 / 2000, 4)
  ELSE ROUND("price" * 0.35 / 1500, 4)
END;

-- print_items: nova linha de custo "manutencao", ao lado da depreciacao ja
-- existente no snapshot. Itens historicos ficam com 0 (esse conceito nao
-- existia quando esses orcamentos foram calculados).
ALTER TABLE "print_items" ADD COLUMN "maintenance_cost" DECIMAL(12,2) NOT NULL DEFAULT 0;
