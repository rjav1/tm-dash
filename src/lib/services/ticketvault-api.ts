/**
 * TicketVault POS API Client
 *
 * Reverse-engineered from https://app.ticketvaultpos.com
 * Provides authentication, event search, and ticket/inventory creation.
 */

// =============================================================================
// Types
// =============================================================================

export interface TicketVaultLoginResponse {
  UserName: string;
  Email: string;
  Token: string;
  CompanyID: number;
  CompanyName: string;
  IsBrokerView: boolean;
  PriceChangeOver: number;
  IsPriceProtection: boolean;
}

export interface TicketVaultEvent {
  Id: number;
  PrimaryEvent: string;
  IsParkingEvent: boolean;
  EventDate: string;
  Venue: string;
}

export interface TicketVaultTicket {
  Section: string;
  Row: string;
  Quantity: number;
  StartSeat: number;
  EndSeat: number;
  Disclosures: unknown[];
  Id: string;
  CostPerTicket: number;
  DeliveryMethod: number;
  SaltTransferType: number;
  ExternalNotes: string | null;
  Face: number;
  GeneralAdmission: boolean;
  InHandType: number;
  InternalNotes: string | null;
  IsConsignment: boolean;
  IsOddSeating: boolean;
  MaskSeats: boolean;
  Price: number;
  RowAlias: string;
  SplitType: number;
  TextTagIDs: number[] | null;
  TotalCost: number;
  ProductionId: number;
  EventName: string;
  PurchaseOrderID: number | null;
  IsCompletelySold: boolean;
  IsPristine: boolean;
  EventDateTime: string;
  VenueName: string;
  ExtPONumber: string;
  AccountEmail: string;
  TextTagNames: string;
}

export interface TicketVaultSearchRequest {
  EventName: string;
  StartDate: string;
  EndDate: string;
  VenueName: string;
  ParkingPasses: boolean;
  RegularEvents: boolean;
  EventType: string;
  IsViagogoSearch: boolean;
  ProductionID: number | null;
}

export interface TicketVaultPoInformation {
  Adjustment: number;
  AdjustmentReason: string;
  ClientId: number;
  Tax: number;
  TaxReason: string;
  Fees: number;
  IncludeFees: boolean;
  IncludeShipHandling: boolean;
  InvoiceNumber: string;
  PaymentType: string;
  PONotes: string;
  ShipHandling: number;
  TotalCost: number;
  CompanyID: number;
  MergeOnSave: boolean;
}

export interface TicketVaultSaveTicketsRequest {
  SearchRequest: TicketVaultSearchRequest;
  Tickets: TicketVaultTicket[];
  EventIds: number[];
  PoInformationData: TicketVaultPoInformation;
  SaveTicketsType: number;
  UiTimeZone: string;
}

export interface TicketVaultSaveTicketsResponse {
  Success: boolean;
  FailedTickets: unknown[];
  FailedEvents: unknown[];
  DuplicatedTickets: unknown[];
  ModifiedTickets: unknown[];
  SavedTicketIds: number[];
  SavedPoTGIDs: number[];
  PurchaseOrderID: number;
}

// Purchase Order types for reading from POS
export interface TicketVaultPurchaseOrderRequest {
  PurchaseOrderId: number | null;
  EventId: number | null;
  PrimaryPerformerId: number | null;
  SecondaryPerformerId: number | null;
  VenueId: number | null;
  ClientId: number | null;
  TicketGroupId: number | null;
  Notes: string | null;
  UnpaidOnly: boolean;
  IncludeCancelled: boolean;
  IsTicketsReceived: boolean;
  IsReview: boolean;
  IsReconciled: boolean;
  FilterCompanies: number[];
  Skip: number;
  Take: number;
  UiLocalTimeZone: string;
  AccountEmail: string | null;
  ExtPONumber: string | null;
  PerformerTypeIds: number[];
  IncludedTagsIDs: number[] | null;
  ExcludedTagsIDs: number[] | null;
  EventStartDate: string | null;
  UiTimeZone: string;
}

export interface TicketVaultPurchaseOrder {
  Id: number;
  ClientId: number;
  ClientName: string;
  PONotes: string | null;
  TotalCost: number;
  Adjustment: number;
  AdjustmentReason: string | null;
  Tax: number;
  TaxReason: string | null;
  Fees: number;
  ShipHandling: number;
  IncludeFees: boolean;
  IncludeShipHandling: boolean;
  InvoiceNumber: string | null;
  TotalPaid: number;
  Amount: number;
  POCost: number;
  TicketGroups: TicketVaultTicketGroup[];
}

export interface TicketVaultTicketGroup {
  Id: number;
  EventId: number;
  EventName: string;
  VenueName: string;
  EventDate: string;
  Section: string;
  Row: string;
  Quantity: number;
  StartSeat: number;
  EndSeat: number;
  TicketCost: number;
  TicketCostTotal: number;
  ExtPONumber: string | null;
  AccountEmail: string | null;
  IsGeneralAdmission: boolean;
  IsConsecutive: boolean;
  Disclosures: unknown[];
}

export interface TicketVaultUpdateTicketGroupsRequest {
  SearchRequest: null;
  Ticket: {
    Section: string;
    Row: string;
    Quantity: number;
    StartSeat: number;
    EndSeat: number;
    Disclosures: unknown[];
    IsGeneralAdmission: boolean;
    IsConsecutive: boolean;
    TicketCost: number;
    TicketCostTotal: number;
    ExtPONumber: string;
    AccountEmail: string;
  };
  EventId: number | null;
  UpdatedIds: number[];
  UiTimeZone: string;
}

// Full ticket group detail response from POS
export interface TicketGroupDetail {
  Id: string;
  CompanyID: number;
  CompanyName: string;
  Section: string;
  Row: string;
  StartSeat: number;
  EndSeat: number;
  Quantity: number;
  GeneralAdmission: boolean;
  IsOddSeating: boolean;
  SplitType: number;
  InHandType: number;
  CustomInHandDate: string | null;
  DeliveryMethod: number;
  SaltTransferType: number;
  MaskSeats: boolean;
  CostPerTicket: number;
  TotalCost: number;
  IsConsignment: boolean;
  Comission: number;
  Price: number;
  Face: number;
  TextTagIDs: number[];
  EventName: string;
  EventDateTime: string;
  VenueName: string;
  PrimaryEventName: string;
  SecondaryEventName: string;
  ProductionId: number;
  PurchaseOrderID: number;
  IsCompletelySold: boolean;
  IsPristine: boolean;
  IsCancelled: boolean;
  IsPOCancelled: boolean;
  UpdatedBy: string;
  UpdatedDate: string;
  CreatedBy: string;
  CreatedDate: string;
  Vendor: string;
  StatusTypeId: number;
  ExtPONumber: string | null;
  AccountEmail: string | null;
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = "https://app.ticketvaultpos.com";
const COMPANY_ID = 337; // TrueValue LLC
const TICKETMASTER_CLIENT_ID = 2978;
const DELIVERY_METHOD_ELECTRONIC = 50;
const SALT_TRANSFER_TYPE = 501;
const IN_HAND_TYPE = 6;
const UI_TIMEZONE = "America/New_York";

// Split Type Options for ticket sales
export const SPLIT_TYPES = {
  NONE: 0,        // All or nothing - buyer must purchase all tickets
  PAIRS: 2,       // Multiples of 2 only
  AVOID_SINGLES: 3, // Any quantity but won't leave a single ticket
  ANY: 4,         // Any quantity allowed
} as const;

export type SplitType = typeof SPLIT_TYPES[keyof typeof SPLIT_TYPES];

// Human-readable labels for split types
export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  [SPLIT_TYPES.NONE]: "None (All or Nothing)",
  [SPLIT_TYPES.PAIRS]: "Pairs (Multiples of 2)",
  [SPLIT_TYPES.AVOID_SINGLES]: "Avoid Singles",
  [SPLIT_TYPES.ANY]: "Any Quantity",
};

