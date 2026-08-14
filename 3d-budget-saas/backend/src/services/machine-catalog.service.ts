import type { MachineCatalogResource } from "@3d-budget/shared";
import type { MachineCatalog, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

const toMachineCatalogResource = (
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
}

export const machineCatalogService = new MachineCatalogService();
