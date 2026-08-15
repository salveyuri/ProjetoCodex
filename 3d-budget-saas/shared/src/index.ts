export type OverallServiceStatus = "ok" | "degraded";

export type DatabaseHealthStatus = "connected" | "unavailable";
export type CalculationHealthStatus = "ok" | "degraded";
export type FilesystemHealthStatus = "writable" | "unavailable";

export interface HealthCheckResponse {
  status: OverallServiceStatus;
  timestamp: string;
  uptimeSeconds: number;
  server: {
    status: "online";
  };
  database: {
    status: DatabaseHealthStatus;
    latencyMs: number | null;
    error?: string;
  };
  calculation: {
    status: CalculationHealthStatus;
    latencyMs: number | null;
    error?: string;
  };
  filesystem: {
    status: FilesystemHealthStatus;
    latencyMs: number | null;
    path?: string;
    error?: string;
  };
}

export interface ApiErrorResponse {
  status: "error";
  message: string;
  code?: string;
  details?: unknown;
  timestamp: string;
}

export type UserRole = "ADMIN" | "USER";

export type SubscriptionStatus = "ACTIVE" | "CANCELED" | "PAST_DUE";

export type BillingCycle = "MONTHLY" | "YEARLY";

export interface PlanEntitlements {
  customFormulas: boolean;
  pdfExport: boolean;
}

export interface PlanLimits {
  machines: number | null;
  materials: number | null;
  monthlyQuotes: number | null;
}

