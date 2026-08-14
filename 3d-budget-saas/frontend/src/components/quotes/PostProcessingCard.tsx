"use client";

import { Paintbrush, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NumberField } from "./QuoteFormFields";

interface PostProcessingCardProps {
  paintingHours: string;
  finishingHours: string;
  disabled?: boolean;
  onChangePaintingHours: (value: string) => void;
  onChangeFinishingHours: (value: string) => void;
}

export const PostProcessingCard = ({
  paintingHours,
  finishingHours,
  disabled,
  onChangePaintingHours,
  onChangeFinishingHours,
}: PostProcessingCardProps) => (
  <Card className="overflow-hidden p-5">
    <div className="flex items-start gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Wrench className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Pos-processamento
        </h2>
        <p className="mt-1 text-sm text-muted">
          Essas horas alimentam os tokens de formula do orcamento inteiro.
        </p>
      </div>
    </div>

    <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
      <NumberField
        icon={Paintbrush}
        label="Horas pintura"
        suffix="h"
        value={paintingHours}
        onChange={onChangePaintingHours}
        disabled={disabled}
      />
      <NumberField
        icon={Wrench}
        label="Horas acabamento"
        suffix="h"
        value={finishingHours}
        onChange={onChangeFinishingHours}
        disabled={disabled}
      />
    </div>
  </Card>
);
