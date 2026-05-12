import type { MachineResource } from "@3d-budget/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error-handler";
import { cacheService } from "./cache.service";
import type {
  MachineInput,
  MachineUpdateInput,
} from "../validators/resources.validator";

const toNumber = (value: Prisma.Decimal): number => Number(value.toString());

const toMachineResource = (machine: {
  id: string;
  name: string;
  type: "FDM" | "RESIN";
  printVolumeXmm: Prisma.Decimal;
  printVolumeYmm: Prisma.Decimal;
  printVolumeZmm: Prisma.Decimal;
  depreciationCostPerHour: Prisma.Decimal;
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
    depreciationCostPerHour: toNumber(machine.depreciationCostPerHour),
    powerConsumptionKw,
    powerConsumptionWatts: Number((powerConsumptionKw * 1000).toFixed(2)),
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
  };
};

const toMachineCreateData = (
  companyId: string,
  input: MachineInput,
): Prisma.MachineUncheckedCreateInput => ({
  companyId,
  name: input.name,
  type: input.type,
  printVolumeXmm: input.printVolumeXmm,
  printVolumeYmm: input.printVolumeYmm,
  printVolumeZmm: input.printVolumeZmm,
  depreciationCostPerHour: input.depreciationCostPerHour,
  powerConsumptionKw: input.powerConsumptionWatts / 1000,
});

const toMachineUpdateData = (
  input: MachineUpdateInput,
): Prisma.MachineUncheckedUpdateInput => {
  const data: Prisma.MachineUncheckedUpdateInput = {};

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
  if (input.depreciationCostPerHour !== undefined) {
    data.depreciationCostPerHour = input.depreciationCostPerHour;
  }
  if (input.powerConsumptionWatts !== undefined) {
    data.powerConsumptionKw = input.powerConsumptionWatts / 1000;
  }

  return data;
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

    cacheService.flush();
    return toMachineResource(machine);
  }

  async update(
    companyId: string,
    machineId: string,
    input: MachineUpdateInput,
  ): Promise<MachineResource> {
    await this.ensureOwnership(companyId, machineId);

    const machine = await prisma.machine.update({
      where: { id: machineId },
      data: toMachineUpdateData(input),
    });

    cacheService.flush();
    return toMachineResource(machine);
  }

  async delete(companyId: string, machineId: string): Promise<void> {
    await this.ensureOwnership(companyId, machineId);

    try {
      await prisma.machine.delete({
        where: { id: machineId },
      });
      cacheService.flush();
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
  ): Promise<void> {
    const machine = await prisma.machine.findFirst({
      where: { id: machineId, companyId },
      select: { id: true },
    });

    if (!machine) {
      throw new AppError("Machine not found.", 404, "MACHINE_NOT_FOUND");
    }
  }
}

export const machineService = new MachineService();
