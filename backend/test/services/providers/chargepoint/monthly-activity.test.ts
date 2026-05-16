import { describe, expect, it } from 'vitest';
import {
  type ChargePointMonthlyChargingActivityResponse,
  isChargePointMonthlyChargingActivityResponse,
  parseMonthlyChargingActivityResponse,
} from '../../../../src/services/providers/chargepoint/models/monthly-activity.js';

function buildValidResponse(): ChargePointMonthlyChargingActivityResponse {
  const vehicleId = 41720531;

  return {
    charging_activity_monthly: {
      primary_vehicle: {
        year: 2024,
        model: 'Atlas-E',
        make: 'Northwind Motors',
      },
      month_info: [
        {
          sessions: [
            {
              country: 'Freedonia',
              city: 'Harborview',
              purpose: 'PERSONAL',
              power_kw_display: '0.00',
              is_purpose_finalized: true,
              update_period: 8000,
              lon: -71.442167335,
              power_kw: 0,
              session_time: 4908000,
              has_charging_receipt: true,
              payment_completed: true,
              energy_kwh: 9.37224,
              device_name: 'HARBORVIEW GARAGE / BAY 04',
              api_flag: true,
              outlet_number: 2,
              state_name: 'North Province',
              organization_currency: 'FDC',
              currency_iso_code: 'FDC',
              current_charging: 'done',
              vehicle_id: vehicleId,
              lat: 18.305974112,
              port_level: 2,
              charging_time: 4895000,
              device_id: 58412077,
              company_id: 38142,
              is_home_charger: false,
              address1: '742 Example Avenue',
              end_time: 1777167814000,
              energy_kwh_display: '9.3722',
              session_id_string: '7482051934',
              session_id: 7482051934,
              is_mfhs_enabled: false,
              zipcode: '00042',
              last_update_data_timestamp: 1777167814000,
              start_time: 1777162907000,
              payment_type: 'paid',
              total_amount: 2.78,
              company_name: 'Example Transit Authority',
              billing_time: 1777167860000,
              start_offset: -25200,
              miles_added: 22.411878260869564,
              stop_charge_supported: true,
            },
          ],
          energy_kwh: {
            public: 118,
          },
          cost: {
            public: 8,
            currency_iso_code: 'FDC',
          },
          month: 4,
          year: 2026,
          miles_added: {
            public: 282,
          },
          vehicle_info: {
            [String(vehicleId)]: {
              year: 2024,
              ev_range: 33,
              is_primary_vehicle: true,
              model: 'Atlas-E',
              battery_capacity: 13.8,
              vehicle_id: vehicleId,
              make: 'Northwind Motors',
            },
          },
        },
      ],
      page_offset: 'p_2026_3',
    },
  };
}

describe('chargepoint monthly activity model', () => {
  it('parses a representative valid payload', () => {
    const response = buildValidResponse();

    expect(isChargePointMonthlyChargingActivityResponse(response)).toBe(true);
    expect(parseMonthlyChargingActivityResponse(response)).toEqual(response);
  });

  it('accepts sessions that omit optional total_amount_to_user', () => {
    const response = buildValidResponse();
    response.charging_activity_monthly.month_info[0]?.sessions.push({
      ...response.charging_activity_monthly.month_info[0]!.sessions[0]!,
      session_id: 1824500673,
      session_id_string: '1824500673',
      start_time: 1776967437000,
      end_time: 1776969291000,
      billing_time: 1776969298000,
      last_update_data_timestamp: 1776969291000,
      device_name: 'EXAMPLE CAMPUS / BAY 07',
      device_id: 93014428,
      company_id: 41207,
      lat: 12.884510771,
      lon: -64.330928451,
    });

    expect(parseMonthlyChargingActivityResponse(response)).toEqual(response);
  });

  it('accepts sessions that omit optional last_update_data_timestamp', () => {
    const response = buildValidResponse();
    const session = {
      ...response.charging_activity_monthly.month_info[0]!.sessions[0]!,
    };

    delete session.last_update_data_timestamp;
    response.charging_activity_monthly.month_info[0]!.sessions = [session];

    expect(parseMonthlyChargingActivityResponse(response)).toEqual(response);
  });

  it('accepts payloads that omit non-persisted and nullable fields', () => {
    const response = buildValidResponse();
    delete response.charging_activity_monthly.primary_vehicle;

    const monthInfo = response.charging_activity_monthly.month_info[0];
    delete monthInfo.energy_kwh;
    delete monthInfo.cost;
    delete monthInfo.month;
    delete monthInfo.year;
    delete monthInfo.miles_added;
    delete monthInfo.vehicle_info;

    const session = monthInfo.sessions[0];
    delete session.country;
    delete session.city;
    delete session.purpose;
    delete session.power_kw_display;
    delete session.is_purpose_finalized;
    delete session.update_period;
    delete session.lon;
    delete session.power_kw;
    delete session.session_time;
    delete session.has_charging_receipt;
    delete session.payment_completed;
    delete session.total_amount_to_user;
    delete session.device_name;
    delete session.api_flag;
    delete session.outlet_number;
    delete session.state_name;
    delete session.organization_currency;
    delete session.currency_iso_code;
    delete session.current_charging;
    delete session.vehicle_id;
    delete session.lat;
    delete session.port_level;
    delete session.device_id;
    delete session.company_id;
    delete session.is_home_charger;
    delete session.address1;
    delete session.end_time;
    delete session.energy_kwh_display;
    delete session.session_id_string;
    delete session.session_id;
    delete session.is_mfhs_enabled;
    delete session.zipcode;
    delete session.last_update_data_timestamp;
    delete session.payment_type;
    delete session.company_name;
    delete session.billing_time;
    delete session.start_offset;
    delete session.miles_added;
    delete session.stop_charge_supported;

    expect(parseMonthlyChargingActivityResponse(response)).toEqual(response);
  });

  it('rejects malformed top-level payloads', () => {
    const response = buildValidResponse();
    const invalid = {
      ...response,
      charging_activity_monthly: {
        ...response.charging_activity_monthly,
        page_offset: 123,
      },
    };

    expect(isChargePointMonthlyChargingActivityResponse(invalid)).toBe(false);
    expect(parseMonthlyChargingActivityResponse(invalid)).toBeNull();
  });
});
