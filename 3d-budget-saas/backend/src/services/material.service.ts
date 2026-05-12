import type { MaterialResource } from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { cacheService } from "./cache.service";
import type {
  MaterialInput,
  MaterialUpdateInput,
} from "../validators/resources.validator";

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

const toMaterialResource = (material: {
  id: string;
  brand: string;
  type: "FILAMENT" | "RESIN" | "POWDER" | "OTHER";
  color: string;
  totalWeightGrams: Prisma.Decimal;
  costPerGram: Prisma.Decimal;
  density: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): MaterialResource => {
  const totalWeightGrams = toNumber(material.totalWeightGrams);
  const costPerGram = toNumber(material.costPerGram);

  return {
    id: material.id,
    brand: material.brand,
    type: material.type,
    color: material.color,
    totalWeightGrams,
    purchasePrice: Number((totalWeightGrams * costPerGram).toFixed(2)),
    costPerGram,
    density: toNumber(material.density),
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
  };
};

const resolveCostPerGram = (
  purchasePrice: number | undefined,
  totalWeightGrams: number | undefined,
): number | undefined => {
  if (purchasePrice === undefined || totalWeightGrams === undefined) {
    return undefined;
  }

  return totalWeightGrams > 0 ? purchasePrice / totalWeightGrams : 0;
};

const toMaterialCreateData = (
  companyId: string,
  input: MaterialInput,
): Prisma.MaterialUncheckedCreateInput => ({
  companyId,
  brand: input.brand,
  type: input.type,
  color: input.color,
  totalWeightGrams: input.totalWeightGrams,
  costPerGram: input.purchasePrice / input.totalWeightGrams,
  density: input.density,
});

const toMaterialUpdateData = (
  input: MaterialUpdateInput,
): Prisma.MaterialUncheckedUpdateInput => {
  const costPerGram = resolveCostPerGram(
    input.purchasePrice,
    input.totalWeightGrams,
  );
  const data: Prisma.MaterialUncheckedUpdateInput = {};

  if (input.brand !== undefined) data.brand = input.brand;
  if (input.type !== undefined) data.type = input.type;
  if (input.color !== undefined) data.color = input.color;
  if (input.totalWeightGrams !== undefined) {
    data.totalWeightGrams = input.totalWeightGrams;
  }
  if (costPerGram !== undefined) data.costPerGram = costPerGram;
  if (input.density !== undefined) data.density = input.density;

  return data;
};

export class MaterialService {
  async list(companyId: string): Promise<MaterialResource[]> {
    const materials = await prisma.material.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    return materials.map(toMaterialResource);
  }

  async create(
    companyId: string,
    input: MaterialInput,
  ): Promise<MaterialResource> {
    const material = await prisma.material.create({
      data: toMaterialCreateData(companyId, input),
    });

    cacheService.flush();
    return toMaterialResource(material);
  }

  async update(
    companyId: string,
    materialId: string,
    input: MaterialUpdateInput,
  ): Promise<MaterialResource> {
    const existing = await this.ensureOwnership(companyId, materialId);
    const normalizedInput = {
      ...input,
      purchasePrice:
        input.purchasePrice ??
        Number(
          (
            toNumber(existing.totalWeightGrams) * toNumber(existing.costPerGram)
          ).toFixed(2),
        ),
      totalWeightGrams:
        input.totalWeightGrams ?? toNumber(existing.totalWeightGrams),
    };

    const material = await prisma.material.update({
      where: { id: materialId },
      data: toMaterialUpdateData(normalizedInput),
    });

    cacheService.flush();
    return toMaterialResource(material);
  }

  async delete(companyId: string, materialId: string): Promise<void> {
    await this.ensureOwnership(companyId, materialId);

    try {
      await prisma.material.delete({
        where: { id: materialId },
      });
      cacheService.flush();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new AppError(
          "Material is already used by quote items.",
          409,
          "MATERIAL_IN_USE",
        );
      }

      throw error;
    }
  }

  private async ensureOwnership(companyId: string, materialId: string) {
    const material = await prisma.material.findFirst({
      where: { id: materialId, companyId },
      select: {
        id: true,
        totalWeightGrams: true,
        costPerGram: true,
      },
    });

    if (!material) {
      throw new AppError("Material not found.", 404, "MATERIAL_NOT_FOUND");
    }

    return material;
  }
}

export const materialService = new MaterialService();