// Default split type - Multiples of 2
const DEFAULT_SPLIT_TYPE: SplitType = SPLIT_TYPES.PAIRS;

// =============================================================================
// Token Storage (in-memory, refreshed per session)
// =============================================================================

let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

// =============================================================================
// Helper Functions
// =============================================================================

function getDefaultHeaders(includeAuth: boolean = false): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "device-type": "4",
    freshness: "2m",
    "ngsw-bypass": "true",
    skip500error: "false",
    skip503error: "false",
    skiperror: "false",
  };

  if (includeAuth && cachedToken) {
    // The API may use cookie-based auth, but we'll try Bearer token first
    headers["Authorization"] = `Bearer ${cachedToken}`;
  }

  return headers;
}

/**
 * Format a Date object to the format expected by TicketVault API
 * Example: "Wed Oct 07 2026"
 *
 * Uses UTC methods to avoid timezone shifting issues.
 * The TicketVault API expects dates in this text format.
 */
function formatDateForApi(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Use UTC methods to prevent timezone shifting
  const dayName = days[date.getUTCDay()];
  const monthName = months[date.getUTCMonth()];
  const day = date.getUTCDate().toString().padStart(2, "0");
  const year = date.getUTCFullYear();

  return `${dayName} ${monthName} ${day} ${year}`;
}

/**
 * Generate a unique ID for ticket submission (hex string)
 */
