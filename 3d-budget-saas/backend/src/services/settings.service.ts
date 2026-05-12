import type {
  CustomVariableDefinition,
  CustomVariableMap,
  ProductionSettings,
} from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { ProductionSettingsInput } from "../validators/resources.validator";

interface ExtraFees {
  energyCostPerKwh?: number;
  cardFeePercent?: number;
  administrativeFeePercent?: number;
  customVariables?: unknown;
}

const DEFAULT_SETTINGS: ProductionSettings = {
  desiredMarginPercent: 30,
  technicalHourRate: 0,
  energyCostPerKwh: 0,
  cardFeePercent: 0,
  administrativeFeePercent: 0,
  customVariables: {},
};

const CUSTOM_VARIABLE_TYPES = ["INTEGER", "FLOAT", "PERCENTAGE"] as const;

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

const parseExtraFees = (value: Prisma.JsonValue): ExtraFees => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as ExtraFees;
};

const isCustomVariableType = (
  value: unknown,
): value is CustomVariableDefinition["type"] =>
  typeof value === "string" &&
  CUSTOM_VARIABLE_TYPES.includes(
    value as CustomVariableDefinition["type"],
  );

const normalizeCustomVariables = (
  customVariables: ExtraFees["customVariables"],
): CustomVariableMap => {
  if (!customVariables || typeof customVariables !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(customVariables).flatMap(([name, rawVariable]) => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        return [];
      }

      if (typeof rawVariable === "number" && Number.isFinite(rawVariable)) {
        return [[name, { value: rawVariable, type: "FLOAT" as const }]];
      }

      if (!rawVariable || typeof rawVariable !== "object") {
        return [];
      }

      const candidate = rawVariable as {
        value?: unknown;
        type?: unknown;
      };
      const value =
        typeof candidate.value === "number" ? candidate.value : Number(candidate.value);

      if (!Number.isFinite(value)) {
        return [];
      }

      const type = isCustomVariableType(candidate.type)
        ? candidate.type
        : "FLOAT";

      if (type === "INTEGER" && !Number.isInteger(value)) {
        return [];
      }

      return [[name, { value, type }]];
    }),
  );
};

export const customVariablesToRuntimeValues = (
  customVariables: CustomVariableMap,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(customVariables).map(([name, variable]) => [
      name,
      variable.type === "PERCENTAGE" ? variable.value / 100 : variable.value,
    ]),
  );

const toExtraFeesJson = ({
  energyCostPerKwh,
  cardFeePercent,
  administrativeFeePercent,
  customVariables,
}: {
  energyCostPerKwh: number;
  cardFeePercent: number;
  administrativeFeePercent: number;
  customVariables: CustomVariableMap;
}): Prisma.InputJsonObject =>
  ({
    energyCostPerKwh,
    cardFeePercent,
    administrativeFeePercent,
    customVariables,
  }) as unknown as Prisma.InputJsonObject;

const toSettingsResponse = (settings: {
  desiredMarginPercent: Prisma.Decimal;
  technicalHourRate: Prisma.Decimal;
  extraFees: Prisma.JsonValue;
}): ProductionSettings => {
  const extraFees = parseExtraFees(settings.extraFees);

  return {
    desiredMarginPercent: toNumber(settings.desiredMarginPercent),
    technicalHourRate: toNumber(settings.technicalHourRate),
    energyCostPerKwh:
      extraFees.energyCostPerKwh ?? DEFAULT_SETTINGS.energyCostPerKwh,
    cardFeePercent:
      extraFees.cardFeePercent ?? DEFAULT_SETTINGS.cardFeePercent,
    administrativeFeePercent:
      extraFees.administrativeFeePercent ??
      DEFAULT_SETTINGS.administrativeFeePercent,
    customVariables: normalizeCustomVariables(extraFees.customVariables),
  };
};

export class SettingsService {
  async get(companyId: string): Promise<ProductionSettings> {
    const settings = await prisma.pricingSettings.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        desiredMarginPercent: DEFAULT_SETTINGS.desiredMarginPercent,
        technicalHourRate: DEFAULT_SETTINGS.technicalHourRate,
        extraFees: toExtraFeesJson(DEFAULT_SETTINGS),
      },
    });

    return toSettingsResponse(settings);
  }

  async save(
    companyId: string,
    input: ProductionSettingsInput,
  ): Promise<ProductionSettings> {
    const current = await this.get(companyId);
    const customVariables = input.customVariables ?? current.customVariables;
    const settings = await prisma.pricingSettings.upsert({
      where: { companyId },
      update: {
        desiredMarginPercent: input.desiredMarginPercent,
        technicalHourRate: input.technicalHourRate,
        extraFees: toExtraFeesJson({
          energyCostPerKwh: input.energyCostPerKwh,
          cardFeePercent: input.cardFeePercent,
          administrativeFeePercent: input.administrativeFeePercent,
          customVariables,
        }),
      },
      create: {
        companyId,
        desiredMarginPercent: input.desiredMarginPercent,
        technicalHourRate: input.technicalHourRate,
        extraFees: toExtraFeesJson({
          energyCostPerKwh: input.energyCostPerKwh,
          cardFeePercent: input.cardFeePercent,
          administrativeFeePercent: input.administrativeFeePercent,
          customVariables,
        }),
      },
    });

    return toSettingsResponse(settings);
  }
}

export const settingsService = new SettingsService();
