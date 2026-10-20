import { describe, expect, it } from "vitest";
import { istDate, normalizeShiprocketStatus, parseShiprocketDate, parseShiprocketWebhook, prettyStatus } from "./tracking";

describe("courier statuses", () => {
  it("maps Shiprocket's status names, falling back to the numeric id", () => {
    expect(normalizeShiprocketStatus("IN TRANSIT")).toBe("in_transit");
    expect(normalizeShiprocketStatus("OUT_FOR_DELIVERY")).toBe("out_for_delivery");
    expect(normalizeShiprocketStatus("Delivered")).toBe("delivered");
    expect(normalizeShiprocketStatus("RTO DELIVERED")).toBe("rto_delivered");
    expect(normalizeShiprocketStatus("RTO IN-TRANSIT")).toBe("rto_initiated");
    expect(normalizeShiprocketStatus("UNDELIVERED")).toBe("undelivered");
    expect(normalizeShiprocketStatus("PICKUP SCHEDULED")).toBe("other");
    expect(normalizeShiprocketStatus("SOMETHING NEW", 7)).toBe("delivered");
    expect(normalizeShiprocketStatus("", null)).toBe("other");
  });

  it("writes statuses for people", () => {
    expect(prettyStatus("OUT_FOR_DELIVERY")).toBe("Out for delivery");
    expect(prettyStatus("RTO INITIATED")).toBe("RTO initiated");
  });
});

describe("Shiprocket dates", () => {
  it("reads India-time stamps in both of Shiprocket's formats", () => {
    expect(parseShiprocketDate("2026-10-21 14:05:00")).toBe("2026-10-21T08:35:00.000Z");
    expect(parseShiprocketDate("21 10 2026 14:05:00")).toBe("2026-10-21T08:35:00.000Z");
    expect(parseShiprocketDate("")).toBeNull();
    expect(parseShiprocketDate("not a date")).toBeNull();
  });

  it("gives the Indian calendar date", () => {
    expect(istDate("2026-10-22T20:00:00.000Z")).toBe("2026-10-23");
  });
});

describe("tracking webhook", () => {
  const body = {
    awb: "19041424751540",
    courier_name: "Delhivery Surface",
    current_status: "OUT FOR DELIVERY",
    current_status_id: 17,
    shipment_status: "OUT FOR DELIVERY",
    shipment_status_id: 17,
    current_timestamp: "23 10 2026 09:12:40",
    etd: "2026-10-23 18:00:00",
    scans: [
      { date: "2026-10-21 11:59:16", activity: "Picked up", location: "Mumbai_Hub (Maharashtra)" },
      { date: "2026-10-23 09:12:40", activity: "Out for delivery", location: "Bengaluru_Indiranagar (Karnataka)" },
    ],
    is_return: 0,
  };

  it("reads the status, place, time and expected date", () => {
    expect(parseShiprocketWebhook(body)).toEqual({
      awb: "19041424751540",
      status: "out_for_delivery",
      label: "Out for delivery",
      location: "Bengaluru_Indiranagar (Karnataka)",
      at: "2026-10-23T03:42:40.000Z",
      etd: "2026-10-23",
      key: "19041424751540|17|23 10 2026 09:12:40",
    });
  });

  it("ignores return shipments and payloads without an AWB", () => {
    expect(parseShiprocketWebhook({ ...body, is_return: 1 })).toBeNull();
    expect(parseShiprocketWebhook({ current_status: "DELIVERED" })).toBeNull();
  });
});
