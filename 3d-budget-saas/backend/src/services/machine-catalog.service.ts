import type {
  MachineCatalogImportResult,
  MachineCatalogPayload,
  MachineCatalogResource,
} from "@3d-budget/shared";
import type { MachineCatalog } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import {
  machineCatalogCreateSchema,
  type MachineCatalogCreateInput,
  type MachineCatalogUpdateInput,
} from "../validators/machine-catalog.validator";

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

export const toMachineCatalogResource = (
  row: MachineCatalog,
): MachineCatalogResource => ({
  id: row.id,
  brand: row.brand,
  name: row.name,
  type: row.type,
  price: toNumber(row.price),
  powerConsumptionWatts: toNumber(row.powerConsumptionWatts),
  printVolumeXmm: toNumber(row.printVolumeXmm),
  printVolumeYmm: toNumber(row.printVolumeYmm),
  printVolumeZmm: toNumber(row.printVolumeZmm),
  depreciationCostPerHour: toNumber(row.depreciationCostPerHour),
  maintenanceCostPerHour: toNumber(row.maintenanceCostPerHour),
});

const toRowData = (
  input: MachineCatalogCreateInput | MachineCatalogPayload,
): Prisma.MachineCatalogCreateInput => ({
  brand: input.brand,
  name: input.name,
  type: input.type,
  price: new Prisma.Decimal(input.price),
  powerConsumptionWatts: new Prisma.Decimal(input.powerConsumptionWatts),
  printVolumeXmm: new Prisma.Decimal(input.printVolumeXmm),
  printVolumeYmm: new Prisma.Decimal(input.printVolumeYmm),
  printVolumeZmm: new Prisma.Decimal(input.printVolumeZmm),
  depreciationCostPerHour: new Prisma.Decimal(input.depreciationCostPerHour),
  maintenanceCostPerHour: new Prisma.Decimal(input.maintenanceCostPerHour),
});

const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// Small, fixed reference table (dezens of rows, not thousands) — a plain
// findMany with a result cap is plenty, no need for full-text search
// infrastructure for an autocomplete over ~60 rows.
const SEARCH_RESULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;

export class MachineCatalogService {
  async search(query: string): Promise<MachineCatalogResource[]> {
    if (query.length < MIN_QUERY_LENGTH) {
      return [];
    }

    const rows = await prisma.machineCatalog.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { brand: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ brand: "asc" }, { name: "asc" }],
      take: SEARCH_RESULT_LIMIT,
    });

    return rows.map(toMachineCatalogResource);
  }

  async listAll(): Promise<MachineCatalogResource[]> {
    const rows = await prisma.machineCatalog.findMany({
      orderBy: [{ brand: "asc" }, { name: "asc" }],
    });

    return rows.map(toMachineCatalogResource);
  }

  async getById(id: string): Promise<MachineCatalog> {
    const row = await prisma.machineCatalog.findUnique({ where: { id } });

    if (!row) {
      throw new AppError("Catalog entry not found.", 404, "MACHINE_CATALOG_NOT_FOUND");
    }

    return row;
  }

  async create(input: MachineCatalogCreateInput): Promise<MachineCatalogResource> {
    try {
      const row = await prisma.machineCatalog.create({ data: toRowData(input) });
      return toMachineCatalogResource(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new AppError(
          "A catalog entry with this brand and name already exists.",
          409,
          "MACHINE_CATALOG_CONFLICT",
        );
      }

      throw error;
    }
  }

  async update(
    id: string,
    input: MachineCatalogUpdateInput,
  ): Promise<MachineCatalogResource> {
    await this.getById(id);

    try {
      const row = await prisma.machineCatalog.update({
        where: { id },
        data: {
          ...(input.brand !== undefined ? { brand: input.brand } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}),
          ...(input.powerConsumptionWatts !== undefined
            ? { powerConsumptionWatts: new Prisma.Decimal(input.powerConsumptionWatts) }
            : {}),
          ...(input.printVolumeXmm !== undefined
            ? { printVolumeXmm: new Prisma.Decimal(input.printVolumeXmm) }
            : {}),
          ...(input.printVolumeYmm !== undefined
            ? { printVolumeYmm: new Prisma.Decimal(input.printVolumeYmm) }
            : {}),
          ...(input.printVolumeZmm !== undefined
            ? { printVolumeZmm: new Prisma.Decimal(input.printVolumeZmm) }
            : {}),
          ...(input.depreciationCostPerHour !== undefined
            ? { depreciationCostPerHour: new Prisma.Decimal(input.depreciationCostPerHour) }
            : {}),
          ...(input.maintenanceCostPerHour !== undefined
            ? { maintenanceCostPerHour: new Prisma.Decimal(input.maintenanceCostPerHour) }
            : {}),
        },
      });
      return toMachineCatalogResource(row);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new AppError(
          "A catalog entry with this brand and name already exists.",
          409,
          "MACHINE_CATALOG_CONFLICT",
        );
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await prisma.machineCatalog.delete({ where: { id } });
  }

  // Upsert by the same (brand, name) pair the unique constraint enforces —
  // re-uploading a corrected/updated catalog file is the whole point (see
  // Notas/TODO.md: catalog prices go stale over time), so a row that
  // already exists updates in place instead of failing as a duplicate.
  // Each row is validated and processed independently: one bad row (typo'd
  // number, missing column) is reported with its row number and skipped,
  // the rest of the file still imports.
  async importRows(
    rows: ReadonlyArray<Record<string, unknown>>,
  ): Promise<MachineCatalogImportResult> {
    const result: MachineCatalogImportResult = { created: 0, updated: 0, errors: [] };

    for (const [index, rawRow] of rows.entries()) {
      const parsed = machineCatalogCreateSchema.safeParse(rawRow);

      if (!parsed.success) {
        result.errors.push({
          row: index + 1,
          brand: typeof rawRow.brand === "string" ? rawRow.brand : "",
          name: typeof rawRow.name === "string" ? rawRow.name : "",
          message: parsed.error.issues.map((issue) => issue.message).join("; "),
        });
        continue;
      }

      const row = parsed.data;

      try {
        const existing = await prisma.machineCatalog.findUnique({
          where: { brand_name: { brand: row.brand, name: row.name } },
          select: { id: true },
        });

        await prisma.machineCatalog.upsert({
          where: { brand_name: { brand: row.brand, name: row.name } },
          create: toRowData(row),
          update: toRowData(row),
        });

        if (existing) {
          result.updated += 1;
        } else {
          result.created += 1;
        }
      } catch (error) {
        result.errors.push({
          row: index + 1,
          brand: row.brand,
          name: row.name,
          message: error instanceof Error ? error.message : "Unknown error.",
        });
      }
    }

    return result;
  }
}

export const machineCatalogService = new MachineCatalogService();