export interface PlanResource {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingCycle: BillingCycle;
  limits: PlanLimits;
  features: PlanEntitlements;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanPayload {
  code: string;
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  billingCycle: BillingCycle;
  limits: PlanLimits;
  features: PlanEntitlements;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
}

export interface UsageMetric {
  used: number;
  limit: number | null;
}

export interface BillingUsage {
  machines: UsageMetric;
  materials: UsageMetric;
  monthlyQuotes: UsageMetric & {
    periodStart: string;
  };
}

export interface AuthCompany {
  id: string;
  name: string;
  defaultCurrency: string;
  planCode: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  company: AuthCompany | null;
}

export interface AuthResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthUser;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  companyName: string;
  password: string;
  defaultCurrency?: string;
  taxRate?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface BillingOverview {
  companyId: string;
  companyName: string;
  plan: PlanResource;
  subscriptionStatus: SubscriptionStatus;
  asaasCustomerId: string | null;
  usage: BillingUsage;
  entitlements: PlanEntitlements;
}

export interface CheckoutRequest {
  planId: string;
}

export interface CheckoutResponse {
  // Present when the chosen plan is paid — the frontend must redirect the
  // browser here (Asaas-hosted checkout, card/Pix data never touch our
  // backend). Absent for the free plan, where `billing` reflects the
  // change immediately since there is nothing to pay.
  checkoutUrl: string | null;
  checkoutId: string | null;
  billing: BillingOverview | null;
}

export interface PaymentResource {
  id: string;
  status: string;
  billingType: string | null;
  value: number;
  dueDate: string | null;
  paymentDate: string | null;
  invoiceUrl: string | null;
  createdAt: string;
}

export interface AdminUserResource {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company: {
    id: string;
    name: string;
    planId: string;
    planName: string;
    subscriptionStatus: SubscriptionStatus;
    asaasCustomerId: string | null;
    usage: BillingUsage;
  } | null;
}

export interface AdminUserUpdatePayload {
  role?: UserRole;
  isActive?: boolean;
  planId?: string;
  subscriptionStatus?: SubscriptionStatus;
}

export interface AnalyticsRange {
  from: string;
  to: string;
}

export interface MonthlyFinancialPoint {
  month: string;
  revenue: number;
  profit: number;
  baseCost: number;
}

export interface MaterialMixPoint {
  materialType: MaterialType;
  label: string;
  weightGrams: number;
  revenue: number;
  percentage: number;
}

export interface MachineOccupancyPoint {
  machineId: string;
  machineName: string;
  printedHours: number;
  capacityHours: number;
  occupancyPercent: number;
}

export interface AnalyticsSummary {
  quotesCount: number;
  approvedQuotesCount: number;
  revenue: number;
  profit: number;
  averageTicket: number;
  totalPrintHours: number;
  totalWeightGrams: number;
}

export interface UserAnalyticsOverview {
  range: AnalyticsRange;
  generatedAt: string;
  cacheTtlSeconds: number;
  summary: AnalyticsSummary;
  monthlyFinancials: MonthlyFinancialPoint[];
  materialMix: MaterialMixPoint[];
  machineOccupancy: MachineOccupancyPoint[];
}

export interface SystemErrorResource {
  id: string;
  message: string;
  code: string | null;
  severity: string;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  createdAt: string;
}

export interface AuditLogResource {
  id: string;
  action: string;
  entityType: string;
  actorEmail: string | null;
  targetUserId: string | null;
  companyId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AdminPlanDistributionPoint {
  planId: string;
  planName: string;
  companies: number;
  activeCompanies: number;
  mrr: number;
}

export interface AdminAnalyticsOverview {
  generatedAt: string;
  cacheTtlSeconds: number;
  summary: {
    totalUsers: number;
    activeUsers: number;
    activeCompanies: number;
    estimatedMrr: number;
    quotesThisMonth: number;
    revenueThisMonth: number;
    systemErrors24h: number;
  };
  planDistribution: AdminPlanDistributionPoint[];
  recentErrors: SystemErrorResource[];
  recentAuditLogs: AuditLogResource[];
}

export type MachineType = "FDM" | "RESIN";

export type MaterialType = "FILAMENT" | "RESIN" | "OTHER";

export interface MachineResource {
  id: string;
  name: string;
  type: MachineType;
  printVolumeXmm: number;
  printVolumeYmm: number;
  printVolumeZmm: number;
  price: number;
  depreciationCostPerHour: number;
  maintenanceCostPerHour: number;
  powerConsumptionKw: number;
  powerConsumptionWatts: number;
  createdAt: string;
  updatedAt: string;
}

export interface MachinePayload {
  name: string;
  type: MachineType | "SLA";
  printVolumeXmm?: number;
  printVolumeYmm?: number;
  printVolumeZmm?: number;
  // Depreciacao e manutencao por hora nao entram aqui — sao sempre
  // derivadas de price+type no backend (mesmo padrao de
  // Material.costPerGram, derivado de purchasePrice/totalWeightGrams).
  price: number;
  powerConsumptionWatts: number;
}

// Catalogo de referencia usado só pelo autocomplete do cadastro de
// máquina — nunca é criado/editado pelo usuário.
export interface MachineCatalogResource {
  id: string;
  brand: string;
  name: string;
  type: MachineType;
  price: number;
  powerConsumptionWatts: number;
  printVolumeXmm: number;
  printVolumeYmm: number;
  printVolumeZmm: number;
  depreciationCostPerHour: number;
  maintenanceCostPerHour: number;
}

export interface MaterialResource {
  id: string;
  brand: string;
  type: MaterialType;
  color: string;
  totalWeightGrams: number;
  purchasePrice: number;
  costPerGram: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialPayload {
  brand: string;
  type: MaterialType;
  color: string;
  totalWeightGrams: number;
  purchasePrice: number;
}

export type CustomVariableType = "INTEGER" | "FLOAT" | "PERCENTAGE";

export interface CustomVariableDefinition {
  value: number;
  type: CustomVariableType;
}

export type CustomVariableMap = Record<string, CustomVariableDefinition>;

export interface ProductionSettings {
  desiredMarginPercent: number;
  technicalHourRate: number;
  paintingHourRate: number;
  finishingHourRate: number;
  errorRate: number;
  energyCostPerKwh: number;
  cardFeePercent: number;
  administrativeFeePercent: number;
  customVariables: CustomVariableMap;
}

export interface CalculationRequest {
  weightGrams: number;
  printTimeHours: number;
  machineId: string;
  materialId: string;
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
  quoteItemsCount?: number;
}

export interface CalculationMoneyBreakdown {
  materialCost: number;
  energyCost: number;
  depreciationCost: number;
  maintenanceCost: number;
  laborCost: number;
  baseCost: number;
  marginAmount: number;
  subtotalWithMargin: number;
  cardFeeAmount: number;
  administrativeFeeAmount: number;
  feesTotal: number;
  finalPrice: number;
}

export interface CalculationResourceSummary {
  machine: {
    id: string;
    name: string;
    type: MachineType;
    powerConsumptionWatts: number;
    depreciationCostPerHour: number;
    maintenanceCostPerHour: number;
  };
  material: {
    id: string;
    brand: string;
    type: MaterialType;
    color: string;
    costPerGram: number;
  };
}

export interface CalculationAppliedRates {
  desiredMarginPercent: number;
  technicalHourRate: number;
  paintingHourRate: number;
  finishingHourRate: number;
  errorRate: number;
  energyCostPerKwh: number;
  cardFeePercent: number;
  administrativeFeePercent: number;
  customVariables: CustomVariableMap;
}

export interface CalculationResponse {
  input: CalculationRequest;
  resources: CalculationResourceSummary;
  rates: CalculationAppliedRates;
  breakdown: CalculationMoneyBreakdown;
  formula: {
    id: string | null;
    name: string;
    expression: string;
    source: "DATABASE" | "SYSTEM_FALLBACK";
  };
  variables: Record<string, number>;
  precision: {
    internal: "Prisma.Decimal";
    currencyDecimalPlaces: 2;
  };
}

export type QuoteStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED";

export interface QuoteItemPayload extends CalculationRequest {
  modelName?: string;
}

export interface QuotePayload {
  customerName: string;
  validUntil?: string;
  status?: QuoteStatus;
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
  items: QuoteItemPayload[];
}

export interface QuoteUpdatePayload {
  customerName?: string;
  validUntil?: string;
  status?: QuoteStatus;
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
  items?: QuoteItemPayload[];
}

export interface FormulaResource {
  id: string;
  code: string;
  name: string;
  expression: string;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormulaPayload {
  name: string;
  expression: string;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface FormulaVariable {
  name: string;
  label: string;
  description: string;
  source: "SYSTEM" | "CUSTOM";
  type: CustomVariableType;
  value?: number;
  runtimeValue?: number;
}

export interface FormulaPreviewRequest {
  expression: string;
  variables?: Record<string, number>;
}

export interface FormulaPreviewResponse {
  expression: string;
  result: number;
  variables: Record<string, number>;
}

export interface QuoteItemSnapshot {
  id: string;
  modelName: string;
  machineId: string;
  materialId: string;
  machineName: string;
  materialName: string;
  materialColor: string;
  estimatedPrintTimeHours: number;
  materialWeightGrams: number;
  calculatedCost: number;
  materialCost: number;
  energyCost: number;
  depreciationCost: number;
  maintenanceCost: number;
  laborCost: number;
  baseCost: number;
  marginAmount: number;
  feesTotal: number;
  finalPrice: number;
  appliedMarginPercent: number;
  appliedTechnicalHourRate: number;
  appliedEnergyCostPerKwh: number;
  appliedCardFeePercent: number;
  appliedAdministrativeFeePercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteResource {
  id: string;
  formulaId: string | null;
  formulaName: string | null;
  customerName: string;
  status: QuoteStatus;
  totalAmount: number;
  totalPrintHours: number;
  totalWeightGrams: number;
  paintingHours: number;
  finishingHours: number;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  items: QuoteItemSnapshot[];
}

export interface QuoteListItem {
  id: string;
  formulaId: string | null;
  formulaName: string | null;
  customerName: string;
  status: QuoteStatus;
  totalAmount: number;
  totalPrintHours: number;
  totalWeightGrams: number;
  paintingHours: number;
  finishingHours: number;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  itemsCount: number;
  firstItem: {
    modelName: string;
    machineName: string;
    materialName: string;
  } | null;
}

export interface PaginatedQuoteList {
  data: QuoteListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type EmailTemplateKey =
  | "ACCOUNT_CREATED"
  | "PASSWORD_RESET"
  | "SUBSCRIPTION_CONFIRMED"
  | "SUBSCRIPTION_RENEWED"
  | "SUBSCRIPTION_EXPIRING"
  | "QUOTE_SUMMARY";

export interface EmailTemplateVariable {
  name: string;
  description: string;
}

export interface EmailTemplateResource {
  id: string;
  key: EmailTemplateKey;
  name: string;
  description: string | null;
  subject: string;
  bodyHtml: string;
  isActive: boolean;
  availableVariables: EmailTemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateUpdatePayload {
  name?: string;
  subject?: string;
  bodyHtml?: string;
  isActive?: boolean;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}
