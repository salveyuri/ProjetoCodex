import type { MachineResource, MachineType } from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { cacheService, companyAnalyticsCacheKeyPrefix } from "./cache.service";
import type {
  MachineInput,
  MachineUpdateInput,
} from "../validators/resources.validator";

type OwnedMachineForUpdate = {
  id: string;
  price: Prisma.Decimal;
  type: MachineType;
};

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

// FDM: depreciacao = (valor * 0.9) / 10.000 | manutencao = (valor * 0.3) / 2.000
// SLA/Resina: depreciacao = (valor * 0.9) / 6.000 | manutencao = (valor * 0.35) / 1.500
// Formulas fornecidas pelo Yuri — ver Contextos/Decisoes.md. Nunca aceitas
// direto do cliente: sempre recalculadas aqui a partir de price+type, mesmo
// padrao de Material.costPerGram (derivado de purchasePrice/totalWeightGrams).
const resolveMachineHourlyCosts = (
  price: number,
  type: MachineType,
): { depreciationCostPerHour: number; maintenanceCostPerHour: number } => {
  if (type === "FDM") {
    return {
      depreciationCostPerHour: (price * 0.9) / 10000,
      maintenanceCostPerHour: (price * 0.3) / 2000,
    };
  }

  return {
    depreciationCostPerHour: (price * 0.9) / 6000,
    maintenanceCostPerHour: (price * 0.35) / 1500,
  };
};

const toMachineResource = (machine: {
  id: string;
  name: string;
  type: MachineType;
  printVolumeXmm: Prisma.Decimal;
  printVolumeYmm: Prisma.Decimal;
  printVolumeZmm: Prisma.Decimal;
  price: Prisma.Decimal;
  depreciationCostPerHour: Prisma.Decimal;
  maintenanceCostPerHour: Prisma.Decimal;
  powerConsumptionKw: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): MachineResource => {
  const powerConsumptionKw = toNumber(machine.powerConsumptionKw);

  return {
    id: machine.id,
    name: machine.name,
    type: machine.type,
    printVolumeXmm: toNumber(machine.printVolumeXmm),
    printVolumeYmm: toNumber(machine.printVolumeYmm),
    printVolumeZmm: toNumber(machine.printVolumeZmm),
    price: toNumber(machine.price),
    depreciationCostPerHour: toNumber(machine.depreciationCostPerHour),
    maintenanceCostPerHour: toNumber(machine.maintenanceCostPerHour),
    powerConsumptionKw,
    powerConsumptionWatts: Number((powerConsumptionKw * 1000).toFixed(2)),
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
  };
};

const toMachineCreateData = (
  companyId: string,
  input: MachineInput,
): Prisma.MachineUncheckedCreateInput => {
  const { depreciationCostPerHour, maintenanceCostPerHour } =
    resolveMachineHourlyCosts(input.price, input.type);

  return {
    companyId,
    name: input.name,
    type: input.type,
    printVolumeXmm: input.printVolumeXmm,
    printVolumeYmm: input.printVolumeYmm,
    printVolumeZmm: input.printVolumeZmm,
    price: input.price,
    depreciationCostPerHour,
    maintenanceCostPerHour,
    powerConsumptionKw: input.powerConsumptionWatts / 1000,
  };
};

// input here is always "normalized": price/type already fall back to the
// machine's current values when not part of this particular PATCH, so the
// derived costs are recomputed correctly even when only one of the two
// changed (e.g. switching FDM -> RESIN without touching price).
const toMachineUpdateData = (
  input: MachineUpdateInput & { price: number; type: MachineType },
): Prisma.MachineUncheckedUpdateInput => {
  const { depreciationCostPerHour, maintenanceCostPerHour } =
    resolveMachineHourlyCosts(input.price, input.type);
  const data: Prisma.MachineUncheckedUpdateInput = {
    price: input.price,
    depreciationCostPerHour,
    maintenanceCostPerHour,
  };

  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.printVolumeXmm !== undefined) {
    data.printVolumeXmm = input.printVolumeXmm;
  }
  if (input.printVolumeYmm !== undefined) {
    data.printVolumeYmm = input.printVolumeYmm;
  }
  if (input.printVolumeZmm !== undefined) {
    data.printVolumeZmm = input.printVolumeZmm;
  }
  if (input.powerConsumptionWatts !== undefined) {
    data.powerConsumptionKw = input.powerConsumptionWatts / 1000;
  }

  return data;
};

// "Access denied." on purpose: doesn't confirm a company-ownership check
// is what rejected this — see Contextos/Conhecimento.md.
const throwMachineForbidden = (): never => {
  throw new AppError("Access denied.", 403, "MACHINE_FORBIDDEN");
};

export class MachineService {
  async list(companyId: string): Promise<MachineResource[]> {
    const machines = await prisma.machine.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    return machines.map(toMachineResource);
  }

  async create(
    companyId: string,
    input: MachineInput,
  ): Promise<MachineResource> {
    const machine = await prisma.machine.create({
      data: toMachineCreateData(companyId, input),
    });

    cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId));
    return toMachineResource(machine);
  }

  async update(
    companyId: string,
    machineId: string,
    input: MachineUpdateInput,
  ): Promise<MachineResource> {
    const existing = await this.ensureOwnership(companyId, machineId);
    const normalizedInput = {
      ...input,
      price: input.price ?? toNumber(existing.price),
      type: input.type ?? existing.type,
    };

    const [updateResult, machine] = await prisma.$transaction([
      prisma.machine.updateMany({
        where: { id: machineId, companyId },
        data: toMachineUpdateData(normalizedInput),
      }),
      prisma.machine.findFirst({
        where: { id: machineId, companyId },
      }),
    ]);

    if (updateResult.count !== 1) {
      throwMachineForbidden();
    }

    if (machine === null) {
      throwMachineForbidden();
    }

    cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId));
    return toMachineResource(machine as Parameters<typeof toMachineResource>[0]);
  }

  async delete(companyId: string, machineId: string): Promise<void> {
    try {
      const result = await prisma.machine.deleteMany({
        where: { id: machineId, companyId },
      });

      if (result.count !== 1) {
        throwMachineForbidden();
      }

      cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new AppError(
          "Machine is already used by quote items.",
          409,
          "MACHINE_IN_USE",
        );
      }

      throw error;
    }
  }

  private async ensureOwnership(
    companyId: string,
    machineId: string,
  ): Promise<OwnedMachineForUpdate> {
    const machine = await prisma.machine.findFirst({
      where: { id: machineId, companyId },
      select: { id: true, price: true, type: true },
    });

    if (machine === null) {
      throwMachineForbidden();
    }

    return machine as OwnedMachineForUpdate;
  }
}

export const machineService = new MachineService();
