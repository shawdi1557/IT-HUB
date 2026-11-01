// src/components/CustomerRescheduleManager.tsx
// Dedicated Customer Reschedule Appointment Module
// Handles on-site appointment rescheduling requests, validation, eligibility restrictions, and live status updates
// IT HUB — Kerala, India

import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router";
import {
  CalendarClock,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Truck,
  Store,
  Wrench,
  Info,
  ChevronRight,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Bell,
} from "lucide-react";
import { useStore } from "../app/store";
import { supabase, supabaseConfig } from "../lib/supabase";
import {
  formatTicketReference,
  requestAppointmentReschedule,
  fetchUserServiceRequests,
} from "../lib/services";
import {
  isRescheduleEligible,
  validateRequestedAppointmentDate,
  formatAppointmentDisplay,
} from "../lib/serviceReschedule";
import {
  fetchCustomerNotifications,
  markCustomerNotificationAsRead,
  subscribeCustomerNotifications,
  type CustomerNotification,
} from "../lib/customerNotifications";
import { Badge, Button, Empty } from "./ui";

const TIME_SLOTS = [
  "Morning (10:00 AM – 1:00 PM)",
  "Afternoon (1:00 PM – 4:00 PM)",
  "Evening (4:00 PM – 7:00 PM)",
];

const RESCHEDULE_REASONS = [
  "Customer unavailable / Emergency",
  "Work schedule conflict",
  "Location not accessible on original date",
  "Need more time to backup data",
  "Prefer an alternative service window",
  "Other",
];

