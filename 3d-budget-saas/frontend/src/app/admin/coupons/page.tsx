"use client";

import type { CouponPayload, CouponResource, CouponType } from "@3d-budget/shared";
import axios from "axios";
import {
  Edit3,
  Plus,
  RefreshCcw,
  Save,
  ShieldAlert,
  Tag,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

type ModalState =
  | { mode: "create"; item?: undefined }
  | { mode: "edit"; item: CouponResource }
  | null;

interface CouponFormState {
  code: string;
  discountPercent: string;
  type: CouponType;
  isActive: boolean;
}

interface ToastState {
  tone: "success" | "danger";
  message: string;
}

const emptyCouponForm: CouponFormState = {
  code: "",
  discountPercent: "10",
  type: "RECURRING",
  isActive: true,
};

const toCouponForm = (coupon: CouponResource): CouponFormState => ({
  code: coupon.code,
  discountPercent: String(coupon.discountPercent),
  type: coupon.type,
  isActive: coupon.isActive,
});

const toPayload = (form: CouponFormState): CouponPayload => ({
  code: form.code.trim().toUpperCase(),
  discountPercent: Number(form.discountPercent),
  type: form.type,
  isActive: form.isActive,
});

const couponTypeLabel = (type: CouponType): string =>
  type === "ONE_TIME" ? "Uso unico (1o mes)" : "Recorrente (sempre)";

export default function AdminCouponsPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [coupons, setCoupons] = useState<CouponResource[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<CouponFormState>(emptyCouponForm);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const loadCoupons = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAccessDenied(false);

    try {
      const { data } = await api.get<CouponResource[]>("/admin/coupons");
      setCoupons(data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        showToast({
          tone: "danger",
          message: getApiErrorMessage(error, "Nao foi possivel carregar os cupons."),
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [showToast, token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void (async () => {
        if (token) {
          await refreshUser();
        }

        await loadCoupons();
      })();
    }
  }, [isAuthLoading, loadCoupons, refreshUser, token]);

  const openModal = (coupon?: CouponResource) => {
    setForm(coupon ? toCouponForm(coupon) : emptyCouponForm);
    setModal(coupon ? { mode: "edit", item: coupon } : { mode: "create" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    const payload = toPayload(form);

    try {
      if (modal?.mode === "edit") {
        const { data } = await api.patch<CouponResource>(
          `/admin/coupons/${modal.item.id}`,
          payload,
        );
        setCoupons((current) =>
          current.map((coupon) => (coupon.id === data.id ? data : coupon)),
        );
      } else {
        const { data } = await api.post<CouponResource>("/admin/coupons", payload);
        setCoupons((current) => [data, ...current]);
      }

      setModal(null);
      showToast({ tone: "success", message: "Cupom salvo." });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel salvar o cupom."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (coupon: CouponResource) => {
    try {
      const { data } = await api.patch<CouponResource>(`/admin/coupons/${coupon.id}`, {
        isActive: !coupon.isActive,
      });
      setCoupons((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
      showToast({
        tone: "success",
        message: data.isActive ? "Cupom ativado." : "Cupom desativado.",
      });
    } catch (error) {
      showToast({
        tone: "danger",
        message: getApiErrorMessage(error, "Nao foi possivel atualizar o cupom."),
      });
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Admin</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Cupons de desconto
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Crie codigos de desconto para assinaturas. Quem assinar com um cupom
              ativo paga o valor com desconto em todas as cobrancas seguintes,
              enquanto a assinatura durar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCoupons()}
            disabled={!token}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </button>
        </section>

        {isAccessDenied ? (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-1 h-5 w-5 text-warning" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">Acesso restrito</h2>
                <p className="mt-2 text-sm text-muted">
                  Voce nao tem permissao para acessar esta area.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {!isAccessDenied ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border p-5">
              <div className="flex items-center gap-3">
                <Tag className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Cupons cadastrados
                  </h2>
                  <p className="text-sm text-muted">{coupons.length} cupons.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Novo cupom
              </button>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-4"
                  >
                    <SkeletonText className="w-44" />
                    <SkeletonText className="w-28" />
                    <SkeletonText className="w-32" />
                  </div>
                ))}
              </div>
            ) : coupons.length === 0 ? (
              <p className="p-5 text-sm text-muted">Nenhum cupom cadastrado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-background text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3">Codigo</th>
                      <th className="px-5 py-3">Desconto</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3">Em uso</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {coupons.map((coupon) => (
                      <tr key={coupon.id} className="bg-surface/40">
                        <td className="px-5 py-4">
                          <p className="font-mono font-medium text-foreground">
                            {coupon.code}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-muted">
                          -{coupon.discountPercent}%
                        </td>
                        <td className="px-5 py-4 text-muted">
                          {couponTypeLabel(coupon.type)}
                        </td>
                        <td className="px-5 py-4 text-muted">
                          {coupon.usageCount}{" "}
                          {coupon.usageCount === 1 ? "empresa" : "empresas"}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => void toggleActive(coupon)}
                            title={coupon.isActive ? "Desativar" : "Ativar"}
                          >
                            <StatusBadge tone={coupon.isActive ? "success" : "danger"}>
                              {coupon.isActive ? "Ativo" : "Inativo"}
                            </StatusBadge>
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            title="Editar"
                            aria-label="Editar"
                            onClick={() => openModal(coupon)}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {modal ? (
        <Modal
          title={modal.mode === "edit" ? "Editar cupom" : "Novo cupom"}
          onClose={() => setModal(null)}
        >
          <form className="grid min-w-0 gap-4" onSubmit={handleSubmit}>
            <label className="grid min-w-0 gap-2 text-sm font-medium">
              Codigo
              <input
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="PROMO20"
                required
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 font-mono outline-none focus:border-primary"
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-medium">
              Percentual de desconto
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={form.discountPercent}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discountPercent: event.target.value,
                  }))
                }
                required
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-medium">
              Tipo de desconto
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as CouponType,
                  }))
                }
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface-muted px-3 outline-none focus:border-primary"
              >
                <option value="RECURRING">Recorrente - vale em toda cobranca</option>
                <option value="ONE_TIME">Uso unico - so no primeiro mes</option>
              </select>
            </label>
            {form.type === "ONE_TIME" ? (
              <p className="text-xs text-muted">
                A partir da segunda cobranca a assinatura volta pro preco cheio
                do plano automaticamente.
              </p>
            ) : null}
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                className="h-4 w-4 rounded border-border"
              />
              Cupom ativo
            </label>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              Salvar
            </button>
          </form>
        </Modal>
      ) : null}

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-panel",
            toast.tone === "success"
              ? "border-secondary/40 bg-secondary/10 text-secondary"
              : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </MainLayout>
  );
}

const Modal = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
    <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-panel sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          type="button"
          title="Fechar"
          aria-label="Fechar"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
