export type DependencyKind =
  | 'dependency'
  | 'devDependency'
  | 'peerDependency'
  | 'optionalDependency';

export interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  bin?: string | Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface DirectDependency {
  name: string;
  declared: string;
  type: string;
}

export type DependencyStatus =
  | 'latest'
  | 'update-within-range'
  | 'newer-outside-range'
  | 'outdated'
  | 'unknown';

export interface DependencyItem {
  name: string;
  declared: string | null;
  type: string | null;
  current: string | null;
  wanted: string | null;
  latest: string | null;
  location: string | null;
  homepage: string | null;
  status: DependencyStatus;
}

export interface DependencyReport {
  available: boolean;
  checked: boolean;
  totalDeclared: number;
  outdatedCount: number;
  items: DependencyItem[];
  warning: string | null;
}

export interface ExtensionStats {
  files: number;
  lines: number;
  nonEmpty: number;
}

export interface LocReport {
  files: number;
  lines: number;
  nonEmpty: number;
  skippedLargeFiles: number;
  byExtension: Record<string, ExtensionStats>;
}

export interface Contributor {
  name: string;
  email: string | null;
  commits: number;
  activeDays: number;
  additions: number;
  deletions: number;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
}

export interface GitReport {
  available: boolean;
  reason: string | null;
  branch: string | null;
  remote: string | null;
  lastCommitAt: string | null;
  periodDays: number | null;
  commits: number;
  activeDays: number;
  contributorsCount: number;
  additions: number;
  deletions: number;
  topContributorShare: number;
  contributors: Contributor[];
}

export interface ProjectLanguage {
  extension: string;
  nonEmptyLines: number;
}

export interface ProjectReport {
  primary: string;
  packageManager: string | null;
  traits: string[];
  languages: ProjectLanguage[];
}

export interface FarsightReport {
  schemaVersion: 1;
  generatedAt: string;
  root: string;
  package: {
    name: string | null;
    version: string | null;
    private: boolean;
  } | null;
  project: ProjectReport;
  dependencies: DependencyReport;
  loc: LocReport;
  git: GitReport;
}

export interface CliOptions {
  cwd: string;
  sinceDays: number;
  top: number;
  json: boolean;
  network: boolean;
  help: boolean;
  version: boolean;
}
