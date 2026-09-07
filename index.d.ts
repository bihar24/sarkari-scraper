import type { RequestListener, Server } from "node:http";

export type Kind = "job" | "scheme" | "policy" | "paper";
export interface BilingualText {
  en: string | null;
  hi: string | null;
}
export interface Attribution {
  name: string;
  url: string;
  licenseUrl: string;
  changes: string;
}
export interface Provenance {
  provider: string;
  url: string;
  recordUrl: string;
  revision: string | null;
  fetchedAt: string;
  lastVerified: string | null;
  license: string | null;
  attribution: Attribution | null;
}
export interface Eligibility {
  text: BilingualText;
  personas: string[];
  education?: string[];
  socialCategories?: string[];
  gender?: string | null;
  minAge: number | null;
  maxAge: number | null;
  incomeCeiling: number | null;
  domicile?: string | null;
  requiresBpl?: boolean | null;
  disabilityOnly?: boolean | null;
}
export interface Opportunity {
  schemaVersion: 1;
  id: string;
  collection?: string;
  kind: Kind;
  title: BilingualText;
  summary: BilingualText;
  categories: string[];
  region: "bihar" | "india" | null;
  url: string;
  applyUrl: string | null;
  status: string;
  evidence: string | null;
  deadline: {
    date: string | null;
    raw: string | null;
    purpose: "application" | "consultation";
  } | null;
  department: BilingualText;
  benefits: BilingualText;
  eligibility: Eligibility | null;
  links: { label: string; url: string }[];
  source: Provenance;
  original: Record<string, unknown>;
}
export interface SourceHealth {
  label: string;
  status: "ok" | "partial" | "error";
  lastAttempt: string;
  lastSuccess?: string | null;
  count?: number;
  error: string | null;
  origin?: string | null;
  revision?: string | null;
  license?: string | null;
  attribution?: string | null;
  imported?: number;
  added?: number;
  updated?: number;
  mode?: "snapshot" | "incremental";
}
export interface Directory {
  domains: string[];
  invalid: number;
  duplicates: number;
  sourceUrl: string | null;
  revision: string | null;
  importedAt: string;
  license: null;
  notice: string;
}
export interface Snapshot {
  schemaVersion: 1;
  updatedAt: string | null;
  demo: boolean;
  records: Opportunity[];
  sources: Record<string, SourceHealth>;
  changes: {
    id: string;
    kind: Kind;
    title: string;
    action: "added" | "updated" | "removed";
    at: string;
  }[];
  directory: Directory | null;
}
export interface ImportGroup {
  key: string;
  label: string;
  records?: Opportunity[];
  error?: string;
  partial?: boolean;
  warnings?: string[];
  replace?: boolean;
  allowEmpty?: boolean;
  origin?: string;
  revision?: string | null;
  license?: string;
  attribution?: string;
}
export interface Filters {
  q?: string;
  kind?: Kind;
  category?: string;
  region?: "bihar" | "india";
  source?: string;
  freshness?: string;
  status?: string;
  namespace?: string;
  persona?: string;
  age?: number;
  income?: number;
}
export interface HttpResponse {
  data: unknown;
  status: number;
  headers?: Record<string, string>;
  config?: { url?: string };
}
export interface HttpClient {
  get(url: string, options?: Record<string, unknown>): Promise<HttpResponse>;
}
export interface Runtime {
  client: HttpClient;
  robots: {
    isAllowed(url: string): Promise<{ allowed: boolean; reason: string }>;
  };
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
  };
}
export interface RuntimeOptions {
  quiet?: boolean;
  verbose?: boolean;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  proxyUrl?: string | null;
}
export function createRuntime(options: RuntimeOptions): Runtime;
export function createCrawlClient(
  runtime: Runtime,
  options?: { domain?: string; ignoreRobots?: boolean; allowExternal?: boolean }
): HttpClient;
export function crawlJobList<T>(options: {
  scrapFn(html: string, pageUrl: string): { data: T[]; next: string | null };
  startUrl: string;
  client: HttpClient;
  maxPages: number;
  delayMs?: number;
  sameSiteDomain?: string | null;
  log?(message: string): void;
}): Promise<{ items: T[]; pages: number }>;
export const sources: {
  jobDomains(): string[];
  paperDomains(): string[];
  isSupported(domain: string, type: "jobs" | "papers"): boolean;
  statusOf(domain: string, type: "jobs" | "papers"): "stable" | "beta" | null;
  formatCatalog(): string;
  catalogRows(): {
    domain: string;
    jobs: string | null;
    papers: string | null;
    notes: string;
  }[];
  requireDetailParser(
    domain: string,
    type: "jobs"
  ): {
    scrapJobDetail(html: string, url: string): Record<string, unknown>[];
    scrapeJobDetail(html: string, url: string): Record<string, unknown>[];
  };
  requireDetailParser(
    domain: string,
    type: "papers"
  ): {
    scrapPaperDetail(html: string, url: string): Record<string, unknown>[];
    scrapePaperDetail(html: string, url: string): Record<string, unknown>[];
  };
  requireListParser(
    domain: string,
    type: "jobs"
  ): {
    jobListUrl: string;
    scrapJobList(
      html: string,
      url: string
    ): { data: Record<string, unknown>[]; next: string | null };
    scrapeJobList(
      html: string,
      url: string
    ): { data: Record<string, unknown>[]; next: string | null };
  };
  requireListParser(
    domain: string,
    type: "papers"
  ): {
    papersListUrl: string;
    scrapPaperList(
      html: string,
      url: string
    ): { data: Record<string, unknown>[]; next: string | null };
    scrapePaperList(
      html: string,
      url: string
    ): { data: Record<string, unknown>[]; next: string | null };
  };
};
export const catalogue: {
  model: {
    VERSION: 1;
    KINDS: Kind[];
    normalizeTracker(
      raw: Record<string, unknown>,
      options: {
        kind: "scheme" | "policy";
        slug?: string;
        fetchedAt?: string;
        revision?: string | null;
        recordUrl?: string;
      }
    ): Opportunity;
    normalizeScraped(
      raw: Record<string, unknown>,
      options?: { kind?: "job" | "paper"; fetchedAt?: string }
    ): Opportunity;
    fingerprint(record: Opportunity): string;
    displayStatus(record: Opportunity, now?: Date): string;
    freshness(
      record: Opportunity,
      now?: Date
    ): { state: string; ageDays: number | null };
    possibleMatch(
      record: Opportunity,
      profile: Filters
    ): { matches: boolean; assessment: string };
  };
  domains: {
    hostname(value: string): string | null;
    namespace(host: string | null): "gov.in" | "nic.in" | null;
    classify(
      value: string,
      directory?: string[] | Set<string>
    ): {
      hostname: string | null;
      namespace: string | null;
      directoryListed: boolean;
      classification: string;
      ownershipVerified: false;
    };
    parseDirectory(text: string): {
      domains: string[];
      invalid: number;
      duplicates: number;
    };
    GIST_URL: string;
    GIST_REVISION: string;
    GIST_RAW: string;
  };
  store: {
    empty(): Snapshot;
    load(file: string): Snapshot;
    validate(value: unknown): Snapshot;
    update(file: string, mutate: (snapshot: Snapshot) => Snapshot): Snapshot;
    atomicWrite(file: string, value: Snapshot): void;
    applyGroup(snapshot: Snapshot, group: ImportGroup, now?: string): Snapshot;
  };
  importers: {
    TRACKER_REF: string;
    parseYaml(text: string): unknown;
    importTrackerDirectory(
      root: string,
      options?: { revision?: string; fetchedAt?: string }
    ): ImportGroup[];
    importTrackerGithub(
      client: HttpClient,
      options?: {
        revision?: string;
        fetchedAt?: string;
        token?: string;
        delayMs?: number;
        baseUrl?: string;
      }
    ): Promise<ImportGroup[]>;
    importScrapedFile(
      file: string,
      options?: {
        kind?: "job" | "paper";
        fetchedAt?: string;
        collection?: string;
        label?: string;
      }
    ): ImportGroup;
    importDomainFile(
      file: string,
      options?: { sourceUrl?: string; revision?: string; fetchedAt?: string }
    ): Directory;
  };
  search(snapshot: Snapshot, filters?: Filters, now?: Date): Opportunity[];
  createRequestHandler(options?: {
    catalogue?: Snapshot;
    file?: string;
    publicUrl?: string;
  }): RequestListener;
  createServer(options?: {
    catalogue?: Snapshot;
    file?: string;
    publicUrl?: string;
  }): Server;
};
