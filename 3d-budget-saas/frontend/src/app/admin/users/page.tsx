"use client";

import type {
  AdminUserResource,
  AdminUserUpdatePayload,
  PlanResource,
  SubscriptionStatus,
  UserRole,
} from "@3d-budget/shared";
import axios from "axios";
import {
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

const roleOptions: UserRole[] = ["USER", "ADMIN"];
const statusOptions: SubscriptionStatus[] = ["ACTIVE", "CANCELED", "PAST_DUE"];

const statusLabels = {
  ACTIVE: "Ativo",
  CANCELED: "Cancelado",
  PAST_DUE: "Inadimplente",
} as const;

export default function AdminUsersPage() {
  const { isLoading: isAuthLoading, token, refreshUser } = useAuth();
  const [users, setUsers] = useState<AdminUserResource[]>([]);
  const [plans, setPlans] = useState<PlanResource[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsAccessDenied(false);

    try {
      const [usersResponse, plansResponse] = await Promise.all([
        api.get<AdminUserResource[]>("/admin/users"),
        api.get<PlanResource[]>("/admin/plans"),
      ]);
      setUsers(usersResponse.data);
      setPlans(plansResponse.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setIsAccessDenied(true);
      } else {
        setErrorMessage(getApiErrorMessage(error, "Nao foi possivel carregar usuarios."));
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthLoading) {
      void (async () => {
        if (token) {
          await refreshUser();
        }

        await loadUsers();
      })();
    }
  }, [isAuthLoading, loadUsers, refreshUser, token]);

  const patchUser = async (
    targetUser: AdminUserResource,
    payload: AdminUserUpdatePayload,
  ) => {
    setUpdatingUserId(targetUser.id);
    setMessage(null);
    setErrorMessage(null);

    try {
      const { data } = await api.patch<AdminUserResource>(
        `/admin/users/${targetUser.id}`,
        payload,
      );
      setUsers((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
      setMessage(`Usuario ${data.email} atualizado.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel carregar usuarios."));
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-surface/75 p-5 lg:flex-row lg:items-end">
          <div>
            <StatusBadge tone="success">Admin</StatusBadge>
            <h1 className="mt-4 text-3xl font-semibold text-foreground">
              Usuarios e planos
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted">
              Ajuste roles, status da conta e plano contratado sem depender do gateway real.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
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
                <h2 className="text-xl font-semibold text-foreground">
                  Acesso restrito
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Voce nao tem permissao para acessar esta area.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {errorMessage ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-secondary">
            {message}
          </div>
        ) : null}

        {!isAccessDenied ? (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border p-5">
              <UsersRound className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Base de usuarios
                </h2>
                <p className="text-sm text-muted">
                  {users.length} contas carregadas.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-4"
                  >
                    <SkeletonText className="w-44" />
                    <SkeletonText className="w-28" />
                    <SkeletonText className="w-32" />
                    <Skeleton className="h-10" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border bg-background text-xs uppercase text-muted">
                    <tr>
                      <th className="px-5 py-3">Usuario</th>
                      <th className="px-5 py-3">Empresa</th>
                      <th className="px-5 py-3">Uso</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Plano</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Conta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((item) => (
                      <tr key={item.id} className="bg-surface/40">
                        <td className="px-5 py-4">
                          <p className="font-medium text-foreground">
                            {item.email}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Criado em {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-muted">
                          {item.company?.name ?? "Sem empresa"}
                        </td>
                        <td className="px-5 py-4 text-muted">
                          {item.company ? (
                            <div className="grid gap-1">
                              <span>
                                Maq. {item.company.usage.machines.used}/
                                {item.company.usage.machines.limit ?? "ilimitado"}
                              </span>
                              <span>
                                Mat. {item.company.usage.materials.used}/
                                {item.company.usage.materials.limit ?? "ilimitado"}
                              </span>
                              <span>
                                Orc. {item.company.usage.monthlyQuotes.used}/
                                {item.company.usage.monthlyQuotes.limit ?? "ilimitado"}
                              </span>
                            </div>
                          ) : (
                            "--"
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <SelectControl
                            value={item.role}
                            disabled={updatingUserId === item.id}
                            onChange={(value) =>
                              void patchUser(item, { role: value as UserRole })
                            }
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </SelectControl>
                        </td>
                        <td className="px-5 py-4">
                          <SelectControl
                            value={item.company?.planId ?? ""}
                            disabled={!item.company || updatingUserId === item.id}
                            onChange={(value) =>
                              void patchUser(item, { planId: value })
                            }
                          >
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name}
                              </option>
                            ))}
                          </SelectControl>
                        </td>
                        <td className="px-5 py-4">
                          <SelectControl
                            value={item.company?.subscriptionStatus ?? "ACTIVE"}
                            disabled={!item.company || updatingUserId === item.id}
                            onChange={(value) =>
                              void patchUser(item, {
                                subscriptionStatus:
                                  value as SubscriptionStatus,
                              })
                            }
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status]}
                              </option>
                            ))}
                          </SelectControl>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            disabled={updatingUserId === item.id}
                            onClick={() =>
                              void patchUser(item, {
                                isActive: !item.isActive,
                              })
                            }
                            className={cn(
                              "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                              item.isActive
                                ? "border-secondary/40 text-secondary hover:bg-secondary/10"
                                : "border-danger/40 text-danger hover:bg-danger/10",
                            )}
                          >
                            {item.isActive ? (
                              <ShieldCheck className="h-4 w-4" />
                            ) : (
                              <UserCog className="h-4 w-4" />
                            )}
                            {item.isActive ? "Ativa" : "Inativa"}
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
    </MainLayout>
  );
}

const SelectControl = ({
  value,
  disabled,
  children,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
  onChange: (value: string) => void;
}) => (
  <select
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    className="min-h-10 w-full min-w-32 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </select>
);
