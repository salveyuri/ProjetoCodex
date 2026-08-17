"use client";

import { Paintbrush, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
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
}: PostProcessingCardProps) => {
  const { t } = useLanguage();

  return (
    <Card className="overflow-hidden p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("quotes.postProcessingTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("quotes.postProcessingSubtitle")}</p>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
        <NumberField
          icon={Wrench}
          label={t("quotes.finishingHours")}
          suffix="h"
          value={finishingHours}
          onChange={onChangeFinishingHours}
          disabled={disabled}
        />
        <NumberField
          icon={Paintbrush}
          label={t("quotes.paintingHours")}
          suffix="h"
          value={paintingHours}
          onChange={onChangePaintingHours}
          disabled={disabled}
        />
      </div>
    </Card>
  );
};