function generateTicketId(): string {
  const chars = "0123456789ABCDEF";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Login to TicketVault and get JWT token
 */
export async function login(
  username: string,
  password: string
): Promise<TicketVaultLoginResponse> {
  const response = await fetch(`${BASE_URL}/api/Login`, {
    method: "POST",
    headers: getDefaultHeaders(false),
    body: JSON.stringify({
      userName: username,
      password: password,
      UiTimeZone: UI_TIMEZONE,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault login failed: ${response.status} - ${text}`);
  }

  const data: TicketVaultLoginResponse = await response.json();

  // Store token for subsequent requests
  cachedToken = data.Token;

  // JWT tokens typically expire in 1 hour, but we'll refresh more frequently
  // Parse the token to get expiry (it's a JWT)
  try {
    const payload = JSON.parse(atob(data.Token.split(".")[1]));
    tokenExpiresAt = payload.exp * 1000; // Convert to milliseconds
  } catch {
    // Default to 50 minutes from now
    tokenExpiresAt = Date.now() + 50 * 60 * 1000;
  }

  console.log(
    `[TicketVault] Logged in as ${data.UserName} (Company: ${data.CompanyName})`
  );
  return data;
}

/**
 * Refresh the JWT token
 */
export async function refreshToken(): Promise<string> {
  if (!cachedToken) {
    throw new Error("No token to refresh - please login first");
  }

  const response = await fetch(`${BASE_URL}/api/RefreshToken`, {
    method: "GET",
    headers: getDefaultHeaders(true),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TicketVault token refresh failed: ${response.status} - ${text}`
    );
  }

  // Response is the token as a JSON string (with quotes)
  const newToken = await response.json();
  cachedToken = newToken;

  // Update expiry
  try {
    const payload = JSON.parse(atob(newToken.split(".")[1]));
    tokenExpiresAt = payload.exp * 1000;
  } catch {
    tokenExpiresAt = Date.now() + 50 * 60 * 1000;
  }

  console.log("[TicketVault] Token refreshed");
  return newToken;
}

/**
 * Ensure we have a valid token, refreshing if needed
 */
export async function ensureAuthenticated(): Promise<void> {
  const username = process.env.TICKETVAULT_USERNAME;
  const password = process.env.TICKETVAULT_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "TICKETVAULT_USERNAME and TICKETVAULT_PASSWORD environment variables are required"
    );
  }

  // If no token or expired, login fresh
  if (!cachedToken || !tokenExpiresAt || Date.now() >= tokenExpiresAt - 60000) {
    await login(username, password);
  }
}

/**
 * Search for events by name, date, and venue
 */
export async function searchEvents(
  eventName: string,
  eventDate: Date,
  venueName: string
): Promise<TicketVaultEvent[]> {
  await ensureAuthenticated();

  const dateStr = formatDateForApi(eventDate);

  const params = new URLSearchParams({
    EventName: eventName,
    StartDate: dateStr,
    EndDate: dateStr,
    VenueName: venueName,
    ParkingPasses: "false",
    RegularEvents: "true",
    EventType: "Main",
    IsViagogoSearch: "false",
    ProductionID: "null",
    PerformerTypeIDs: "",
    UiTimeZone: UI_TIMEZONE,
  });

  const response = await fetch(
    `${BASE_URL}/api/BuyIn/EventSearch?${params.toString()}`,
    {
      method: "GET",
      headers: getDefaultHeaders(true),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TicketVault event search failed: ${response.status} - ${text}`
    );
  }

  const events: TicketVaultEvent[] = await response.json();
  console.log(
    `[TicketVault] Found ${events.length} events for "${eventName}" at "${venueName}" on ${dateStr}`
  );

  return events;
}

/**
 * Create inventory/tickets in TicketVault POS
 */
export async function saveTickets(
  eventId: number,
  eventName: string,
  venueName: string,
  eventDate: Date,
  tickets: {
    section: string;
    row: string;
    quantity: number;
    startSeat: number;
    endSeat: number;
    costPerTicket: number;
    totalCost: number;
    externalListingId: string; // Dashboard PO number
    accountEmail: string; // Account email for the purchase
    splitType?: SplitType; // Optional per-ticket split type override
    listingPrice?: number; // Optional listing price (default: 9999)
  }[],
  // Optional simplified search terms (if not provided, will extract from full names)
  searchEventName?: string,
  searchVenueName?: string
): Promise<TicketVaultSaveTicketsResponse> {
  await ensureAuthenticated();

  const dateStr = formatDateForApi(eventDate);

  // Use simplified search terms (same logic as EventSearch)
  // e.g., "Bruno Mars - The Romantic Tour" -> "bruno mars"
  // e.g., "SoFi Stadium, Inglewood, CA" -> "sofi"
  const simplifiedEventName = searchEventName || eventName.split("-")[0].trim().toLowerCase();
  const venueWords = venueName.toLowerCase().split(/[,\s]+/);
  const simplifiedVenueName = searchVenueName || venueWords[0] || venueName.substring(0, 10).toLowerCase();

  const searchRequest: TicketVaultSearchRequest = {
    EventName: simplifiedEventName,
    StartDate: dateStr,
    EndDate: dateStr,
    VenueName: simplifiedVenueName,
    ParkingPasses: false,
    RegularEvents: true,
    EventType: "Main",
    IsViagogoSearch: false,
    ProductionID: null,
  };

  const ticketVaultTickets: TicketVaultTicket[] = tickets.map((t) => ({
    Section: t.section,
    Row: t.row,
    Quantity: t.quantity,
    StartSeat: t.startSeat,
    EndSeat: t.endSeat,
    Disclosures: [],
    Id: generateTicketId(),
    CostPerTicket: t.costPerTicket,
    DeliveryMethod: DELIVERY_METHOD_ELECTRONIC,
    SaltTransferType: SALT_TRANSFER_TYPE,
    ExternalNotes: null,
    Face: t.costPerTicket,
    GeneralAdmission: false,
    InHandType: IN_HAND_TYPE,
    InternalNotes: t.accountEmail || null, // Account email in internal notes for easy lookup
    IsConsignment: false,
    IsOddSeating: false,
    MaskSeats: true,
    Price: t.listingPrice ?? 9999, // Use provided price or default
    RowAlias: "",
    SplitType: t.splitType ?? DEFAULT_SPLIT_TYPE, // Use provided split type or default (Pairs)
    TextTagIDs: null,
    TotalCost: t.totalCost,
    ProductionId: 0,
    EventName: "",
    PurchaseOrderID: null,
    IsCompletelySold: false,
    IsPristine: false,
    EventDateTime: new Date().toISOString(),
    VenueName: "",
    ExtPONumber: t.externalListingId, // Our dashboard PO number
    AccountEmail: t.accountEmail, // Account email for the purchase
    TextTagNames: "",
  }));

  const totalCost = tickets.reduce((sum, t) => sum + t.totalCost, 0);

  const poInformation: TicketVaultPoInformation = {
    Adjustment: 0,
    AdjustmentReason: "",
    ClientId: TICKETMASTER_CLIENT_ID,
    Tax: 0,
    TaxReason: "",
    Fees: 0,
    IncludeFees: true,
    IncludeShipHandling: true,
    InvoiceNumber: "",
    PaymentType: "",
    PONotes: "",
    ShipHandling: 0,
    TotalCost: totalCost,
    CompanyID: COMPANY_ID,
    MergeOnSave: true,
  };

  const request: TicketVaultSaveTicketsRequest = {
    SearchRequest: searchRequest,
    Tickets: ticketVaultTickets,
    EventIds: [eventId],
    PoInformationData: poInformation,
    SaveTicketsType: 0,
    UiTimeZone: UI_TIMEZONE,
  };

  const response = await fetch(`${BASE_URL}/api/SaveTickets`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TicketVault SaveTickets failed: ${response.status} - ${text}`
    );
  }

  const result: TicketVaultSaveTicketsResponse = await response.json();

  if (result.Success) {
    console.log(
      `[TicketVault] Saved ${result.SavedTicketIds.length} tickets, PO ID: ${result.PurchaseOrderID}`
    );
  } else {
    console.error(
      `[TicketVault] SaveTickets returned failure:`,
      result.FailedTickets,
      result.FailedEvents
    );
  }

  return result;
}

/**
 * Check if the API is accessible and credentials are valid
 */
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  companyName?: string;
}> {
  try {
    const username = process.env.TICKETVAULT_USERNAME;
    const password = process.env.TICKETVAULT_PASSWORD;

    if (!username || !password) {
      return {
        success: false,
        message: "TICKETVAULT_USERNAME and TICKETVAULT_PASSWORD not configured",
      };
    }

    const loginResult = await login(username, password);

    return {
      success: true,
      message: `Connected as ${loginResult.UserName}`,
      companyName: loginResult.CompanyName,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get purchase orders from TicketVault POS
 * 
 * @param options - Filter options for the query
 */
export async function getPurchaseOrders(options?: {
  purchaseOrderId?: number;
  eventId?: number;
  extPONumber?: string;
  accountEmail?: string;
  eventStartDate?: Date;
  skip?: number;
  take?: number;
  includeCancelled?: boolean;
}): Promise<TicketVaultPurchaseOrder[]> {
  await ensureAuthenticated();

  const request: TicketVaultPurchaseOrderRequest = {
    PurchaseOrderId: options?.purchaseOrderId ?? null,
    EventId: options?.eventId ?? null,
    PrimaryPerformerId: null,
    SecondaryPerformerId: null,
    VenueId: null,
    ClientId: null,
    TicketGroupId: null,
    Notes: null,
    UnpaidOnly: false,
    IncludeCancelled: options?.includeCancelled ?? false,
    IsTicketsReceived: false,
    IsReview: false,
    IsReconciled: false,
    FilterCompanies: [COMPANY_ID],
    Skip: options?.skip ?? 0,
    Take: options?.take ?? 500,
    UiLocalTimeZone: UI_TIMEZONE,
    AccountEmail: options?.accountEmail ?? null,
    ExtPONumber: options?.extPONumber ?? null,
    PerformerTypeIds: [],
    IncludedTagsIDs: null,
    ExcludedTagsIDs: null,
    EventStartDate: options?.eventStartDate ? formatDateForApi(options.eventStartDate) : null,
    UiTimeZone: UI_TIMEZONE,
  };

  const response = await fetch(`${BASE_URL}/api/PurchaseOrder`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault GetPurchaseOrders failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  
  // API returns { Result: [...], Count: number }
  const purchaseOrders: TicketVaultPurchaseOrder[] = data.Result || data || [];
  console.log(`[TicketVault] Fetched ${purchaseOrders.length} purchase orders`);

  return purchaseOrders;
}

/**
 * Get a single purchase order by ID
 */
export async function getPurchaseOrderById(purchaseOrderId: number): Promise<TicketVaultPurchaseOrder | null> {
  const orders = await getPurchaseOrders({ purchaseOrderId });
  return orders.length > 0 ? orders[0] : null;
}

/**
 * Find a purchase order by external PO number (our dashboard PO number)
 */
export async function getPurchaseOrderByExtPONumber(extPONumber: string): Promise<TicketVaultPurchaseOrder | null> {
  const orders = await getPurchaseOrders({ extPONumber });
  return orders.length > 0 ? orders[0] : null;
}

/**
 * Update ticket groups (to add/modify account email or other fields after creation)
 */
export async function updateTicketGroups(
  ticketGroupIds: number[],
  updates: {
    section: string;
    row: string;
    quantity: number;
    startSeat: number;
    endSeat: number;
    ticketCost: number;
    ticketCostTotal: number;
    extPONumber: string;
    accountEmail: string;
  }
): Promise<{ success: boolean }> {
  await ensureAuthenticated();

  const request: TicketVaultUpdateTicketGroupsRequest = {
    SearchRequest: null,
    Ticket: {
      Section: updates.section,
      Row: updates.row,
      Quantity: updates.quantity,
      StartSeat: updates.startSeat,
      EndSeat: updates.endSeat,
      Disclosures: [],
      IsGeneralAdmission: false,
      IsConsecutive: true,
      TicketCost: updates.ticketCost,
      TicketCostTotal: updates.ticketCostTotal,
      ExtPONumber: updates.extPONumber,
      AccountEmail: updates.accountEmail,
    },
    EventId: null,
    UpdatedIds: ticketGroupIds,
    UiTimeZone: UI_TIMEZONE,
  };

  const response = await fetch(`${BASE_URL}/api/UpdateTicketGroups`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault UpdateTicketGroups failed: ${response.status} - ${text}`);
  }

  console.log(`[TicketVault] Updated ${ticketGroupIds.length} ticket groups`);
  return { success: true };
}

/**
 * Get all ticket groups for a specific purchase order
 * GET /api/PurchaseOrder/{poId}/TicketGroups
 */
export async function getTicketGroupsForPO(
  purchaseOrderId: number
): Promise<TicketGroupDetail[]> {
  await ensureAuthenticated();

  const response = await fetch(
    `${BASE_URL}/api/PurchaseOrder/${purchaseOrderId}/TicketGroups`,
    {
      method: "GET",
      headers: getDefaultHeaders(true),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TicketVault GetTicketGroupsForPO failed: ${response.status} - ${text}`
    );
  }

  const ticketGroups: TicketGroupDetail[] = await response.json();
  console.log(
    `[TicketVault] Fetched ${ticketGroups.length} ticket groups for PO ${purchaseOrderId}`
  );

  return ticketGroups;
}

/**
 * Get ticket groups by their IDs (batch lookup)
 * POST /api/PurchaseOrder/TicketGroups
 */
export async function getTicketGroupsByIds(
  ticketGroupIds: string[]
): Promise<TicketGroupDetail[]> {
  await ensureAuthenticated();

  const response = await fetch(`${BASE_URL}/api/PurchaseOrder/TicketGroups`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(ticketGroupIds),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TicketVault GetTicketGroupsByIds failed: ${response.status} - ${text}`
    );
  }

  const ticketGroups: TicketGroupDetail[] = await response.json();
  console.log(
    `[TicketVault] Fetched ${ticketGroups.length} ticket groups by IDs`
  );

  return ticketGroups;
}

/**
 * Find a ticket group by external PO number
 * Searches all recent POs and their ticket groups
 */
export async function findTicketGroupByExtPONumber(
  extPONumber: string
): Promise<{ purchaseOrder: TicketVaultPurchaseOrder; ticketGroup: TicketGroupDetail } | null> {
  await ensureAuthenticated();

  // Get recent POs
  const orders = await getPurchaseOrders({ take: 100 });

  // Search each PO's ticket groups for the matching ExtPONumber
  for (const order of orders) {
    try {
      const ticketGroups = await getTicketGroupsForPO(order.Id);
      const match = ticketGroups.find((tg) => tg.ExtPONumber === extPONumber);
      if (match) {
        return { purchaseOrder: order, ticketGroup: match };
      }
    } catch (error) {
      console.warn(
        `[TicketVault] Could not fetch ticket groups for PO ${order.Id}:`,
        error
      );
    }
  }

  return null;
}

/**
 * Get ticket group info from Operations/Inventory view
 * This returns the correct TicketGroupID field needed for updates
 * POST /api/GetOperationsInfo
 */
export interface OperationsTicketGroup {
  // Core IDs
  TicketGroupID: number;
  SourceTicketGroupID: number;
  ProductionID: number;
  
  // Event info
  PrimaryEventName: string;
  SecondaryEventName?: string;
  VenueName: string;
  VenueCity?: string;
  EventDateTime: string;
  
  // Ticket details
  Section: string;
  Row: string;
  StartSeat: number;
  EndSeat: number;
  SeatsRange?: string;
  Quantity: number;
  
  // Pricing - Note: Price is always 0, use MarketPrice for listing price
  Cost: number;
  Price: number; // Always 0 in API response
  MarketPrice: number; // This is the actual listing price
  
  // Account info
  AccountEmail?: string;
  InternalNote?: string;
  // ExtPONumber comes from HtmlExtPOIDMultiLineTooltip in API response
  HtmlExtPOIDEllipsis?: string;
  HtmlExtPOIDMultiLineTooltip?: string;
  
  // Match status fields
  IsFullyMapped: boolean;
  BarcodesCount: number;
  LinksCount: number;
  DocumentsCount: number;
  Pdf: string; // Format: "uploaded/total" e.g., "0/2" or "2/2"
  
  // Status
  StatusTypeId: number;
  POVendor?: string;
  InhandDate?: string;
  
  // Purchase Order info
  PurchaseOrderID?: number;
  HtmlPOIDEllipsis?: string;
  
  // Marketplace IDs (for external links)
  VividEventID?: number;
  StubhubEventID?: number;
  SeatGeekEventID?: number;
  TMEventID?: string;
  
  // Company info
  CompanyID?: number;
  CompanyName?: string;
}

interface GetOperationsInfoResponse {
  Result: OperationsTicketGroup[];
}

export async function getOperationsInfoByExtPONumber(
  extPONumber: string
): Promise<OperationsTicketGroup | null> {
  await ensureAuthenticated();

  // Get date range for last 2 years to cover all tickets
  const today = new Date();
  const startDate = formatDateForApi(today);
  const endDate = new Date(today);
  endDate.setFullYear(endDate.getFullYear() + 2);
  const endDateStr = formatDateForApi(endDate);

  const request = {
    EventStartDate: startDate,
    EventEndDate: endDateStr,
    EventId: null,
    SecondaryEventId: null,
    VenueId: null,
    VendorId: null,
    TicketGroupStatuses: [1, 4], // Active statuses
    TicketGroupNetworkTypes: [],
    IncludeAvailable: false,
    IncludeExpired: false,
    IncludeCancelled: false,
    IncludePOVendor: true,
    FilterCompanies: [COMPANY_ID],
    DeliveryTypeIds: null,
    TransferTypeIds: null,
    TicketGroupIds: null,
    ShowRowAliasFilter: null,
    ShowMaskedSeatFilter: null,
    MatchedInventoryFilter: null,
    Row: null,
    Section: null,
    ProductionID: null,
    Skip: 0,
    Take: 100,
    VisibleOperationsColumnIDs: [],
    ExtPONumber: extPONumber, // Filter by our ExtPONumber
    AccountEmail: null,
    IsRowExactMatch: false,
    IsSectionExactMatch: false,
    PerformerTypeIDs: [],
    IncludedTagsIDs: [],
    ExcludedTagsIDs: [],
    RegularEventsOnly: false,
    ParkingOnly: false,
    UiTimeZone: UI_TIMEZONE,
  };

  console.log(`[TicketVault] Looking up TicketGroupID for ExtPONumber: ${extPONumber}`);

  const response = await fetch(`${BASE_URL}/api/GetOperationsInfo`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault GetOperationsInfo failed: ${response.status} - ${text}`);
  }

  const data: GetOperationsInfoResponse = await response.json();
  
  if (data.Result && data.Result.length > 0) {
    console.log(`[TicketVault] Found TicketGroupID ${data.Result[0].TicketGroupID} for ExtPONumber ${extPONumber}`);
    return data.Result[0];
  }

  console.log(`[TicketVault] No ticket group found for ExtPONumber ${extPONumber}`);
  return null;
}

/**
 * Get ALL ticket groups from Operations/Inventory view
 * Used for bulk sync to local database
 * POST /api/GetOperationsInfo
 */
export async function getAllOperationsInfo(options?: {
  skip?: number;
  take?: number;
}): Promise<{ listings: OperationsTicketGroup[]; total: number }> {
  await ensureAuthenticated();

  // Get date range for events
  const today = new Date();
  const startDate = formatDateForApi(today);
  const endDate = new Date(today);
  endDate.setFullYear(endDate.getFullYear() + 2);
  const endDateStr = formatDateForApi(endDate);

  const request = {
    EventStartDate: startDate,
    EventEndDate: endDateStr,
    EventId: null,
    SecondaryEventId: null,
    VenueId: null,
    VendorId: null,
    TicketGroupStatuses: [1, 4], // Active statuses
    TicketGroupNetworkTypes: [],
    IncludeAvailable: false,
    IncludeExpired: false,
    IncludeCancelled: false,
    IncludePOVendor: true,
    FilterCompanies: [COMPANY_ID],
    DeliveryTypeIds: null,
    TransferTypeIds: null,
    TicketGroupIds: null,
    ShowRowAliasFilter: null,
    ShowMaskedSeatFilter: null,
    MatchedInventoryFilter: null,
    Row: null,
    Section: null,
    ProductionID: null,
    Skip: options?.skip || 0,
    Take: options?.take || 500,
    VisibleOperationsColumnIDs: [],
    ExtPONumber: null, // No filter - get all
    AccountEmail: null,
    IsRowExactMatch: false,
    IsSectionExactMatch: false,
    PerformerTypeIDs: [],
    IncludedTagsIDs: [],
    ExcludedTagsIDs: [],
    RegularEventsOnly: false,
    ParkingOnly: false,
    UiTimeZone: UI_TIMEZONE,
  };

  console.log(`[TicketVault] Fetching all listings (skip: ${options?.skip || 0}, take: ${options?.take || 500})`);

  const response = await fetch(`${BASE_URL}/api/GetOperationsInfo`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault GetOperationsInfo failed: ${response.status} - ${text}`);
  }

  const data: GetOperationsInfoResponse = await response.json();
  const listings = data.Result || [];
  
  console.log(`[TicketVault] Fetched ${listings.length} listings from POS`);
  
  return {
    listings,
    total: listings.length, // API doesn't return total count
  };
}

/**
 * Update listing price in TicketVault
 * Uses the /api/ticketGroup/price endpoint for direct price updates
 */
export async function updateListingPrice(
  ticketGroupId: number,
  newPrice: number,
  productionId?: number
): Promise<{ success: boolean }> {
  await ensureAuthenticated();

  // If productionId not provided, look it up from the listing
  let prodId = productionId;
  if (!prodId) {
    const allListings = await getAllOperationsInfo({ take: 500 });
    const listing = allListings.listings.find(l => l.TicketGroupID === ticketGroupId);
    
    if (!listing) {
      throw new Error(`Ticket group ${ticketGroupId} not found`);
    }
    
    prodId = listing.ProductionID;
  }

  const request = {
    TicketGroupID: ticketGroupId,
    MarketPrice: newPrice,
    ProductionID: prodId,
    UiTimeZone: UI_TIMEZONE,
  };

  console.log(`[TicketVault] Updating price for ticket group ${ticketGroupId} to $${newPrice}`);

  const response = await fetch(`${BASE_URL}/api/ticketGroup/price`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault price update failed: ${response.status} - ${text}`);
  }

  console.log(`[TicketVault] Successfully updated price for ticket group ${ticketGroupId} to $${newPrice}`);
  return { success: true };
}

/**
 * Update internal notes on existing ticket groups
 * POST /api/ticketgroups/notes/update
 */
export async function updateTicketGroupNotes(
  ticketGroupIds: number[],
  internalNote: string,
  externalNote?: string
): Promise<{ success: boolean }> {
  await ensureAuthenticated();

  const request = {
    TicketGroupIds: ticketGroupIds,
    IntMode: 0, // 0 = replace, 1 = append
    ExtMode: 0,
    IntNote: internalNote,
    ExtNote: externalNote || "",
    IsIntNoteUpdate: true,
    IsExtNoteUpdate: !!externalNote,
    UiTimeZone: UI_TIMEZONE,
  };

  console.log(`[TicketVault] Updating internal notes - Request:`, JSON.stringify(request));
  
  const response = await fetch(`${BASE_URL}/api/ticketgroups/notes/update`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  const responseText = await response.text();
  console.log(`[TicketVault] UpdateTicketGroupNotes response (${response.status}):`, responseText);

  if (!response.ok) {
    throw new Error(
      `TicketVault UpdateTicketGroupNotes failed: ${response.status} - ${responseText}`
    );
  }

  // Check for error in response body (API returns 200 even on failure)
  try {
    const result = JSON.parse(responseText);
    if (result.IsError) {
      throw new Error(
        `TicketVault UpdateTicketGroupNotes failed: ${result.ErrorMessage}`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("UpdateTicketGroupNotes failed")) {
      throw e;
    }
    // If JSON parse fails, assume success
  }

  console.log(
    `[TicketVault] Updated internal notes on ${ticketGroupIds.length} ticket groups`
  );
  return { success: true };
}

// =============================================================================
// Season Sites (Connected Accounts) APIs
// =============================================================================

/**
 * A connected account (e.g., Ticketmaster account) in TicketVault
 */
export interface SeasonSite {
  CompanySeasonSiteID: number;
  SeasonSiteID: number;
  UserName: string; // The account email
  Site: string; // e.g., "Ticketmaster"
  Url: string;
  InvalidCredentials: boolean;
  IsDeleted: boolean;
  CompanyName: string;
  LastCheckedDateTimeUTC: string | null;
  ProcessingStatus: string | null;
  LastError: string | null;
  TotalCountForPaginator: number;
  TotalAddedAfterLastSync: number;
  TotalUpdatedAfterLastSync: number;
}

/**
 * Get list of connected accounts (season sites)
 * POST /api/settings/seasonsiteslist
 */
export async function getSeasonSitesList(): Promise<SeasonSite[]> {
  await ensureAuthenticated();

  const request = {
    FilterCompanies: [COMPANY_ID],
    SeasonSiteIds: [],
    SeasonSiteTypeIDs: null,
    UserName: "",
    Skip: 0,
    Take: 500,
    UiTimeZone: UI_TIMEZONE,
  };

  const response = await fetch(`${BASE_URL}/api/settings/seasonsiteslist`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault GetSeasonSitesList failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  
  // Response uses CompanySeasonSites field
  const sites = data.CompanySeasonSites || [];
  console.log(`[TicketVault] Fetched ${sites.length} season sites`);
  return sites as SeasonSite[];
}

/**
 * Find season site by account email
 */
export async function findSeasonSiteByEmail(email: string): Promise<SeasonSite | null> {
  const sites = await getSeasonSitesList();
  const normalizedEmail = email.toLowerCase().trim();
  return sites.find(s => s.UserName?.toLowerCase().trim() === normalizedEmail) || null;
}

/**
 * Trigger sync/refresh for specific season sites (accounts)
 * PUT /api/settings/refreshseasonsites
 */
export async function refreshSeasonSites(
  companySeasonSiteIds: number[],
  options?: {
    eventStartDate?: Date;
    eventEndDate?: Date;
    includeTBD?: boolean;
  }
): Promise<{ success: boolean }> {
  await ensureAuthenticated();

  // Default to 2 year range if not specified
  const startDate = options?.eventStartDate || new Date();
  const endDate = options?.eventEndDate || (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d;
  })();

  const request = {
    EventStartDate: formatDateForApi(startDate),
    EventEndDate: formatDateForApi(endDate),
    IncludeTBD: options?.includeTBD ?? false,
    CompanySeasonSiteIDs: companySeasonSiteIds,
  };

  console.log(`[TicketVault] Triggering sync for ${companySeasonSiteIds.length} accounts`);

  const response = await fetch(`${BASE_URL}/api/settings/refreshseasonsites`, {
    method: "PUT",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault RefreshSeasonSites failed: ${response.status} - ${text}`);
  }

  console.log(`[TicketVault] Sync triggered successfully for accounts: ${companySeasonSiteIds.join(", ")}`);
  return { success: true };
}

/**
 * Trigger sync for a specific account by email
 */
export async function syncAccountByEmail(email: string): Promise<{
  success: boolean;
  seasonSiteId?: number;
  error?: string;
}> {
  const site = await findSeasonSiteByEmail(email);
  
  if (!site) {
    return {
      success: false,
      error: `Account not found in TicketVault: ${email}`,
    };
  }

  await refreshSeasonSites([site.CompanySeasonSiteID]);
  
  return {
    success: true,
    seasonSiteId: site.CompanySeasonSiteID,
  };
}

/**
 * Check if a ticket is matched (has barcodes/PDFs synced from the account)
 * Uses the IsFullyMapped field from GetOperationsInfo
 */
export async function checkTicketMatchStatus(extPONumber: string): Promise<{
  found: boolean;
  isMatched: boolean;
  ticketGroupId?: number;
  accountEmail?: string;
  barcodesCount?: number;
  pdfsCount?: number;
  linksCount?: number;
  pdfStatus?: string;
}> {
  const info = await getOperationsInfoByExtPONumber(extPONumber);
  
  if (!info) {
    return { found: false, isMatched: false };
  }

  // Parse the Pdf field format like "0/2" or "2/2"
  // Format is "uploaded/total" or "uploaded/total*" where * means needs attention
  const pdfMatch = info.Pdf?.match(/^(\d+)\/(\d+)/);
  const uploadedPdfs = pdfMatch ? parseInt(pdfMatch[1], 10) : 0;

  return {
    found: true,
    isMatched: info.IsFullyMapped,
    ticketGroupId: info.TicketGroupID,
    accountEmail: info.AccountEmail,
    barcodesCount: info.BarcodesCount,
    pdfsCount: uploadedPdfs,
    linksCount: info.LinksCount,
    pdfStatus: info.Pdf,
  };
}

// =============================================================================
// Purchase Account Types (for account import to POS)
// =============================================================================

/**
 * Response from /api/purchase/account - a single account in POS
 */
export interface TicketVaultPurchaseAccount {
  PurchaseAccountId: number;  // The account ID in POS
  CompanyID: number;
  CompanyName: string;
  Username: string;           // Email
  PurchaseSiteId: number;     // 2 = Ticketmaster
  PurchaseSiteName: string;   // "Ticketmaster.com"
  IsInvalidCredentials: boolean;
  IsActive: boolean;
  DateCreatedUtc: string;
  CreateUser: string;
  UpdateDateTime: string;
  LastPasswordUpdateUtc: string | null;
}

/**
 * Request body for /api/purchase/account (get accounts)
 */
export interface TicketVaultGetAccountsRequest {
  CompanyIDs: number[];
  Username: string;
  PurchaseSiteId: number | null;
  IsOrderByUserName: boolean;
  SeasonSiteType: number;
  Skip: number;
  Take: number;
  UiTimeZone: string;
}

/**
 * Request body for /api/purchase/account/save (create account)
 */
export interface TicketVaultSaveAccountRequest {
  Account: {
    isActive: boolean;
    companyID: number;
    purchaseSiteId: number;  // 2 = Ticketmaster
    username: string;        // Email
    seatGeekToken: string | null;
    password: string;
  };
  AllowDuplicateAccountCreation: boolean;
  UiTimeZone: string;
}

// Purchase site constants
export const PURCHASE_SITES = {
  TICKETMASTER: 2,
  SEATGEEK: 3,
  AXS: 4,
} as const;

// =============================================================================
// Purchase Account API Functions
// =============================================================================

/**
 * Get all purchase accounts from TicketVault
 */
export async function getPurchaseAccounts(): Promise<TicketVaultPurchaseAccount[]> {
  await ensureAuthenticated();

  const request: TicketVaultGetAccountsRequest = {
    CompanyIDs: [COMPANY_ID],
    Username: "",
    PurchaseSiteId: null,  // Get all sites
    IsOrderByUserName: true,
    SeasonSiteType: 0,
    Skip: 0,
    Take: 500,  // Get all accounts
    UiTimeZone: UI_TIMEZONE,
  };

  const response = await fetch(`${BASE_URL}/api/purchase/account`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TicketVault GetPurchaseAccounts failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  
  // Handle different response formats - could be array directly or wrapped in object
  let accounts: TicketVaultPurchaseAccount[];
  if (Array.isArray(data)) {
    accounts = data;
  } else if (data && typeof data === 'object') {
    // Try common wrapper field names
    accounts = data.CompanySeasonSites || data.Accounts || data.accounts || data.Data || data.data || [];
    if (!Array.isArray(accounts)) {
      console.warn('[TicketVault] Unexpected response structure for getPurchaseAccounts:', Object.keys(data));
      accounts = [];
    }
  } else {
    console.warn('[TicketVault] Unexpected response type for getPurchaseAccounts:', typeof data);
    accounts = [];
  }
  
  console.log(`[TicketVault] Fetched ${accounts.length} purchase accounts from POS`);
  return accounts;
}

/**
 * Save/create a new purchase account in TicketVault
 * Returns the created account if successful
 */
export async function savePurchaseAccount(
  email: string,
  password: string,
  purchaseSiteId: number = PURCHASE_SITES.TICKETMASTER
): Promise<{ success: boolean; account?: TicketVaultPurchaseAccount; error?: string }> {
  await ensureAuthenticated();

  const request: TicketVaultSaveAccountRequest = {
    Account: {
      isActive: true,
      companyID: COMPANY_ID,
      purchaseSiteId,
      username: email,
      seatGeekToken: null,
      password,
    },
    AllowDuplicateAccountCreation: false,
    UiTimeZone: UI_TIMEZONE,
  };

  console.log(`[TicketVault] Creating purchase account: ${email}`);

  const response = await fetch(`${BASE_URL}/api/purchase/account/save`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[TicketVault] Failed to create account ${email}: ${text}`);
    return {
      success: false,
      error: `Failed to create account: ${response.status} - ${text}`,
    };
  }

  // Parse response - may be the account or just a success indicator
  const data = await response.json();
  console.log(`[TicketVault] Save account response:`, JSON.stringify(data).slice(0, 200));
  
  // Try to extract the account from different response formats
  let account: TicketVaultPurchaseAccount | undefined;
  
  if (data && data.PurchaseAccountId) {
    // Response is the account directly
    account = data as TicketVaultPurchaseAccount;
  } else if (data && typeof data === 'object') {
    // Response might be wrapped or just a success indicator
    // Fetch the account by email to get the full details
    console.log(`[TicketVault] Response doesn't contain account ID, fetching by email...`);
    const fetchedAccount = await findPurchaseAccountByEmail(email);
    if (fetchedAccount) {
      account = fetchedAccount;
    }
  }
  
  if (account) {
    console.log(`[TicketVault] Successfully created account: ${email} (ID: ${account.PurchaseAccountId})`);
  } else {
    console.log(`[TicketVault] Account created but couldn't retrieve ID for: ${email}`);
  }
  
  return {
    success: true,
    account,
  };
}

/**
 * Find a purchase account by email
 */
export async function findPurchaseAccountByEmail(email: string): Promise<TicketVaultPurchaseAccount | null> {
  const accounts = await getPurchaseAccounts();
  const normalizedEmail = email.toLowerCase().trim();
  return accounts.find(a => a.Username?.toLowerCase().trim() === normalizedEmail) || null;
}

/**
 * Check if an account exists in POS
 */
export async function isAccountInPos(email: string): Promise<boolean> {
  const account = await findPurchaseAccountByEmail(email);
  return account !== null;
}

// =============================================================================
// Season Site Management
// =============================================================================

/**
 * Season Site IDs for common sites
 */
export const SEASON_SITES = {
  TICKETMASTER: 746,  // Generic Ticketmaster sync
} as const;

/**
 * Response from adding a Season Site
 */
export interface AddSeasonSiteResponse {
  SeasonSites: Array<{
    CompanySeasonSiteID: number;
    SeasonSiteID: number;
    UserName: string;
    Site: string;
    Url: string;
    ProcessingStatus: string;
    CompanyID: number;
    PurchaseAccountID: number;
    SeasonSiteTypeID: number;
  }>;
  IsError: boolean;
}

/**
 * Add a Purchase Account as a Season Site (Sync Account)
 * This enables ticket syncing for the account
 * 
 * POST /api/settings/seasonsites/add
 */
export async function addSeasonSite(
  purchaseAccountIds: number[],
  seasonSiteId: number = SEASON_SITES.TICKETMASTER
): Promise<{ success: boolean; seasonSites?: AddSeasonSiteResponse["SeasonSites"]; error?: string }> {
  await ensureAuthenticated();

  const request = {
    CompanyID: COMPANY_ID,
    PurchaseAccountIDs: purchaseAccountIds,
    SeasonSiteID: seasonSiteId,
    ExchangeUserName: null,
    ExchangePassword: null,
    SiteType: 1,  // 1 = Ticketmaster
    UiTimeZone: "America/New_York",
  };

  console.log(`[TicketVault] Adding ${purchaseAccountIds.length} account(s) as Season Site(s)...`);

  const response = await fetch(`${BASE_URL}/api/settings/seasonsites/add`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TicketVault] Failed to add Season Site: ${response.status} - ${errorText}`);
    return {
      success: false,
      error: `Failed to add Season Site: ${response.status}`,
    };
  }

  const data = await response.json() as AddSeasonSiteResponse;
  
  if (data.IsError) {
    return {
      success: false,
      error: "TicketVault returned an error when adding Season Site",
    };
  }

  console.log(`[TicketVault] Successfully added ${data.SeasonSites?.length || 0} Season Site(s)`);
  
  return {
    success: true,
    seasonSites: data.SeasonSites,
  };
}

/**
 * Add a single Purchase Account as a Season Site by email
 * First finds the Purchase Account, then adds it as a Season Site
 */
export async function addSeasonSiteByEmail(
  email: string
): Promise<{ success: boolean; companySeasonSiteId?: number; error?: string }> {
  // First find the Purchase Account
  const purchaseAccount = await findPurchaseAccountByEmail(email);
  
  if (!purchaseAccount) {
    return {
      success: false,
      error: `Purchase Account not found for email: ${email}`,
    };
  }

  // Check if already a Season Site
  const existingSeasonSite = await findSeasonSiteByEmail(email);
  if (existingSeasonSite) {
    return {
      success: true,
      companySeasonSiteId: existingSeasonSite.CompanySeasonSiteID,
    };
  }

  // Add as Season Site
  const result = await addSeasonSite([purchaseAccount.PurchaseAccountId]);
  
  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  const createdSite = result.seasonSites?.find(
    s => s.UserName?.toLowerCase() === email.toLowerCase()
  );

  return {
    success: true,
    companySeasonSiteId: createdSite?.CompanySeasonSiteID,
  };
}

// =============================================================================
// Sales Queue & Invoices
// =============================================================================

/**
 * Sales Queue item from /api/salesQueue
 */
export interface SalesQueueItem {
  // IDs
  TicketGroupID: number;
  InvoiceNumber: number;
  OrderID: number;
  PurchaseOrderID?: number;
  
  // Event info
  PrimaryEventName: string;
  SecondaryEventName?: string;
  EventDateTime: string;
  VenueName: string;
  VenueCity?: string;
  
  // Ticket details
  Section: string;
  Row: string;
  Seats?: string;
  Quantity: number;
  
  // Pricing
  SalePrice: number;
  Cost: number;
  
  // Buyer
  BuyerEmail?: string;
  BuyerName?: string;
  ClientName?: string;
  
  // Status
  Status: number;
  StatusName?: string;
  DeliveryType?: string;
  DeliveryTypeName?: string;
  TransferType?: string;
  TransferTypeName?: string;
  
  // Fulfillment flags
  IsComplete?: boolean;
  NeedsShipping?: boolean;
  IsMobileInfoNeeded?: boolean;
  IsPdfBcMissing?: boolean;
  
  // External order
  ExtOrderNumber?: string;
  ExtPONumber?: string;
  
  // Timestamps
  SaleDate?: string;
  InvoiceDate?: string;
}

/**
 * Invoice item from /api/Invoices
 */
export interface InvoiceItem {
  InvoiceNumber: number;
  ClientID?: number;
  ClientName?: string;
  ClientEmail?: string;
  
  // Event info
  PrimaryEventName?: string;
  SecondaryEventName?: string;
  EventDateTime?: string;
  VenueName?: string;
  
  // Ticket info
  Section?: string;
  Row?: string;
  Quantity: number;
  
  // Financials
  TotalAmount: number;
  Fees?: number;
  Cost?: number;
  
  // Payment status
  IsPaid: boolean;
  PayoutStatus?: string;
  RemittanceStatus?: string;
  RemittanceDate?: string;
  
  // Status
  IsCancelled?: boolean;
  
  // Links
  ExtPONumber?: string;
  ExtOrderNumber?: string;
  TicketGroupID?: number;
  
  // Timestamps
  InvoiceDate?: string;
}

/**
 * Get sales queue (pending fulfillments)
 * POST /api/salesQueue
 */
export async function getSalesQueue(options?: {
  status?: number[];
  limit?: number;
}): Promise<SalesQueueItem[]> {
  await ensureAuthenticated();

  const status = options?.status || [40, 20]; // Default: Complete + Pending
  const limit = options?.limit || 200;

  const request = {
    ClientId: null,
    VenueId: null,
    DeliveryTypeIds: [],
    TransferTypeIds: [],
    ExtOrderNumber: null,
    PrimaryPerformerId: null,
    InvoiceNumber: null,
    SecondaryPerformerId: null,
    SelectTop: limit,
    Status: status,
    InternalFulfillmentStatus: [],
    IsCompleteStatus: true,
    IsNeedToShipStatus: true,
    IsMobileInfoNeededStatus: true,
    IsPdfBcMissingStatus: true,
    LostAndFoundStatus: false,
    FilterCompanies: [COMPANY_ID],
    POAccountEmail: null,
    PerformerTypeIDs: [],
    IncludedTagsIDs: null,
    ExcludedTagsIDs: null,
    Section: null,
    Row: null,
    UiTimeZone: "America/New_York",
  };

  console.log(`[TicketVault] Fetching sales queue (status: ${status.join(',')})`);

  const response = await fetch(`${BASE_URL}/api/salesQueue`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error(`[TicketVault] Failed to get sales queue: ${response.status}`);
    return [];
  }

  const data = await response.json();
  
  // Handle different response structures
  let sales: SalesQueueItem[];
  if (Array.isArray(data)) {
    sales = data;
  } else if (data && Array.isArray(data.SaleRequests)) {
    sales = data.SaleRequests;
  } else if (data && Array.isArray(data.Result)) {
    sales = data.Result;
  } else if (data && Array.isArray(data.Sales)) {
    sales = data.Sales;
  } else {
    console.warn('[TicketVault] Unexpected sales queue response structure:', Object.keys(data || {}));
    sales = [];
  }

  console.log(`[TicketVault] Fetched ${sales.length} sales from queue`);
  return sales;
}

/**
 * Get invoices
 * POST /api/Invoices
 */
export async function getInvoices(options?: {
  unpaidOnly?: boolean;
  cancelledOnly?: boolean;
  includeCancelled?: boolean;
  skip?: number;
  take?: number;
}): Promise<InvoiceItem[]> {
  await ensureAuthenticated();

  const request = {
    PrimaryEventID: null,
    SecondaryEventID: null,
    ClientId: null,
    VendorId: null,
    EventID: null,
    VenueId: null,
    IncludeCancelled: options?.includeCancelled ?? false,
    UnpaidOnly: options?.unpaidOnly ?? false,
    CancelledOnly: options?.cancelledOnly ?? false,
    FilterCompanies: [COMPANY_ID],
    InvoiceListString: null,
    ExtOrderListString: null,
    AccountEmail: null,
    ExtPONumber: null,
    Take: options?.take || 500,
    Skip: options?.skip || 0,
    PerformerTypeIDs: [],
    IsRowExactMatch: false,
    IsSectionExactMatch: false,
    Row: null,
    Section: null,
    IncludedTagsIDs: [],
    ExcludedTagsIDs: [],
    UiTimeZone: "America/New_York",
  };

  console.log(`[TicketVault] Fetching invoices (unpaidOnly: ${options?.unpaidOnly})`);

  const response = await fetch(`${BASE_URL}/api/Invoices`, {
    method: "POST",
    headers: getDefaultHeaders(true),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error(`[TicketVault] Failed to get invoices: ${response.status}`);
    return [];
  }

  const data = await response.json();
  
  // Handle different response structures
  let invoices: InvoiceItem[];
  if (Array.isArray(data)) {
    invoices = data;
  } else if (data && Array.isArray(data.Result)) {
    invoices = data.Result;
  } else if (data && Array.isArray(data.Invoices)) {
    invoices = data.Invoices;
  } else {
    console.warn('[TicketVault] Unexpected invoices response structure:', Object.keys(data || {}));
    invoices = [];
  }

  console.log(`[TicketVault] Fetched ${invoices.length} invoices`);
  return invoices;
}

// =============================================================================
// Exports
// =============================================================================

export const TicketVaultApi = {
  login,
  refreshToken,
  ensureAuthenticated,
  searchEvents,
  saveTickets,
  testConnection,
  formatDateForApi,
  getPurchaseOrders,
  getPurchaseOrderById,
  getPurchaseOrderByExtPONumber,
  updateTicketGroups,
  getTicketGroupsForPO,
  getTicketGroupsByIds,
  findTicketGroupByExtPONumber,
  updateTicketGroupNotes,
  getOperationsInfoByExtPONumber,
  getAllOperationsInfo,
  updateListingPrice,
  getSeasonSitesList,
  findSeasonSiteByEmail,
  refreshSeasonSites,
  syncAccountByEmail,
  checkTicketMatchStatus,
  // Purchase account management
  getPurchaseAccounts,
  savePurchaseAccount,
  findPurchaseAccountByEmail,
  isAccountInPos,
  // Season Site management
  addSeasonSite,
  addSeasonSiteByEmail,
  // Sales & Invoices
  getSalesQueue,
  getInvoices,
  // Constants
  SPLIT_TYPES,
  SPLIT_TYPE_LABELS,
  PURCHASE_SITES,
  SEASON_SITES,
};
