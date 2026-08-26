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
  // Admin-set reference price shown to non-Brazil companies. Display only —
  // Asaas has no currency parameter, so the actual charge always uses
  // `price` in BRL (Contextos/Decisoes.md).
  priceUsd: number | null;
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
  priceUsd?: number | null;
  currency?: string;
  billingCycle: BillingCycle;
  limits: PlanLimits;
  features: PlanEntitlements;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
}

// RECURRING: the discounted price is the fixed value Asaas charges every
// renewal cycle, forever. ONE_TIME: discounted only for the first charge —
// the subscription's value gets pushed back to the plan's full price right
// after that first payment confirms (see asaas.service.ts#
// revertSubscriptionToFullPrice).
export type CouponType = "RECURRING" | "ONE_TIME";

export interface CouponResource {
  id: string;
  code: string;
  discountPercent: number;
  type: CouponType;
  isActive: boolean;
  // How many companies currently have this coupon attached to their
  // subscription (Company.couponId) — admin-facing usage signal only.
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponPayload {
  code: string;
  discountPercent: number;
  type?: CouponType;
  isActive?: boolean;
}

// GET /billing/coupons/:code — lets the checkout screen show the discount
// before the person commits to subscribing, without yet creating a
// Checkout row. The real, authoritative validation still happens again
// inside POST /billing/checkout.
export interface CouponPreviewResponse {
  code: string;
  discountPercent: number;
  type: CouponType;
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
  country: string;
  defaultCurrency: string;
  planCode: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
  // Mirrors the plan's PDF_EXPORT entitlement (see billing.service.ts#
  // ensureFeature, the backend's actual enforcement) — lets the frontend
  // hide the PDF export button/settings for plans without it, purely
  // cosmetic, never the source of truth.
  pdfExport: boolean;
  // Business info shown on the quote PDF header — all optional.
  taxId: string | null;
  phone: string | null;
  address: string | null;
  // Overrides the PDF's default localized terms/warranty text when set —
  // raw multi-line text, one term per line. Null keeps the built-in
  // pt-BR/en defaults. Each field only affects its own language's PDF —
  // setting one does not carry over into the other.
  customTerms: string | null;
  customTermsEn: string | null;
}

export interface EmailPreferences {
  financial: boolean;
  quotes: boolean;
  newsletter: boolean;
}

// Admin screens are excluded from translation for now (Contextos/Decisoes.md,
// 2026-08-17) — this drives the app UI, quote PDF, and transactional emails.
// Spanish added 2026-08-26 (Contextos/Decisoes.md) — like "en", it has no
// dedicated Company.customTerms field for the quote PDF (falls back to the
// built-in default terms, see quote-pdf.service.ts's resolveTerms).
export type SupportedLanguage = "pt-BR" | "en" | "es";

// Locale/currency the UI's own "language === X" formatting swaps use
// (quote prices, analytics, dates — display-only, no real conversion; see
// Contextos/Decisoes.md 2026-08-17). Only pt-BR is BRL — every other UI
// language defaults to USD, same reasoning as currencyForCountry below.
export const localeForLanguage = (language: SupportedLanguage): string => {
  switch (language) {
    case "pt-BR":
      return "pt-BR";
    case "en":
      return "en-US";
    case "es":
      return "es-419";
  }
};

export const currencyForLanguage = (language: SupportedLanguage): "BRL" | "USD" =>
  language === "pt-BR" ? "BRL" : "USD";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  language: SupportedLanguage;
  emailPreferences: EmailPreferences;
  company: AuthCompany | null;
}

