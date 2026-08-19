"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  ACTIVITIES,
  AUDIT_LOG,
  BOL_RECORDS,
  COMPANIES,
  COMPANY_LOCATIONS,
  CONTACTS,
  DOCUMENTS,
  TASKS,
  TEAM,
} from "./data";
import type {
  ActivityItem,
  AuditLogItem,
  BolExtraction,
  BolRecord,
  BolReleaseSelection,
  BolStatus,
  Company,
  CompanyDocument,
  CompanyLocation,
  Contact,
  CustomerMatchStatus,
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
  bolRecords: BolRecord[];
  companyLocations: CompanyLocation[];

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

  // BOL Center — see CRM_PROTOTYPE_MAP.md. Every action below is scoped to
  // bolRecords/companyLocations; NONE of them touch `companies` except
  // releaseBolToSales, and only when Admin explicitly checks "Company" in
  // the release selection and clicks Release. Uploading/extracting/
  // researching a BOL never creates a Company, Contact, or Task.
  uploadBol: (fileName: string) => BolRecord;
  runExtraction: (bolId: string) => void;
  updateExtractionField: (bolId: string, field: keyof BolExtraction, value: string) => void;
  confirmCustomerMatch: (bolId: string, status: CustomerMatchStatus, companyId: string | null) => void;
  confirmLocation: (bolId: string, index: number, matchStatus: "existing" | "new", matchedLocationId: string | null) => void;
  saveResearchNotes: (bolId: string, notes: string) => void;
  setSalesRelevance: (bolId: string, level: "high" | "medium" | "low") => void;
  setBolStatus: (bolId: string, status: BolStatus) => void;
  releaseBolToSales: (bolId: string, selection: BolReleaseSelection) => void;
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
  const [bolRecords, setBolRecords] = useState<BolRecord[]>(BOL_RECORDS);
  const [companyLocations, setCompanyLocations] = useState<CompanyLocation[]>(COMPANY_LOCATIONS);

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

  // ── BOL Center ──────────────────────────────────────────────────────
  const EMPTY_FIELD = { value: "", confidence: "review" as const, corrected: false };
  const EMPTY_EXTRACTION: BolExtraction = {
    customerName: EMPTY_FIELD, shipperName: EMPTY_FIELD, consigneeName: EMPTY_FIELD,
    brokerName: EMPTY_FIELD, carrierName: EMPTY_FIELD, pickupAddress: EMPTY_FIELD,
    pickupCity: EMPTY_FIELD, pickupState: EMPTY_FIELD, deliveryAddress: EMPTY_FIELD,
    deliveryCity: EMPTY_FIELD, deliveryState: EMPTY_FIELD, commodity: EMPTY_FIELD,
    weight: EMPTY_FIELD, pickupDate: EMPTY_FIELD, deliveryDate: EMPTY_FIELD, referenceNumber: EMPTY_FIELD,
  };
  function ef2(value: string, confidence: "high" | "review" = "high") {
    return { value, confidence, corrected: false };
  }

  const uploadBol = useCallback(
    (fileName: string) => {
      const record: BolRecord = {
        id: `bol-${idRef.current++}`,
        docNumber: "—",
        fileName,
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: currentUserId,
        status: "new",
        assignedReviewerId: null,
        extraction: EMPTY_EXTRACTION,
        contacts: [],
        locations: [],
        customerMatch: { status: "potential_new", companyId: null, candidateName: "" },
        research: { notes: "", observedFreight: [], observedLanes: [], salesRelevance: null },
        release: null,
      };
      setBolRecords((prev) => [record, ...prev]);
      pushToast("success", "BOL uploaded. Nothing is visible to Sales yet — it enters the review queue.");
      return record;
    },
    [currentUserId, pushToast],
  );

  // Rotating canned "AI extractions" for a freshly-uploaded/new BOL — three
  // distinct, realistic candidate companies so repeat demo uploads don't
  // look identical. Every one lands as a POTENTIAL NEW customer (unmatched)
  // so the walkthrough always exercises the "not in the CRM yet" path.
  const extractionTemplates = useRef(0);
  const EXTRACTION_TEMPLATES: { extraction: BolExtraction; docNumber: string; contacts: BolRecord["contacts"]; locations: BolRecord["locations"] }[] = [
    {
      docNumber: "SPA-BOL-6120",
      extraction: {
        customerName: ef2("South Plains Ag Haulers"),
        shipperName: ef2("South Plains Ag Haulers"),
        consigneeName: ef2("Panhandle Grain Cooperative"),
        brokerName: ef2("Hello Hotshot Logistics LLC"),
        carrierName: ef2("South Plains Ag Haulers", "review"),
        pickupAddress: ef2("1900 E Slaton Hwy"),
        pickupCity: ef2("Lubbock"),
        pickupState: ef2("TX"),
        deliveryAddress: ef2("Co Rd 17"),
        deliveryCity: ef2("Amarillo"),
        deliveryState: ef2("TX"),
        commodity: ef2("Grain trailers, empty reposition"),
        weight: ef2("—", "review"),
        pickupDate: ef2(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        deliveryDate: ef2(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        referenceNumber: ef2("SPA-2214"),
      },
      contacts: [{ role: "shipper_contact", name: "Wes Trammell", company: "South Plains Ag Haulers", phone: "(806) 555-4471", email: "wes@spaghaulers.com" }],
      locations: [
        { role: "pickup", address: "1900 E Slaton Hwy", city: "Lubbock", state: "TX", matchStatus: "new", matchedLocationId: null },
        { role: "delivery", address: "Co Rd 17", city: "Amarillo", state: "TX", matchStatus: "new", matchedLocationId: null },
      ],
    },
    {
      docNumber: "BBO-BOL-2287",
      extraction: {
        customerName: ef2("Big Bend Oilfield Rentals"),
        shipperName: ef2("Big Bend Oilfield Rentals"),
        consigneeName: ef2("Permian Basin Oilfield Supply"),
        brokerName: ef2("Hello Hotshot Logistics LLC"),
        carrierName: ef2("Big Bend Oilfield Rentals"),
        pickupAddress: ef2("2210 N Hwy 285"),
        pickupCity: ef2("Fort Stockton"),
        pickupState: ef2("TX"),
        deliveryAddress: ef2("1180 N Fairgrounds Rd"),
        deliveryCity: ef2("Midland"),
        deliveryState: ef2("TX"),
        commodity: ef2("Rental pump equipment", "review"),
        weight: ef2("14,600 lb"),
        pickupDate: ef2(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        deliveryDate: ef2(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        referenceNumber: ef2("BBO-0091"),
      },
      contacts: [{ role: "shipper_contact", name: "Alicia Fuentes", company: "Big Bend Oilfield Rentals", phone: "(432) 555-3390", email: "alicia@bigbendoilfield.com" }],
      locations: [
        { role: "pickup", address: "2210 N Hwy 285", city: "Fort Stockton", state: "TX", matchStatus: "new", matchedLocationId: null },
        { role: "delivery", address: "1180 N Fairgrounds Rd", city: "Midland", state: "TX", matchStatus: "existing", matchedLocationId: "loc-pbo-midland" },
      ],
    },
    {
      docNumber: "PCT-BOL-8845",
      extraction: {
        customerName: ef2("Piney Creek Timber Movers"),
        shipperName: ef2("Piney Creek Timber Movers"),
        consigneeName: ef2("Red River Timber Co."),
        brokerName: ef2("Hello Hotshot Logistics LLC"),
        carrierName: ef2("Piney Creek Timber Movers"),
        pickupAddress: ef2("880 FM 2262"),
        pickupCity: ef2("Nacogdoches"),
        pickupState: ef2("TX"),
        deliveryAddress: ef2("Mill Rd", "review"),
        deliveryCity: ef2("Texarkana"),
        deliveryState: ef2("TX"),
        commodity: ef2("Raw log loads"),
        weight: ef2("46,500 lb"),
        pickupDate: ef2(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        deliveryDate: ef2(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        referenceNumber: ef2("PCT-1450"),
      },
      contacts: [{ role: "shipper_contact", name: "Dale Ferris", company: "Piney Creek Timber Movers", phone: "(936) 555-7783", email: "dale@pineycreektimber.com" }],
      locations: [
        { role: "pickup", address: "880 FM 2262", city: "Nacogdoches", state: "TX", matchStatus: "new", matchedLocationId: null },
        { role: "delivery", address: "Mill Rd", city: "Texarkana", state: "TX", matchStatus: "new", matchedLocationId: null },
      ],
    },
  ];

  const runExtraction = useCallback(
    (bolId: string) => {
      const tpl = EXTRACTION_TEMPLATES[extractionTemplates.current % EXTRACTION_TEMPLATES.length];
      extractionTemplates.current += 1;
      const hasReviewField = Object.values(tpl.extraction).some((f) => f.confidence === "review");
      setBolRecords((prev) =>
        prev.map((b) =>
          b.id === bolId
            ? {
                ...b,
                docNumber: tpl.docNumber,
                extraction: tpl.extraction,
                contacts: tpl.contacts,
                locations: tpl.locations,
                customerMatch: { status: "potential_new", companyId: null, candidateName: tpl.extraction.customerName.value },
                status: hasReviewField ? "needs_review" : "ai_extracted",
              }
            : b,
        ),
      );
      pushToast("success", "AI extraction complete. Nothing released — review before approving.");
    },
    [pushToast],
  );

  const updateExtractionField = useCallback((bolId: string, field: keyof BolExtraction, value: string) => {
    setBolRecords((prev) =>
      prev.map((b) =>
        b.id === bolId
          ? { ...b, extraction: { ...b.extraction, [field]: { value, confidence: "high", corrected: true } } }
          : b,
      ),
    );
  }, []);

  const confirmCustomerMatch = useCallback(
    (bolId: string, status: CustomerMatchStatus, companyId: string | null) => {
      setBolRecords((prev) =>
        prev.map((b) => (b.id === bolId ? { ...b, customerMatch: { ...b.customerMatch, status, companyId } } : b)),
      );
    },
    [],
  );

  const confirmLocation = useCallback(
    (bolId: string, index: number, matchStatus: "existing" | "new", matchedLocationId: string | null) => {
      setBolRecords((prev) =>
        prev.map((b) =>
          b.id === bolId
            ? { ...b, locations: b.locations.map((l, i) => (i === index ? { ...l, matchStatus, matchedLocationId } : l)) }
            : b,
        ),
      );
    },
    [],
  );

  const saveResearchNotes = useCallback(
    (bolId: string, notes: string) => {
      setBolRecords((prev) => prev.map((b) => (b.id === bolId ? { ...b, research: { ...b.research, notes } } : b)));
      pushToast("success", "Research notes saved.");
    },
    [pushToast],
  );

  const setSalesRelevance = useCallback((bolId: string, level: "high" | "medium" | "low") => {
    setBolRecords((prev) => prev.map((b) => (b.id === bolId ? { ...b, research: { ...b.research, salesRelevance: level } } : b)));
  }, []);

  const setBolStatus = useCallback(
    (bolId: string, status: BolStatus) => {
      setBolRecords((prev) => prev.map((b) => (b.id === bolId ? { ...b, status } : b)));
      const label =
        status === "approved" ? "Approved." : status === "rejected" ? "Rejected." : status === "researching" ? "Back to research." : status === "archived" ? "Archived." : "Updated.";
      pushToast(status === "rejected" ? "danger" : "success", label);
    },
    [pushToast],
  );

  const releaseBolToSales = useCallback(
    (bolId: string, selection: BolReleaseSelection) => {
      // Reads `bolRecords` from render scope (not from inside a setState
      // updater) so every side effect below (addCompany, setActivities,
      // pushToast) fires exactly once per click — nesting them inside a
      // setBolRecords updater would double-fire under StrictMode's
      // double-invoke and could silently create two companies.
      const bol = bolRecords.find((b) => b.id === bolId);
      if (!bol) return;

      // Resolve (or create, only now, only if Admin checked "Company") the
      // target Company. This is the ONE place a BOL can ever produce a real
      // CRM company — and only via this explicit, checkbox-gated click.
      let companyId = bol.customerMatch.companyId;
      if (!companyId && selection.company) {
        const pickup = bol.locations.find((l) => l.role === "pickup");
        const created = addCompany({
          name: bol.customerMatch.candidateName || bol.extraction.customerName.value,
          industry: "",
          city: pickup?.city ?? bol.extraction.pickupCity.value,
          state: pickup?.state ?? bol.extraction.pickupState.value,
          assignedUserId: currentUserId,
        });
        companyId = created.id;
      }

      if (companyId && selection.locations) {
        const resolvedCompanyId = companyId;
        setCompanyLocations((prevLocs) => {
          let next = prevLocs;
          for (const loc of bol.locations) {
            if (loc.matchStatus === "existing" && loc.matchedLocationId) {
              next = next.map((l) =>
                l.id === loc.matchedLocationId
                  ? { ...l, lastObservedAt: new Date().toISOString(), bolCount: l.bolCount + 1 }
                  : l,
              );
            } else {
              next = [
                ...next,
                {
                  id: `loc-${idRef.current++}`,
                  companyId: resolvedCompanyId,
                  label: `${loc.city} ${loc.role === "pickup" ? "Pickup" : "Delivery"} Point`,
                  address: loc.address,
                  city: loc.city,
                  state: loc.state,
                  role: loc.role,
                  source: "bol",
                  firstObservedAt: new Date().toISOString(),
                  lastObservedAt: new Date().toISOString(),
                  bolCount: 1,
                },
              ];
            }
          }
          return next;
        });
      }

      if (companyId) {
        const resolvedCompanyId = companyId;
        setActivities((prevAct) => [
          {
            id: `a-${idRef.current++}`,
            kind: "note",
            companyId: resolvedCompanyId,
            contactId: null,
            authorId: currentUserId,
            title: "Customer intelligence released from BOL Center",
            body: `Sourced from ${bol.docNumber} (${bol.fileName}) — ${[
              selection.locations && "locations",
              selection.observedFreight && "observed freight",
              selection.observedLanes && "observed lanes",
              selection.salesNotes && "research notes",
            ]
              .filter(Boolean)
              .join(", ") || "company record only"}.`,
            occurredAt: new Date().toISOString(),
          },
          ...prevAct,
        ]);
      }

      setBolRecords((prev) =>
        prev.map((b) =>
          b.id === bolId
            ? {
                ...b,
                status: "approved",
                customerMatch: companyId ? { ...b.customerMatch, companyId, status: "matched" } : b.customerMatch,
                release: { releasedAt: new Date().toISOString(), releasedByUserId: currentUserId, selection },
              }
            : b,
        ),
      );

      pushToast("success", companyId ? "Released to Sales." : "Nothing to release — check at least one field.");
    },
    [addCompany, bolRecords, currentUserId, pushToast],
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
      bolRecords,
      companyLocations,
      uploadBol,
      runExtraction,
      updateExtractionField,
      confirmCustomerMatch,
      confirmLocation,
      saveResearchNotes,
      setSalesRelevance,
      setBolStatus,
      releaseBolToSales,
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
      bolRecords,
      companyLocations,
      uploadBol,
      runExtraction,
      updateExtractionField,
      confirmCustomerMatch,
      confirmLocation,
      saveResearchNotes,
      setSalesRelevance,
      setBolStatus,
      releaseBolToSales,
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

export function useBolRecord(id: string | undefined) {
  const { bolRecords } = useStore();
  return bolRecords.find((b) => b.id === id) ?? null;
}

export function useTeamMemberById(id: string | null | undefined) {
  const { team } = useStore();
  return team.find((m) => m.id === id) ?? null;
}
