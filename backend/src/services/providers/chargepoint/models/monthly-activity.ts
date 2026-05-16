export interface ChargePointMonthlyChargingActivityResponse {
  charging_activity_monthly: ChargePointMonthlyChargingActivity;
}

export interface ChargePointMonthlyChargingActivity {
  primary_vehicle?: ChargePointPrimaryVehicle;
  month_info: ChargePointMonthlyChargingActivityMonthInfo[];
  page_offset: string;
}

export interface ChargePointPrimaryVehicle {
  year?: number;
  model?: string;
  make?: string;
}

export interface ChargePointMonthlyChargingActivityMonthInfo {
  sessions: ChargePointChargingSession[];
  energy_kwh?: ChargePointPublicMetric;
  cost?: ChargePointMonthlyChargingActivityCost;
  month?: number;
  year?: number;
  miles_added?: ChargePointPublicMetric;
  vehicle_info?: Record<string, ChargePointVehicleInfo>;
}

export interface ChargePointPublicMetric {
  public?: number;
}

export interface ChargePointMonthlyChargingActivityCost extends ChargePointPublicMetric {
  currency_iso_code?: string;
}

export interface ChargePointVehicleInfo {
  year?: number;
  ev_range?: number;
  is_primary_vehicle?: boolean;
  model?: string;
  battery_capacity?: number;
  vehicle_id?: number;
  make?: string;
}

export interface ChargePointChargingSession {
  country?: string;
  city?: string;
  purpose?: string;
  power_kw_display?: string;
  is_purpose_finalized?: boolean;
  update_period?: number;
  lon?: number;
  power_kw?: number;
  session_time?: number;
  has_charging_receipt?: boolean;
  payment_completed?: boolean;
  energy_kwh: number;
  total_amount_to_user?: number;
  device_name?: string;
  api_flag?: boolean;
  outlet_number?: number;
  state_name?: string;
  organization_currency?: string;
  currency_iso_code?: string;
  current_charging?: string;
  vehicle_id?: number;
  lat?: number;
  port_level?: number;
  charging_time: number;
  device_id?: number;
  company_id?: number;
  is_home_charger?: boolean;
  address1?: string;
  end_time?: number;
  energy_kwh_display?: string;
  session_id_string?: string;
  session_id?: number;
  is_mfhs_enabled?: boolean;
  zipcode?: string;
  last_update_data_timestamp?: number;
  start_time: number;
  payment_type?: string;
  total_amount: number;
  company_name?: string;
  billing_time?: number;
  start_offset?: number;
  miles_added?: number;
  stop_charge_supported?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || isNumber(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || isBoolean(value);
}

function isPublicMetric(value: unknown): value is ChargePointPublicMetric {
  return isRecord(value) && isOptionalNumber(value.public);
}

function isCost(value: unknown): value is ChargePointMonthlyChargingActivityCost {
  return (
    isRecord(value) && isOptionalNumber(value.public) && isOptionalString(value.currency_iso_code)
  );
}

function isPrimaryVehicle(value: unknown): value is ChargePointPrimaryVehicle {
  return (
    isRecord(value) &&
    isOptionalNumber(value.year) &&
    isOptionalString(value.model) &&
    isOptionalString(value.make)
  );
}

function isVehicleInfo(value: unknown): value is ChargePointVehicleInfo {
  return (
    isRecord(value) &&
    isOptionalNumber(value.year) &&
    isOptionalNumber(value.ev_range) &&
    isOptionalBoolean(value.is_primary_vehicle) &&
    isOptionalString(value.model) &&
    isOptionalNumber(value.battery_capacity) &&
    isOptionalNumber(value.vehicle_id) &&
    isOptionalString(value.make)
  );
}

function isVehicleInfoMap(value: unknown): value is Record<string, ChargePointVehicleInfo> {
  return isRecord(value) && Object.values(value).every((entry) => isVehicleInfo(entry));
}

function isChargingSession(value: unknown): value is ChargePointChargingSession {
  return (
    isRecord(value) &&
    isOptionalString(value.country) &&
    isOptionalString(value.city) &&
    isOptionalString(value.purpose) &&
    isOptionalString(value.power_kw_display) &&
    isOptionalBoolean(value.is_purpose_finalized) &&
    isOptionalNumber(value.update_period) &&
    isOptionalNumber(value.lon) &&
    isOptionalNumber(value.power_kw) &&
    isOptionalNumber(value.session_time) &&
    isOptionalBoolean(value.has_charging_receipt) &&
    isOptionalBoolean(value.payment_completed) &&
    isNumber(value.energy_kwh) &&
    isOptionalNumber(value.total_amount_to_user) &&
    isOptionalString(value.device_name) &&
    isOptionalBoolean(value.api_flag) &&
    isOptionalNumber(value.outlet_number) &&
    isOptionalString(value.state_name) &&
    isOptionalString(value.organization_currency) &&
    isOptionalString(value.currency_iso_code) &&
    isOptionalString(value.current_charging) &&
    isOptionalNumber(value.vehicle_id) &&
    isOptionalNumber(value.lat) &&
    isOptionalNumber(value.port_level) &&
    isNumber(value.charging_time) &&
    isOptionalNumber(value.device_id) &&
    isOptionalNumber(value.company_id) &&
    isOptionalBoolean(value.is_home_charger) &&
    isOptionalString(value.address1) &&
    isOptionalNumber(value.end_time) &&
    isOptionalString(value.energy_kwh_display) &&
    isOptionalString(value.session_id_string) &&
    isOptionalNumber(value.session_id) &&
    isOptionalBoolean(value.is_mfhs_enabled) &&
    isOptionalString(value.zipcode) &&
    isOptionalNumber(value.last_update_data_timestamp) &&
    isNumber(value.start_time) &&
    isOptionalString(value.payment_type) &&
    isNumber(value.total_amount) &&
    isOptionalString(value.company_name) &&
    isOptionalNumber(value.billing_time) &&
    isOptionalNumber(value.start_offset) &&
    isOptionalNumber(value.miles_added) &&
    isOptionalBoolean(value.stop_charge_supported)
  );
}

function isMonthInfo(value: unknown): value is ChargePointMonthlyChargingActivityMonthInfo {
  return (
    isRecord(value) &&
    Array.isArray(value.sessions) &&
    value.sessions.every((session) => isChargingSession(session)) &&
    (value.energy_kwh === undefined || isPublicMetric(value.energy_kwh)) &&
    (value.cost === undefined || isCost(value.cost)) &&
    isOptionalNumber(value.month) &&
    isOptionalNumber(value.year) &&
    (value.miles_added === undefined || isPublicMetric(value.miles_added)) &&
    (value.vehicle_info === undefined || isVehicleInfoMap(value.vehicle_info))
  );
}

export function isChargePointMonthlyChargingActivityResponse(
  value: unknown,
): value is ChargePointMonthlyChargingActivityResponse {
  if (!isRecord(value) || !isRecord(value.charging_activity_monthly)) {
    return false;
  }

  const activity = value.charging_activity_monthly;
  return (
    (activity.primary_vehicle === undefined || isPrimaryVehicle(activity.primary_vehicle)) &&
    Array.isArray(activity.month_info) &&
    activity.month_info.every((entry) => isMonthInfo(entry)) &&
    isString(activity.page_offset)
  );
}

export function parseMonthlyChargingActivityResponse(
  value: unknown,
): ChargePointMonthlyChargingActivityResponse | null {
  return isChargePointMonthlyChargingActivityResponse(value) ? value : null;
}