export interface UpdateProfilePayload {
  name?: string;
  companyName?: string;
  country?: string;
  taxId?: string | null;
  phone?: string | null;
  address?: string | null;
  customTerms?: string | null;
  customTermsEn?: string | null;
  language?: SupportedLanguage;
  emailPreferences?: Partial<EmailPreferences>;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
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
  // ISO 3166-1 alpha-2 code — drives the company's billing currency
  // (BR -> BRL, anything else -> USD display). See shared/src/countries.ts.
  country: string;
  taxRate?: number;
  language?: SupportedLanguage;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface BillingOverview {
  companyId: string;
  companyName: string;
  companyCountry: string;
  companyDefaultCurrency: string;
  plan: PlanResource;
  subscriptionStatus: SubscriptionStatus;
  asaasCustomerId: string | null;
  usage: BillingUsage;
  entitlements: PlanEntitlements;
  // The coupon this subscription's checkout used (set once confirmed), or
  // null if none. Display only — for a ONE_TIME coupon this stays set even
  // after the first-cycle discount has already been reverted to full
  // price, so the screen can still show "applied to your first payment".
  coupon: { code: string; discountPercent: number; type: CouponType } | null;
}

export interface CheckoutRequest {
  planId: string;
  // Validated server-side regardless of what the /billing/coupons/:code
  // preview check said client-side — see CouponPreviewResponse.
  couponCode?: string;
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

// Catalogo de referencia usado pelo autocomplete do cadastro de máquina
// (nunca criado/editado pela empresa) e gerenciado pelo admin em
// /admin/machine-catalog.
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

export interface MachineCatalogPayload {
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

export interface MachineCatalogImportRowError {
  row: number;
  brand: string;
  name: string;
  message: string;
}

export interface MachineCatalogImportResult {
  created: number;
  updated: number;
  errors: MachineCatalogImportRowError[];
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
  paintingHourRate: number;
  finishingHourRate: number;
  errorRate: number;
  energyCostPerKwh: number;
  cardFeePercent: number;
  administrativeFeePercent: number;
  customVariables: CustomVariableMap;
}

// "Desconto/Acréscimo" on a quote's final price — null/absent means
// neither is applied.
export type QuoteAdjustmentType = "DISCOUNT" | "SURCHARGE";

export interface CalculationRequest {
  weightGrams: number;
  printTimeHours: number;
  machineId: string;
  materialId: string;
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
  quoteItemsCount?: number;
  cardPayment?: boolean;
}

export interface CalculationMoneyBreakdown {
  // Aggregate across every print item in the quote (a single-item
  // calculation, e.g. the standalone calculator, is just the N=1 case).
  materialCost: number;
  energyCost: number;
  depreciationCost: number;
  maintenanceCost: number;
  // How much errorRate added on top of (materialCost + energyCost) only —
  // already folded into baseCost below. Depreciation/maintenance never
  // carry an error multiplier.
  errorCostAmount: number;
  // (materialCost + energyCost + errorCostAmount + depreciationCost +
  // maintenanceCost) — this is what the formula sees as `custo_base`.
  baseCost: number;
  // valor_hora_pintura*horas_pintura + valor_hora_acabamento*horas_acabamento,
  // added once for the whole quote — never per item.
  postProcessingCost: number;
  marginAmount: number;
  subtotalWithMargin: number;
  // Real amount added to finalPrice — only when the quote/calculation
  // opted into the card fee (Quote.cardPayment); 0 otherwise, including
  // when cardFeePercent is 0. Unlike administrativeFeeAmount below, this
  // is not a display estimate.
  cardFeeAmount: number;
  administrativeFeeAmount: number;
  feesTotal: number;
  // Real amount added on top of (formula price + cardFeeAmount) when a
  // "Desconto/Acréscimo" is set — negative for DISCOUNT, positive for
  // SURCHARGE, 0 when neither is applied. Not an estimate, same spirit as
  // cardFeeAmount above. Already folded into finalPrice below.
  adjustmentAmount: number;
  finalPrice: number;
}

export interface QuoteItemCostPreview {
  modelName?: string;
  materialCost: number;
  energyCost: number;
  depreciationCost: number;
  maintenanceCost: number;
  // materialCost + energyCost + depreciationCost + maintenanceCost — this
  // item's own raw production cost, with no error rate, fees, margin or
  // post-processing applied (those only exist at the whole-quote level).
  rawCost: number;
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

// FULL: today's PDF (per-table breakdown, material/machine, weight/time,
// each table's own price). SUMMARY: no per-table section at all, just the
// header/customer block and the total amount — see quote-pdf.service.ts.
export type QuotePdfFormat = "FULL" | "SUMMARY";

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
  // "Pagamento Cartão" — when true, Settings.cardFeePercent is added on
  // top of the price the formula computed. See QuoteResource.cardFeeAmount.
  cardPayment?: boolean;
  // "Desconto/Acréscimo" — null/undefined means neither is applied.
  // adjustmentPercent is only meaningful when adjustmentType is set. See
  // QuoteResource.adjustmentAmount.
  adjustmentType?: QuoteAdjustmentType | null;
  adjustmentPercent?: number;
  items: QuoteItemPayload[];
}

export interface QuotePreviewRequest {
  items: QuoteItemPayload[];
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
  cardPayment?: boolean;
  adjustmentType?: QuoteAdjustmentType | null;
  adjustmentPercent?: number;
}

// Live, unsaved preview of a whole quote-in-progress — the SAME
// calculation quote creation ends up persisting, just not written to the
// database. `items` is per-mesa raw cost only (no fees/margin/error/
// post-processing — see QuoteItemCostPreview); `breakdown`/`finalPrice`
// are the whole-quote aggregate, computed once.
export interface QuotePreviewResponse {
  items: QuoteItemCostPreview[];
  breakdown: CalculationMoneyBreakdown;
  rates: CalculationAppliedRates;
  formula: {
    id: string | null;
    name: string;
    expression: string;
    source: "DATABASE" | "SYSTEM_FALLBACK";
  };
  variables: Record<string, number>;
}

export interface QuoteUpdatePayload {
  customerName?: string;
  validUntil?: string;
  status?: QuoteStatus;
  formulaId?: string;
  paintingHours?: number;
  finishingHours?: number;
  cardPayment?: boolean;
  adjustmentType?: QuoteAdjustmentType | null;
  adjustmentPercent?: number;
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

// Global, admin-managed formulas — visible read-only to every company
// (merged into their `GET /formulas` list, flagged via `FormulaResource.
// isSystem`), never editable/deletable by them. Same shape as
// FormulaResource/FormulaPayload minus `isSystem` (a system formula is
// never NOT a system formula).
export interface SystemFormulaResource {
  id: string;
  code: string;
  name: string;
  expression: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemFormulaPayload {
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
  baseCost: number;
  marginAmount: number;
  feesTotal: number;
  finalPrice: number;
  appliedMarginPercent: number;
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
  cardPayment: boolean;
  // The real amount cardPayment added to totalAmount at save time (a
  // snapshot — not recomputed if Settings.cardFeePercent changes later).
  // 0 when cardPayment is false or the rate is 0.
  cardFeeAmount: number;
  // "Desconto/Acréscimo" — null when neither is applied.
  adjustmentType: QuoteAdjustmentType | null;
  adjustmentPercent: number;
  // The real amount adjustmentType/adjustmentPercent added to totalAmount
  // at save time (a snapshot, signed: negative for DISCOUNT, positive for
  // SURCHARGE). 0 when adjustmentType is null.
  adjustmentAmount: number;
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
  | "PAYMENT_OVERDUE"
  | "QUOTE_SUMMARY"
  // Internal ops alert, not a customer-facing email — sent to every active
  // ADMIN user, always in pt-BR regardless of who triggered the failure
  // (Admin screens stay Portuguese-only, see Contextos/Decisoes.md). Only
  // one language row exists for this key on purpose.
  | "COUPON_REVERT_FAILED";

export interface EmailTemplateVariable {
  name: string;
  description: string;
  sampleValue: string;
}

export interface EmailTemplateResource {
  id: string;
  key: EmailTemplateKey;
  language: SupportedLanguage;
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

export type EmailSendStatus =
  | "SENT"
  | "FAILED"
  | "SKIPPED_INACTIVE"
  | "SKIPPED_PREFERENCE";

export interface EmailTemplateTestPayload {
  to: string;
}

export interface EmailTemplateTestResult {
  status: EmailSendStatus;
  error: string | null;
}

// Filled in asynchronously by Resend's webhook, some time after `status`
// above already settled — null means no delivery event has arrived yet
// (which is expected/normal if RESEND_WEBHOOK_SECRET isn't configured, or
// simply hasn't happened yet for a very recent send).
export type EmailDeliveryStatus =
  | "DELIVERED"
  | "BOUNCED"
  | "COMPLAINED"
  | "DELAYED"
  | "FAILED";

export interface EmailLogResource {
  id: string;
  templateKey: string;
  toEmail: string;
  subject: string;
  status: EmailSendStatus;
  resendMessageId: string | null;
  errorMessage: string | null;
  deliveryStatus: EmailDeliveryStatus | null;
  deliveryDetail: string | null;
  deliveryUpdatedAt: string | null;
  // True only for sends triggered by the "Testar e-mail" button — real
  // triggers (account created, password reset, subscription events,
  // quote summary) are always false. Test rows are purged 48h after
  // creation server-side; this flag is what the cleanup job matches on.
  isTest: boolean;
  createdAt: string;
}

// Exact HTML actually sent (after variable substitution — the real reset
// link, the real customer name, etc.) — only ever fetched one row at a
// time (GET /admin/email-logs/:id), never included in the paginated list,
// since it can be large. Null for rows sent before this was captured, or
// for a SKIPPED_INACTIVE row (nothing was ever rendered).
export interface EmailLogDetailResource extends EmailLogResource {
  bodyHtml: string | null;
}

export interface EmailLogListQuery {
  page?: number;
  pageSize?: number;
  status?: EmailSendStatus;
  deliveryStatus?: EmailDeliveryStatus;
  isTest?: boolean;
}

export interface PaginatedEmailLogList {
  data: EmailLogResource[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface CountryOption {
  code: string;
  namePt: string;
  nameEn: string;
  nameEs: string;
}

// Full ISO 3166-1 alpha-2 list (sovereign states + territories), so the
// signup/profile country picker never has to turn away a real customer.
// Names are the common short form, not the ISO "official name" (e.g.
// "Brasil"/"Brazil", not "República Federativa do Brasil").
//
// Kept inline in this file (not a separate module) on purpose: the
// frontend resolves "@3d-budget/shared" straight to this file's *source*
// via a tsconfig path alias (frontend/tsconfig.json), while the backend
// runs the *compiled* dist/index.js under plain Node ESM at runtime — a
// relative "export * from './countries'" compiles fine but only resolves
// correctly for one of those two consumers depending on whether the
// extension is included, since Node ESM requires it and the frontend's
// direct-from-source resolution doesn't have a matching .js file to find.
// A single file with no relative imports/exports sidesteps the mismatch
// entirely. See Contextos/Conhecimento.md for the production incident
// this caused (2026-08-17).
const COUNTRY_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["AF", "Afeganistão", "Afghanistan", "Afganistán"],
  ["AL", "Albânia", "Albania", "Albania"],
  ["DZ", "Argélia", "Algeria", "Argelia"],
  ["AS", "Samoa Americana", "American Samoa", "Samoa Americana"],
  ["AD", "Andorra", "Andorra", "Andorra"],
  ["AO", "Angola", "Angola", "Angola"],
  ["AI", "Anguilla", "Anguilla", "Anguila"],
  ["AQ", "Antártida", "Antarctica", "Antártida"],
  ["AG", "Antígua e Barbuda", "Antigua and Barbuda", "Antigua y Barbuda"],
  ["AR", "Argentina", "Argentina", "Argentina"],
  ["AM", "Armênia", "Armenia", "Armenia"],
  ["AW", "Aruba", "Aruba", "Aruba"],
  ["AU", "Austrália", "Australia", "Australia"],
  ["AT", "Áustria", "Austria", "Austria"],
  ["AZ", "Azerbaijão", "Azerbaijan", "Azerbaiyán"],
  ["BS", "Bahamas", "Bahamas", "Bahamas"],
  ["BH", "Bahrein", "Bahrain", "Baréin"],
  ["BD", "Bangladesh", "Bangladesh", "Bangladés"],
  ["BB", "Barbados", "Barbados", "Barbados"],
  ["BY", "Bielorrússia", "Belarus", "Bielorrusia"],
  ["BE", "Bélgica", "Belgium", "Bélgica"],
  ["BZ", "Belize", "Belize", "Belice"],
  ["BJ", "Benin", "Benin", "Benín"],
  ["BM", "Bermudas", "Bermuda", "Bermudas"],
  ["BT", "Butão", "Bhutan", "Bután"],
  ["BO", "Bolívia", "Bolivia", "Bolivia"],
  ["BA", "Bósnia e Herzegovina", "Bosnia and Herzegovina", "Bosnia y Herzegovina"],
  ["BW", "Botsuana", "Botswana", "Botsuana"],
  ["BV", "Ilha Bouvet", "Bouvet Island", "Isla Bouvet"],
  ["BR", "Brasil", "Brazil", "Brasil"],
  [
    "IO",
    "Território Britânico do Oceano Índico",
    "British Indian Ocean Territory",
    "Territorio Británico del Océano Índico",
  ],
  ["BN", "Brunei", "Brunei", "Brunéi"],
  ["BG", "Bulgária", "Bulgaria", "Bulgaria"],
  ["BF", "Burkina Faso", "Burkina Faso", "Burkina Faso"],
  ["BI", "Burundi", "Burundi", "Burundi"],
  ["CV", "Cabo Verde", "Cabo Verde", "Cabo Verde"],
  ["KH", "Camboja", "Cambodia", "Camboya"],
  ["CM", "Camarões", "Cameroon", "Camerún"],
  ["CA", "Canadá", "Canada", "Canadá"],
  ["KY", "Ilhas Cayman", "Cayman Islands", "Islas Caimán"],
  ["CF", "República Centro-Africana", "Central African Republic", "República Centroafricana"],
  ["TD", "Chade", "Chad", "Chad"],
  ["CL", "Chile", "Chile", "Chile"],
  ["CN", "China", "China", "China"],
  ["CX", "Ilha Christmas", "Christmas Island", "Isla de Navidad"],
  ["CC", "Ilhas Cocos (Keeling)", "Cocos (Keeling) Islands", "Islas Cocos (Keeling)"],
  ["CO", "Colômbia", "Colombia", "Colombia"],
  ["KM", "Comores", "Comoros", "Comoras"],
  ["CG", "Congo", "Congo", "Congo"],
  [
    "CD",
    "Congo (República Democrática)",
    "Congo (Democratic Republic)",
    "Congo (República Democrática)",
  ],
  ["CK", "Ilhas Cook", "Cook Islands", "Islas Cook"],
  ["CR", "Costa Rica", "Costa Rica", "Costa Rica"],
  ["CI", "Costa do Marfim", "Côte d'Ivoire", "Costa de Marfil"],
  ["HR", "Croácia", "Croatia", "Croacia"],
  ["CU", "Cuba", "Cuba", "Cuba"],
  ["CW", "Curaçao", "Curaçao", "Curazao"],
  ["CY", "Chipre", "Cyprus", "Chipre"],
  ["CZ", "Chéquia", "Czechia", "Chequia"],
  ["DK", "Dinamarca", "Denmark", "Dinamarca"],
  ["DJ", "Djibuti", "Djibouti", "Yibuti"],
  ["DM", "Dominica", "Dominica", "Dominica"],
  ["DO", "República Dominicana", "Dominican Republic", "República Dominicana"],
  ["EC", "Equador", "Ecuador", "Ecuador"],
  ["EG", "Egito", "Egypt", "Egipto"],
  ["SV", "El Salvador", "El Salvador", "El Salvador"],
  ["GQ", "Guiné Equatorial", "Equatorial Guinea", "Guinea Ecuatorial"],
  ["ER", "Eritreia", "Eritrea", "Eritrea"],
  ["EE", "Estônia", "Estonia", "Estonia"],
  ["SZ", "Essuatíni", "Eswatini", "Esuatini"],
  ["ET", "Etiópia", "Ethiopia", "Etiopía"],
  ["FK", "Ilhas Malvinas", "Falkland Islands", "Islas Malvinas"],
  ["FO", "Ilhas Faroé", "Faroe Islands", "Islas Feroe"],
  ["FJ", "Fiji", "Fiji", "Fiyi"],
  ["FI", "Finlândia", "Finland", "Finlandia"],
  ["FR", "França", "France", "Francia"],
  ["GF", "Guiana Francesa", "French Guiana", "Guayana Francesa"],
  ["PF", "Polinésia Francesa", "French Polynesia", "Polinesia Francesa"],
  [
    "TF",
    "Terras Austrais Francesas",
    "French Southern Territories",
    "Tierras Australes Francesas",
  ],
  ["GA", "Gabão", "Gabon", "Gabón"],
  ["GM", "Gâmbia", "Gambia", "Gambia"],
  ["GE", "Geórgia", "Georgia", "Georgia"],
  ["DE", "Alemanha", "Germany", "Alemania"],
  ["GH", "Gana", "Ghana", "Ghana"],
  ["GI", "Gibraltar", "Gibraltar", "Gibraltar"],
  ["GR", "Grécia", "Greece", "Grecia"],
  ["GL", "Groenlândia", "Greenland", "Groenlandia"],
  ["GD", "Granada", "Grenada", "Granada"],
  ["GP", "Guadalupe", "Guadeloupe", "Guadalupe"],
  ["GU", "Guam", "Guam", "Guam"],
  ["GT", "Guatemala", "Guatemala", "Guatemala"],
  ["GG", "Guernsey", "Guernsey", "Guernsey"],
  ["GN", "Guiné", "Guinea", "Guinea"],
  ["GW", "Guiné-Bissau", "Guinea-Bissau", "Guinea-Bisáu"],
  ["GY", "Guiana", "Guyana", "Guyana"],
  ["HT", "Haiti", "Haiti", "Haití"],
  ["HM", "Ilhas Heard e McDonald", "Heard Island and McDonald Islands", "Islas Heard y McDonald"],
  ["VA", "Vaticano", "Holy See", "Ciudad del Vaticano"],
  ["HN", "Honduras", "Honduras", "Honduras"],
  ["HK", "Hong Kong", "Hong Kong", "Hong Kong"],
  ["HU", "Hungria", "Hungary", "Hungría"],
  ["IS", "Islândia", "Iceland", "Islandia"],
  ["IN", "Índia", "India", "India"],
  ["ID", "Indonésia", "Indonesia", "Indonesia"],
  ["IR", "Irã", "Iran", "Irán"],
  ["IQ", "Iraque", "Iraq", "Irak"],
  ["IE", "Irlanda", "Ireland", "Irlanda"],
  ["IM", "Ilha de Man", "Isle of Man", "Isla de Man"],
  ["IL", "Israel", "Israel", "Israel"],
  ["IT", "Itália", "Italy", "Italia"],
  ["JM", "Jamaica", "Jamaica", "Jamaica"],
  ["JP", "Japão", "Japan", "Japón"],
  ["JE", "Jersey", "Jersey", "Jersey"],
  ["JO", "Jordânia", "Jordan", "Jordania"],
  ["KZ", "Cazaquistão", "Kazakhstan", "Kazajistán"],
  ["KE", "Quênia", "Kenya", "Kenia"],
  ["KI", "Kiribati", "Kiribati", "Kiribati"],
  ["KP", "Coreia do Norte", "North Korea", "Corea del Norte"],
  ["KR", "Coreia do Sul", "South Korea", "Corea del Sur"],
  ["KW", "Kuwait", "Kuwait", "Kuwait"],
  ["KG", "Quirguistão", "Kyrgyzstan", "Kirguistán"],
  ["LA", "Laos", "Laos", "Laos"],
  ["LV", "Letônia", "Latvia", "Letonia"],
  ["LB", "Líbano", "Lebanon", "Líbano"],
  ["LS", "Lesoto", "Lesotho", "Lesoto"],
  ["LR", "Libéria", "Liberia", "Liberia"],
  ["LY", "Líbia", "Libya", "Libia"],
  ["LI", "Liechtenstein", "Liechtenstein", "Liechtenstein"],
  ["LT", "Lituânia", "Lithuania", "Lituania"],
  ["LU", "Luxemburgo", "Luxembourg", "Luxemburgo"],
  ["MO", "Macau", "Macao", "Macao"],
  ["MG", "Madagáscar", "Madagascar", "Madagascar"],
  ["MW", "Malawi", "Malawi", "Malaui"],
  ["MY", "Malásia", "Malaysia", "Malasia"],
  ["MV", "Maldivas", "Maldives", "Maldivas"],
  ["ML", "Mali", "Mali", "Malí"],
  ["MT", "Malta", "Malta", "Malta"],
  ["MH", "Ilhas Marshall", "Marshall Islands", "Islas Marshall"],
  ["MQ", "Martinica", "Martinique", "Martinica"],
  ["MR", "Mauritânia", "Mauritania", "Mauritania"],
  ["MU", "Maurício", "Mauritius", "Mauricio"],
  ["YT", "Mayotte", "Mayotte", "Mayotte"],
  ["MX", "México", "Mexico", "México"],
  ["FM", "Micronésia", "Micronesia", "Micronesia"],
  ["MD", "Moldávia", "Moldova", "Moldavia"],
  ["MC", "Mônaco", "Monaco", "Mónaco"],
  ["MN", "Mongólia", "Mongolia", "Mongolia"],
  ["ME", "Montenegro", "Montenegro", "Montenegro"],
  ["MS", "Montserrat", "Montserrat", "Montserrat"],
  ["MA", "Marrocos", "Morocco", "Marruecos"],
  ["MZ", "Moçambique", "Mozambique", "Mozambique"],
  ["MM", "Mianmar", "Myanmar", "Myanmar"],
  ["NA", "Namíbia", "Namibia", "Namibia"],
  ["NR", "Nauru", "Nauru", "Nauru"],
  ["NP", "Nepal", "Nepal", "Nepal"],
  ["NL", "Países Baixos", "Netherlands", "Países Bajos"],
  ["NC", "Nova Caledônia", "New Caledonia", "Nueva Caledonia"],
  ["NZ", "Nova Zelândia", "New Zealand", "Nueva Zelanda"],
  ["NI", "Nicarágua", "Nicaragua", "Nicaragua"],
  ["NE", "Níger", "Niger", "Níger"],
  ["NG", "Nigéria", "Nigeria", "Nigeria"],
  ["NU", "Niue", "Niue", "Niue"],
  ["NF", "Ilha Norfolk", "Norfolk Island", "Isla Norfolk"],
  ["MK", "Macedônia do Norte", "North Macedonia", "Macedonia del Norte"],
  ["MP", "Ilhas Marianas do Norte", "Northern Mariana Islands", "Islas Marianas del Norte"],
  ["NO", "Noruega", "Norway", "Noruega"],
  ["OM", "Omã", "Oman", "Omán"],
  ["PK", "Paquistão", "Pakistan", "Pakistán"],
  ["PW", "Palau", "Palau", "Palaos"],
  ["PS", "Palestina", "Palestine", "Palestina"],
  ["PA", "Panamá", "Panama", "Panamá"],
  ["PG", "Papua-Nova Guiné", "Papua New Guinea", "Papúa Nueva Guinea"],
  ["PY", "Paraguai", "Paraguay", "Paraguay"],
  ["PE", "Peru", "Peru", "Perú"],
  ["PH", "Filipinas", "Philippines", "Filipinas"],
  ["PN", "Ilhas Pitcairn", "Pitcairn", "Islas Pitcairn"],
  ["PL", "Polônia", "Poland", "Polonia"],
  ["PT", "Portugal", "Portugal", "Portugal"],
  ["PR", "Porto Rico", "Puerto Rico", "Puerto Rico"],
  ["QA", "Catar", "Qatar", "Catar"],
  ["RE", "Reunião", "Réunion", "Reunión"],
  ["RO", "Romênia", "Romania", "Rumania"],
  ["RU", "Rússia", "Russia", "Rusia"],
  ["RW", "Ruanda", "Rwanda", "Ruanda"],
  ["BL", "São Bartolomeu", "Saint Barthélemy", "San Bartolomé"],
  ["SH", "Santa Helena", "Saint Helena", "Santa Elena"],
  ["KN", "São Cristóvão e Nevis", "Saint Kitts and Nevis", "San Cristóbal y Nieves"],
  ["LC", "Santa Lúcia", "Saint Lucia", "Santa Lucía"],
  ["MF", "São Martinho (França)", "Saint Martin", "San Martín (Francia)"],
  ["PM", "São Pedro e Miquelão", "Saint Pierre and Miquelon", "San Pedro y Miquelón"],
  [
    "VC",
    "São Vicente e Granadinas",
    "Saint Vincent and the Grenadines",
    "San Vicente y las Granadinas",
  ],
  ["WS", "Samoa", "Samoa", "Samoa"],
  ["SM", "San Marino", "San Marino", "San Marino"],
  ["ST", "São Tomé e Príncipe", "Sao Tome and Principe", "Santo Tomé y Príncipe"],
  ["SA", "Arábia Saudita", "Saudi Arabia", "Arabia Saudita"],
  ["SN", "Senegal", "Senegal", "Senegal"],
  ["RS", "Sérvia", "Serbia", "Serbia"],
  ["SC", "Seicheles", "Seychelles", "Seychelles"],
  ["SL", "Serra Leoa", "Sierra Leone", "Sierra Leona"],
  ["SG", "Singapura", "Singapore", "Singapur"],
  ["SX", "São Martinho (Países Baixos)", "Sint Maarten", "San Martín (Países Bajos)"],
  ["SK", "Eslováquia", "Slovakia", "Eslovaquia"],
  ["SI", "Eslovênia", "Slovenia", "Eslovenia"],
  ["SB", "Ilhas Salomão", "Solomon Islands", "Islas Salomón"],
  ["SO", "Somália", "Somalia", "Somalia"],
  ["ZA", "África do Sul", "South Africa", "Sudáfrica"],
  [
    "GS",
    "Geórgia do Sul e Ilhas Sandwich do Sul",
    "South Georgia and South Sandwich Islands",
    "Islas Georgias del Sur y Sandwich del Sur",
  ],
  ["SS", "Sudão do Sul", "South Sudan", "Sudán del Sur"],
  ["ES", "Espanha", "Spain", "España"],
  ["LK", "Sri Lanka", "Sri Lanka", "Sri Lanka"],
  ["SD", "Sudão", "Sudan", "Sudán"],
  ["SR", "Suriname", "Suriname", "Surinam"],
  ["SJ", "Svalbard e Jan Mayen", "Svalbard and Jan Mayen", "Svalbard y Jan Mayen"],
  ["SE", "Suécia", "Sweden", "Suecia"],
  ["CH", "Suíça", "Switzerland", "Suiza"],
  ["SY", "Síria", "Syria", "Siria"],
  ["TW", "Taiwan", "Taiwan", "Taiwán"],
  ["TJ", "Tajiquistão", "Tajikistan", "Tayikistán"],
  ["TZ", "Tanzânia", "Tanzania", "Tanzania"],
  ["TH", "Tailândia", "Thailand", "Tailandia"],
  ["TL", "Timor-Leste", "Timor-Leste", "Timor Oriental"],
  ["TG", "Togo", "Togo", "Togo"],
  ["TK", "Tokelau", "Tokelau", "Tokelau"],
  ["TO", "Tonga", "Tonga", "Tonga"],
  ["TT", "Trinidad e Tobago", "Trinidad and Tobago", "Trinidad y Tobago"],
  ["TN", "Tunísia", "Tunisia", "Túnez"],
  ["TR", "Turquia", "Turkey", "Turquía"],
  ["TM", "Turcomenistão", "Turkmenistan", "Turkmenistán"],
  ["TC", "Ilhas Turcas e Caicos", "Turks and Caicos Islands", "Islas Turcas y Caicos"],
  ["TV", "Tuvalu", "Tuvalu", "Tuvalu"],
  ["UG", "Uganda", "Uganda", "Uganda"],
  ["UA", "Ucrânia", "Ukraine", "Ucrania"],
  ["AE", "Emirados Árabes Unidos", "United Arab Emirates", "Emiratos Árabes Unidos"],
  ["GB", "Reino Unido", "United Kingdom", "Reino Unido"],
  ["US", "Estados Unidos", "United States", "Estados Unidos"],
  [
    "UM",
    "Ilhas Menores Distantes dos EUA",
    "United States Minor Outlying Islands",
    "Islas Ultramarinas Menores de EE. UU.",
  ],
  ["UY", "Uruguai", "Uruguay", "Uruguay"],
  ["UZ", "Uzbequistão", "Uzbekistan", "Uzbekistán"],
  ["VU", "Vanuatu", "Vanuatu", "Vanuatu"],
  ["VE", "Venezuela", "Venezuela", "Venezuela"],
  ["VN", "Vietnã", "Vietnam", "Vietnam"],
  ["VG", "Ilhas Virgens Britânicas", "British Virgin Islands", "Islas Vírgenes Británicas"],
  [
    "VI",
    "Ilhas Virgens Americanas",
    "United States Virgin Islands",
    "Islas Vírgenes de los Estados Unidos",
  ],
  ["WF", "Wallis e Futuna", "Wallis and Futuna", "Wallis y Futuna"],
  ["EH", "Saara Ocidental", "Western Sahara", "Sahara Occidental"],
  ["YE", "Iêmen", "Yemen", "Yemen"],
  ["ZM", "Zâmbia", "Zambia", "Zambia"],
  ["ZW", "Zimbábue", "Zimbabwe", "Zimbabue"],
];

export const COUNTRIES: readonly CountryOption[] = COUNTRY_ROWS.map(
  ([code, namePt, nameEn, nameEs]) => ({ code, namePt, nameEn, nameEs }),
);

export const COUNTRY_CODES: ReadonlySet<string> = new Set(
  COUNTRIES.map((country) => country.code),
);

export const isValidCountryCode = (code: string): boolean => COUNTRY_CODES.has(code);

// Only Brazil bills in reais — every other country sees a USD reference
// price (see Contextos/Decisoes.md: Asaas has no currency parameter, so
// this only ever changes what's DISPLAYED, never what's actually charged).
export const currencyForCountry = (code: string): "BRL" | "USD" =>
  code === "BR" ? "BRL" : "USD";

export const countryName = (code: string, language: SupportedLanguage): string => {
  const country = COUNTRIES.find((candidate) => candidate.code === code);

  if (!country) {
    return code;
  }

  switch (language) {
    case "en":
      return country.nameEn;
    case "es":
      return country.nameEs;
    default:
      return country.namePt;
  }
};