export default function CustomerRescheduleManager() {
  const store = useStore();
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeFormTicketId, setActiveFormTicketId] = useState<string | null>(null);
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedSlot, setRequestedSlot] = useState(TIME_SLOTS[0]);
  const [reason, setReason] = useState(RESCHEDULE_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Calculate tomorrow's date string for input min attribute (YYYY-MM-DD)
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  // Maximum date allows up to 30 days ahead
  const maxDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  // Fetch authenticated user tickets & notifications
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (supabase && supabaseConfig.isConfigured) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const [serviceList, notifList] = await Promise.all([
            fetchUserServiceRequests(),
            fetchCustomerNotifications(),
          ]);
          setTickets(serviceList);
          setNotifications(notifList);
        } else {
          // Fallback to local store
          setTickets(store.requests || []);
        }
      } else {
        setTickets(store.requests || []);
      }
    } catch (err) {
      console.warn("[CustomerRescheduleManager] Failed to load data:", err);
      setTickets(store.requests || []);
    } finally {
      setLoading(false);
    }
  }, [store.requests]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription for customer notifications
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeCustomerNotifications(userId, () => {
      fetchCustomerNotifications().then(setNotifications);
      fetchUserServiceRequests().then(setTickets);
    });
    return () => {
      unsubscribe();
    };
  }, [userId]);

  // Partition tickets into:
  // 1. Eligible On-site Tickets
  // 2. Ineligible Tickets (Courier, Walk-in)
  // 3. Terminal/Historical Tickets
  const { eligibleTickets, ineligibleTickets, historicalTickets } = useMemo(() => {
    const eligible: any[] = [];
    const ineligible: any[] = [];
    const historical: any[] = [];

    const terminalStatuses = ["completed", "cancelled", "delivered", "returned", "closed"];

    tickets.forEach((t) => {
      const statusLower = (t.statusName || "").toLowerCase();
      const isTerminal = terminalStatuses.includes(statusLower);

      if (isTerminal) {
        historical.push(t);
        return;
      }

      if (isRescheduleEligible(t.method)) {
        eligible.push(t);
      } else {
        ineligible.push(t);
      }
    });

    return {
      eligibleTickets: eligible,
      ineligibleTickets: ineligible,
      historicalTickets: historical,
    };
  }, [tickets]);

  // Reschedule form validation & submission
  const handleSubmitReschedule = async (ticket: any) => {
    setFormError("");
    setSuccessMessage("");

    // Validate date format & constraints (strictly future, not Sunday)
    const dateValidation = validateRequestedAppointmentDate(requestedDate);
    if (!dateValidation.valid) {
      setFormError(dateValidation.error || "Please select a valid future date.");
      return;
    }

    if (!requestedSlot) {
      setFormError("Please select a preferred time slot.");
      return;
    }

    const fullReason = notes.trim() ? `${reason}: ${notes.trim()}` : reason;

    setSubmitting(true);
    try {
      const res = await requestAppointmentReschedule({
        ticketId: ticket.id,
        requestedDate,
        requestedSlot,
        reason: fullReason,
      });

      if (!res.ok) {
        setFormError(res.error || "Could not submit reschedule request. Please try again.");
      } else {
        setSuccessMessage(
          res.message ||
            "Reschedule request submitted successfully. IT HUB staff will review your preferred schedule.",
        );
        setActiveFormTicketId(null);
        setRequestedDate("");
        setNotes("");
        store.notify("Reschedule request submitted for staff review");
        // Reload fresh tickets and notifications
        await loadData();
      }
    } catch (err: any) {
      setFormError(err?.message || "An unexpected error occurred. Please contact IT HUB support.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenForm = (ticketId: string) => {
    setActiveFormTicketId(ticketId);
    setRequestedDate("");
    setRequestedSlot(TIME_SLOTS[0]);
    setReason(RESCHEDULE_REASONS[0]);
    setNotes("");
    setFormError("");
    setSuccessMessage("");
  };

  const handleCancelForm = () => {
    setActiveFormTicketId(null);
    setFormError("");
  };

  return (
    <div className="space-y-8" data-testid="customer-reschedule-module">
      {/* Module Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Reschedule Appointment</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Request an updated service date or time slot for your on-site technician appointments.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="self-start sm:self-auto gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Policy Reminder Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 text-sm">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              Staff Approval Required for All Reschedules
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Appointments are never rescheduled automatically. When you submit a request, your
              current appointment remains active until an IT HUB service manager reviews technician
              availability and approves your new time slot.
            </p>
          </div>
        </div>
      </div>

      {/* Global Success / Confirmation Message */}
      {successMessage && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200 text-sm flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Request Received</p>
            <p className="text-xs sm:text-sm mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {/* SECTION 1: ELIGIBLE ON-SITE APPOINTMENTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Eligible On-site Appointments</h3>
          <span className="text-xs text-muted-foreground">
            {eligibleTickets.length} {eligibleTickets.length === 1 ? "appointment" : "appointments"}
          </span>
        </div>

        {eligibleTickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center bg-card">
            <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
            <h4 className="font-semibold text-foreground">No active on-site appointments</h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              You currently do not have any open On-site Technician Visits eligible for
              rescheduling.
            </p>
            <div className="mt-5">
              <Link
                to="/services/book"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Book On-site Service
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {eligibleTickets.map((ticket) => {
              const ticketRef = ticket.ticketReference || formatTicketReference(ticket.id);
              const isFormOpen = activeFormTicketId === ticket.id;

              // Check if ticket already has a pending reschedule request
              const details = ticket.rescheduleDetails;
              const hasPendingRequest =
                ticket.statusName === "Reschedule Requested" ||
                (details &&
                  typeof details === "object" &&
                  (details.status === "pending" || (details.requestedDate && !details.decision)));

              return (
                <div
                  key={ticket.id}
                  className="rounded-xl border border-border bg-card p-5 sm:p-6 transition-all hover:border-border/80 shadow-xs"
                  data-testid={`eligible-ticket-${ticketRef}`}
                >
                  {/* Top Bar: Device & Reference */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-primary" />
                        <h4 className="font-bold text-foreground text-base">
                          {ticket.device} · {ticket.model}
                        </h4>
                      </div>
                      <p className="mt-1 text-xs font-mono text-muted-foreground">
                        Ticket: {ticketRef}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{ticket.method || "On-site Technician Visit"}</Badge>
                      {hasPendingRequest ? (
                        <span className="animate-pulse inline-flex">
                          <Badge tone="amber">Pending Staff Review</Badge>
                        </span>
                      ) : (
                        <Badge tone="gray">{ticket.statusName || "Booked"}</Badge>
                      )}
                    </div>
                  </div>

                  {/* Current Scheduled Appointment Info */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3.5 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">
                        Current Appointment
                      </span>
                      <div className="mt-1 flex items-center gap-1.5 font-semibold text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>{formatAppointmentDisplay(ticket.date, ticket.time)}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">
                        Assigned Specialist
                      </span>
                      <div className="mt-1 flex items-center gap-1.5 font-semibold text-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>{ticket.technician || "IT HUB Field Technician"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pending Reschedule Details Card */}
                  {hasPendingRequest && details && (
                    <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
                      <div className="flex items-start gap-2.5">
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold text-amber-900 dark:text-amber-200">
                            Requested Reschedule to: {details.requestedDate || "Pending date"} (
                            {details.requestedSlot || "Slot pending"})
                          </p>
                          {details.reason && (
                            <p className="text-muted-foreground">
                              <span className="font-medium text-foreground">Reason:</span>{" "}
                              {details.reason}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground pt-1">
                            Submitted on{" "}
                            {details.requestedAt
                              ? new Date(details.requestedAt).toLocaleDateString("en-IN")
                              : "recently"}
                            . Your current appointment remains active until staff approval.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Row */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <Link
                      to={`/track-service/${encodeURIComponent(ticketRef)}`}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>View ticket details & tracking</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>

                    {!hasPendingRequest && !isFormOpen && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenForm(ticket.id)}
                        className="gap-1.5"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>Request Reschedule</span>
                      </Button>
                    )}
                  </div>

                  {/* Reschedule Request Form Expansion */}
                  {isFormOpen && (
                    <div className="mt-5 rounded-xl border border-primary/20 bg-muted/20 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <h5 className="font-bold text-sm text-foreground flex items-center gap-2">
                          <CalendarClock className="h-4 w-4 text-primary" />
                          <span>Request New Appointment Date & Slot</span>
                        </h5>
                        <button
                          type="button"
                          onClick={handleCancelForm}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>

                      {formError && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Preferred Date Picker */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                            <span>Preferred Date (Mon–Sat)</span>
                            <span className="text-[10px] text-muted-foreground">Future dates</span>
                          </label>
                          <input
                            type="date"
                            min={tomorrowStr}
                            max={maxDateStr}
                            value={requestedDate}
                            onChange={(e) => {
                              setRequestedDate(e.target.value);
                              setFormError("");
                            }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            required
                          />
                          <p className="text-[11px] text-muted-foreground">
                            IT HUB is closed on Sundays.
                          </p>
                        </div>

                        {/* Preferred Time Slot */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-foreground">
                            Preferred Time Window
                          </label>
                          <select
                            value={requestedSlot}
                            onChange={(e) => setRequestedSlot(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                          >
                            {TIME_SLOTS.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Reason Dropdown */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground">
                          Reason for Reschedule
                        </label>
                        <select
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        >
                          {RESCHEDULE_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Additional Notes (Optional) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                          <span>Additional Notes / Special Instructions</span>
                          <span className="text-[10px] text-muted-foreground">Optional</span>
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. Please call before arriving or prefer after 2:30 PM..."
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      {/* Submit & Cancel Buttons */}
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={handleCancelForm}
                          disabled={submitting}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => handleSubmitReschedule(ticket)}
                          disabled={submitting || !requestedDate}
                          className="gap-2"
                        >
                          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          <span>Submit Request</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: INELIGIBLE INTAKE METHODS (COURIER & WALK-IN GUIDANCE) */}
      {ineligibleTickets.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">Other Active Service Tickets</h3>
              <p className="text-xs text-muted-foreground">
                In-store walk-in and insured courier services do not use technician visit slots.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {ineligibleTickets.length} {ineligibleTickets.length === 1 ? "ticket" : "tickets"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ineligibleTickets.map((ticket) => {
              const ticketRef = ticket.ticketReference || formatTicketReference(ticket.id);
              const isWalkIn =
                ticket.method?.toLowerCase().includes("walk-in") ||
                ticket.method?.toLowerCase().includes("visit");

              return (
                <div
                  key={ticket.id}
                  className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-between"
                  data-testid={`ineligible-ticket-${ticketRef}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {isWalkIn ? (
                            <Store className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Truck className="h-4 w-4 text-muted-foreground" />
                          )}
                          <h4 className="font-semibold text-foreground text-sm">
                            {ticket.device} · {ticket.model}
                          </h4>
                        </div>
                        <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                          {ticketRef}
                        </p>
                      </div>
                      <Badge tone="gray">{ticket.method}</Badge>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                        <span>Online Rescheduling Not Applicable</span>
                      </div>
                      {isWalkIn ? (
                        <p>
                          Direct store walk-in tickets do not require appointment rescheduling.
                          Visit our showroom any time during store hours (Mon–Sat, 9:30 AM – 8:00
                          PM).
                        </p>
                      ) : (
                        <p>
                          Insured courier pickups are scheduled directly with our logistics partner.
                          To modify courier pickup, please contact IT HUB support directly.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex justify-end">
                    <Link
                      to={`/track-service/${encodeURIComponent(ticketRef)}`}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>Track this ticket</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: RECENT NOTIFICATIONS & AUDIT TIMELINE */}
      {notifications.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span>Reschedule Notifications & Updates</span>
            </h3>
            <span className="text-xs text-muted-foreground">
              {notifications.length} {notifications.length === 1 ? "update" : "updates"}
            </span>
          </div>

          <div className="space-y-2.5">
            {notifications.map((notif) => {
              const isApproved = notif.event_type === "RESCHEDULE_APPROVED";
              const isRejected = notif.event_type === "RESCHEDULE_REJECTED";

              return (
                <div
                  key={notif.id}
                  className={`rounded-xl border p-4 text-xs transition-colors ${
                    isApproved
                      ? "border-emerald-500/20 bg-emerald-500/5 text-foreground"
                      : isRejected
                        ? "border-rose-500/20 bg-rose-500/5 text-foreground"
                        : "border-border bg-card text-foreground"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {isApproved ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : isRejected ? (
                        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-semibold text-sm">{notif.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/80">
                          {new Date(notif.created_at).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    {!notif.read && (
                      <button
                        type="button"
                        onClick={() => {
                          markCustomerNotificationAsRead(notif.id);
                          setNotifications((prev) =>
                            prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
                          );
                        }}
                        className="text-[11px] text-primary hover:underline shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
