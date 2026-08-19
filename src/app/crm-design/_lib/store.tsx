"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  ACTIVITIES,
  AUDIT_LOG,
  COMPANIES,
  CONTACTS,
  DOCUMENTS,
  TASKS,
  TEAM,
} from "./data";
import type {
  ActivityItem,
  AuditLogItem,
  Company,
  CompanyDocument,
  Contact,
  DocType,
  TaskItem,
  TeamMember,
} from "./types";

/**
 * All prototype state lives here, in memory, for the session only — there is
 * no backend, no persistence, and nothing here is real. Refreshing the page
 * resets everything to the seed data in data.ts. This is intentional and
 * documented in DESIGN_DECISIONS.md: a click-through prototype only needs
 * state to survive within one walkthrough, not across reloads.
 */

export type Toast = { id: string; kind: "success" | "info" | "danger"; message: string };

type StoreState = {
  companies: Company[];
  contacts: Contact[];
  activities: ActivityItem[];
  auditLog: AuditLogItem[];
  documents: CompanyDocument[];
  tasks: TaskItem[];
  team: TeamMember[];

  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  currentUser: TeamMember;

  toasts: Toast[];
  pushToast: (kind: Toast["kind"], message: string) => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  personaSwitcherOpen: boolean;
  setPersonaSwitcherOpen: (open: boolean) => void;

  moveStage: (companyId: string, toStage: Company["stage"]) => void;
  logActivity: (input: Omit<ActivityItem, "id" | "occurredAt" | "authorId">) => void;
  generateDocument: (companyId: string, type: DocType) => void;
  updateTeamMember: (
    userId: string,
    patch: Partial<Pick<TeamMember, "role" | "isActive" | "canViewAllCompanies">>,
    logSummary: string,
  ) => void;
  suspendAndReassign: (userId: string, reassignToUserId: string) => void;
  reactivateUser: (userId: string) => void;
  toggleTask: (taskId: string) => void;
  addCompany: (input: { name: string; industry: string; city: string; state: string; assignedUserId: string }) => Company;
  addContact: (input: { companyId: string | null; name: string; title: string; email: string; phone: string }) => Contact;
};

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>(COMPANIES);
  const [contacts, setContacts] = useState<Contact[]>(CONTACTS);
  const [activities, setActivities] = useState<ActivityItem[]>(ACTIVITIES);
  const [auditLog, setAuditLog] = useState<AuditLogItem[]>(AUDIT_LOG);
  const [documents, setDocuments] = useState<CompanyDocument[]>(DOCUMENTS);
  const [tasks, setTasks] = useState<TaskItem[]>(TASKS);
  const [team, setTeam] = useState<TeamMember[]>(TEAM);

  const [currentUserId, setCurrentUserId] = useState<string>("u-brent");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [personaSwitcherOpen, setPersonaSwitcherOpen] = useState(false);
  const idRef = useRef(1000);

  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = `toast-${idRef.current++}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const moveStage = useCallback(
    (companyId: string, toStage: Company["stage"]) => {
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, stage: toStage } : c)),
      );
      const company = companies.find((c) => c.id === companyId);
      setActivities((prev) => [
        {
          id: `a-${idRef.current++}`,
          kind: "stage_change",
          companyId,
          contactId: null,
          authorId: currentUserId,
          title: `Stage changed to ${toStage.replace("_", " ")}`,
          body: null,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      pushToast("success", `${company?.name ?? "Company"} moved to a new stage.`);
    },
    [companies, currentUserId, pushToast],
  );

  const logActivity = useCallback(
    (input: Omit<ActivityItem, "id" | "occurredAt" | "authorId">) => {
      setActivities((prev) => [
        { ...input, id: `a-${idRef.current++}`, authorId: currentUserId, occurredAt: new Date().toISOString() },
        ...prev,
      ]);
      pushToast("success", "Logged.");
    },
    [currentUserId, pushToast],
  );

  const generateDocument = useCallback(
    (companyId: string, type: DocType) => {
      const company = companies.find((c) => c.id === companyId);
      const label = `${type === "rate_confirmation" ? "Rate Confirmation" : "Bill of Lading"} — ${(company?.name ?? "DOC").slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`;
      setDocuments((prev) => [
        {
          id: `d-${idRef.current++}`,
          companyId,
          type,
          label,
          createdAt: new Date().toISOString(),
          createdByUserId: currentUserId,
          status: "draft",
        },
        ...prev,
      ]);
      setActivities((prev) => [
        {
          id: `a-${idRef.current++}`,
          kind: "document",
          companyId,
          contactId: null,
          authorId: currentUserId,
          title: `Document generated: ${type === "rate_confirmation" ? "Rate Confirmation" : "Bill of Lading"}`,
          body: label,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      pushToast("success", `${label} generated.`);
    },
    [companies, currentUserId, pushToast],
  );

  const updateTeamMember = useCallback(
    (
      userId: string,
      patch: Partial<Pick<TeamMember, "role" | "isActive" | "canViewAllCompanies">>,
      logSummary: string,
    ) => {
      setTeam((prev) => prev.map((m) => (m.id === userId ? { ...m, ...patch } : m)));
      setAuditLog((prev) => [
        {
          id: `al-${idRef.current++}`,
          action: patch.role !== undefined ? "role_changed" : patch.isActive === false ? "user_suspended" : patch.isActive === true ? "user_reactivated" : "visibility_changed",
          actorId: currentUserId,
          targetUserId: userId,
          targetCompanyId: null,
          summary: logSummary,
          detail: null,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      pushToast("success", "Saved.");
    },
    [currentUserId, pushToast],
  );

  const suspendAndReassign = useCallback(
    (userId: string, reassignToUserId: string) => {
      const target = team.find((m) => m.id === userId);
      const reassignTo = team.find((m) => m.id === reassignToUserId);
      setCompanies((prev) =>
        prev.map((c) => (c.assignedUserId === userId ? { ...c, assignedUserId: reassignToUserId } : c)),
      );
      setTeam((prev) => prev.map((m) => (m.id === userId ? { ...m, isActive: false, companiesOwned: 0 } : m)));
      setAuditLog((prev) => [
        {
          id: `al-${idRef.current++}`,
          action: "user_suspended",
          actorId: currentUserId,
          targetUserId: userId,
          targetCompanyId: null,
          summary: `${team.find((m) => m.id === currentUserId)?.name ?? "An admin"} suspended ${target?.name ?? "a user"} and reassigned their companies to ${reassignTo?.name ?? "another user"}`,
          detail: null,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      pushToast("success", `${target?.name} suspended. Companies reassigned to ${reassignTo?.name}.`);
    },
    [currentUserId, team, pushToast],
  );

  const reactivateUser = useCallback(
    (userId: string) => {
      const target = team.find((m) => m.id === userId);
      setTeam((prev) => prev.map((m) => (m.id === userId ? { ...m, isActive: true } : m)));
      setAuditLog((prev) => [
        {
          id: `al-${idRef.current++}`,
          action: "user_reactivated",
          actorId: currentUserId,
          targetUserId: userId,
          targetCompanyId: null,
          summary: `${team.find((m) => m.id === currentUserId)?.name ?? "An admin"} reactivated ${target?.name ?? "a user"}`,
          detail: null,
          occurredAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      pushToast("success", `${target?.name} reactivated.`);
    },
    [currentUserId, team, pushToast],
  );

  const toggleTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: t.status === "open" ? "done" : "open" } : t)),
    );
  }, []);

  const addCompany = useCallback(
    (input: { name: string; industry: string; city: string; state: string; assignedUserId: string }) => {
      const company: Company = {
        id: `c-${idRef.current++}`,
        name: input.name,
        industry: input.industry || "Uncategorized",
        city: input.city,
        state: input.state,
        stage: "new_lead",
        assignedUserId: input.assignedUserId,
        phone: "—",
        website: "—",
        fitRating: 3,
        tags: [],
        lastContactAt: null,
        createdAt: new Date().toISOString(),
        annualFreightSpend: "Unknown",
        primaryContactId: null,
        notes: "",
      };
      setCompanies((prev) => [company, ...prev]);
      pushToast("success", `${company.name} added.`);
      return company;
    },
    [pushToast],
  );

  const addContact = useCallback(
    (input: { companyId: string | null; name: string; title: string; email: string; phone: string }) => {
      const contact: Contact = {
        id: `ct-${idRef.current++}`,
        companyId: input.companyId,
        name: input.name,
        title: input.title || "—",
        email: input.email,
        phone: input.phone,
        isDecisionMaker: false,
        lastContactedAt: null,
        nextFollowupAt: null,
      };
      setContacts((prev) => [contact, ...prev]);
      pushToast("success", `${contact.name} added.`);
      return contact;
    },
    [pushToast],
  );

  const currentUser = team.find((m) => m.id === currentUserId) ?? team[0];

  const value = useMemo<StoreState>(
    () => ({
      companies,
      contacts,
      activities,
      auditLog,
      documents,
      tasks,
      team,
      currentUserId,
      setCurrentUserId,
      currentUser,
      toasts,
      pushToast,
      paletteOpen,
      setPaletteOpen,
      personaSwitcherOpen,
      setPersonaSwitcherOpen,
      moveStage,
      logActivity,
      generateDocument,
      updateTeamMember,
      suspendAndReassign,
      reactivateUser,
      toggleTask,
      addCompany,
      addContact,
    }),
    [
      companies,
      contacts,
      activities,
      auditLog,
      documents,
      tasks,
      team,
      currentUserId,
      currentUser,
      toasts,
      pushToast,
      paletteOpen,
      personaSwitcherOpen,
      moveStage,
      logActivity,
      generateDocument,
      updateTeamMember,
      suspendAndReassign,
      reactivateUser,
      toggleTask,
      addCompany,
      addContact,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useCompany(id: string | undefined) {
  const { companies } = useStore();
  return companies.find((c) => c.id === id) ?? null;
}

export function useContactRecord(id: string | undefined) {
  const { contacts } = useStore();
  return contacts.find((c) => c.id === id) ?? null;
}

export function useTeamMemberById(id: string | null | undefined) {
  const { team } = useStore();
  return team.find((m) => m.id === id) ?? null;
}
