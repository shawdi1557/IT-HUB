// src/lib/serviceAlerts.ts
// Intelligent Admin Alert System & Notification Delivery Engine
// IT HUB — Kerala, India

import {
  CANONICAL_SERVICE_METHODS,
  type CanonicalServiceMethod,
  classifyServiceMethod,
} from "./serviceClassification.ts";
import { shouldDisplayReschedulePanel } from "./serviceReschedule.ts";

export type AdminAlertEventType =
  | "NEW_COURIER_BOOKING"
  | "NEW_ONSITE_BOOKING"
  | "NEW_WALKIN_BOOKING"
  | "CUSTOMER_RESCHEDULE_REQUESTED"
  | "COURIER_DEVICE_RECEIVED"
  | "TECHNICIAN_ASSIGNMENT_PENDING"
  | "QUOTATION_APPROVED"
  | "ACTION_REQUIRED";

export interface AdminAlert {
  id: string;
  ticketId: string;
  deviceName: string;
  customerName: string;
  customerPhone?: string;
  method: CanonicalServiceMethod;
  eventType: AdminAlertEventType;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  actionRequired: boolean;
}

/**
 * Evaluates a service ticket's properties and generates actionable admin alerts.
 */
export function evaluateTicketAlerts(ticket: any): AdminAlert[] {
  if (!ticket || !ticket.id) return [];

  const alerts: AdminAlert[] = [];
  const method = classifyServiceMethod(ticket.method);
  const deviceName = `${ticket.device || "Device"}${ticket.model ? ` (${ticket.model})` : ""}`;
  const customerName = ticket.customer_name || "Valued Customer";
  const customerPhone = ticket.customer_phone || undefined;
  const timestamp = ticket.updated_at || ticket.created_at || new Date().toISOString();

  // 1. New Courier Booking
  if (method === CANONICAL_SERVICE_METHODS.COURIER && ticket.status === "Booked") {
    alerts.push({
      id: `${ticket.id}_NEW_COURIER_BOOKING`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "NEW_COURIER_BOOKING",
      title: "New Courier Booking",
      description: `New courier service booked for ${deviceName}. Verify inbound shipment tracking.`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  // 2. New On-site Technician Booking
  if (method === CANONICAL_SERVICE_METHODS.ONSITE && ticket.status === "Booked") {
    alerts.push({
      id: `${ticket.id}_NEW_ONSITE_BOOKING`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "NEW_ONSITE_BOOKING",
      title: "New On-site Visit Booking",
      description: `Doorstep technician requested for ${deviceName}. Schedule specialist visit.`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  // 3. New Visit IT HUB Booking
  if (method === CANONICAL_SERVICE_METHODS.WALK_IN && ticket.status === "Booked") {
    alerts.push({
      id: `${ticket.id}_NEW_WALKIN_BOOKING`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "NEW_WALKIN_BOOKING",
      title: "New Store Walk-In Booking",
      description: `Store intake pre-booked for ${deviceName}. Prepare intake workbench.`,
      timestamp,
      read: false,
      actionRequired: false,
    });
  }

  // 4. Customer Reschedule Request (strictly On-site visits)
  if (shouldDisplayReschedulePanel(ticket)) {
    alerts.push({
      id: `${ticket.id}_CUSTOMER_RESCHEDULE_REQUESTED`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "CUSTOMER_RESCHEDULE_REQUESTED",
      title: "Customer Reschedule Requested",
      description: `Customer requested appointment slot reschedule for ${deviceName}. Staff review required.`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  // 5. Courier Device Received
  if (method === CANONICAL_SERVICE_METHODS.COURIER && ticket.status === "Device Received") {
    alerts.push({
      id: `${ticket.id}_COURIER_DEVICE_RECEIVED`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "COURIER_DEVICE_RECEIVED",
      title: "Courier Device Received",
      description: `Inbound consignment received for ${deviceName}. Assign to lab workbench for diagnosis.`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  // 6. Technician Assignment Pending (On-site bookings without assigned staff)
  if (
    method === CANONICAL_SERVICE_METHODS.ONSITE &&
    (!ticket.technician_name || ticket.technician_name.trim() === "") &&
    ticket.status !== "Completed" &&
    ticket.status !== "Cancelled"
  ) {
    alerts.push({
      id: `${ticket.id}_TECHNICIAN_ASSIGNMENT_PENDING`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "TECHNICIAN_ASSIGNMENT_PENDING",
      title: "Technician Assignment Pending",
      description: `On-site ticket for ${deviceName} has no assigned field technician.`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  // 7. Customer Quotation Approval Received
  const hasApprovedQuote =
    ticket.quote_state === "approved" ||
    (Array.isArray(ticket.approved_items) && ticket.approved_items.length > 0);
  if (hasApprovedQuote) {
    alerts.push({
      id: `${ticket.id}_QUOTATION_APPROVED`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "QUOTATION_APPROVED",
      title: "Quotation Approved by Customer",
      description: `Customer approved repair estimate for ${deviceName}. Proceed with service.`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  // 8. Service Ticket Requiring Staff Action
  if (
    ticket.status === "Customer Arrived" ||
    ticket.status === "Reschedule Requested" ||
    (ticket.status === "Awaiting Approval" && ticket.quote_state === "pending")
  ) {
    alerts.push({
      id: `${ticket.id}_ACTION_REQUIRED_${ticket.status.replace(/\s+/g, "_")}`,
      ticketId: ticket.id,
      deviceName,
      customerName,
      customerPhone,
      method,
      eventType: "ACTION_REQUIRED",
      title: `Action Required: ${ticket.status}`,
      description:
        ticket.status === "Customer Arrived"
          ? `Customer is at the IT HUB reception for ${deviceName}. Initiate device check-in.`
          : `Urgent action required on ticket #${ticket.id.slice(0, 8)} (${deviceName}).`,
      timestamp,
      read: false,
      actionRequired: true,
    });
  }

  return alerts;
}

/**
 * Deduplicates an array of alerts by unique ID while preserving read state.
 */
export function deduplicateAlerts(alerts: AdminAlert[]): AdminAlert[] {
  const map = new Map<string, AdminAlert>();
  for (const a of alerts) {
    if (!map.has(a.id)) {
      map.set(a.id, a);
    } else {
      const existing = map.get(a.id)!;
      // If either instance is read, maintain read state
      if (existing.read || a.read) {
        map.set(a.id, { ...a, read: true });
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/**
 * Generates and merges alerts from a list of tickets, preserving any existing read states.
 */
export function generateAlertsFromTickets(
  tickets: any[],
  existingAlerts: AdminAlert[] = [],
): AdminAlert[] {
  const readSet = new Set(existingAlerts.filter((a) => a.read).map((a) => a.id));
  const rawAlerts: AdminAlert[] = [];

  for (const ticket of tickets) {
    const ticketAlerts = evaluateTicketAlerts(ticket);
    for (const alert of ticketAlerts) {
      if (readSet.has(alert.id)) {
        alert.read = true;
      }
      rawAlerts.push(alert);
    }
  }

  return deduplicateAlerts(rawAlerts);
}

/**
 * Marks a single alert as read.
 */
export function markAlertAsRead(alerts: AdminAlert[], alertId: string): AdminAlert[] {
  return alerts.map((a) => (a.id === alertId ? { ...a, read: true } : a));
}

/**
 * Marks all alerts as read.
 */
export function markAllAlertsAsRead(alerts: AdminAlert[]): AdminAlert[] {
  return alerts.map((a) => ({ ...a, read: true }));
}

/**
 * Returns count of unread alerts.
 */
export function getUnreadAlertCount(alerts: AdminAlert[]): number {
  return alerts.filter((a) => !a.read).length;
}
