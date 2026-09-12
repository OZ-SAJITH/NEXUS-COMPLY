import type { IndustryInfo, RegionInfo, DataTypeFlag } from "@nexus/shared-types";

export const REGIONS: RegionInfo[] = [
  { code: "IN", label: "India", flag: "🇮🇳", bloc: "INDIA" },
  { code: "US", label: "United States", flag: "🇺🇸", bloc: "US" },
  { code: "DE", label: "Germany", flag: "🇩🇪", bloc: "EU" },
  { code: "FR", label: "France", flag: "🇫🇷", bloc: "EU" },
  { code: "NL", label: "Netherlands", flag: "🇳🇱", bloc: "EU" },
  { code: "SG", label: "Singapore", flag: "🇸🇬", bloc: "APAC" },
  { code: "AE", label: "UAE", flag: "🇦🇪", bloc: "MENA" },
  { code: "BR", label: "Brazil", flag: "🇧🇷", bloc: "OTHER" },
  { code: "JO", label: "Jordan", flag: "🇯🇴", bloc: "MENA" },
];

export const EU_CODES = REGIONS.filter((r) => r.bloc === "EU").map((r) => r.code);

export const INDUSTRIES: IndustryInfo[] = [
  { id: "technology", label: "Technology", sector: "TECH", criticalityBaseline: "MEDIUM" },
  { id: "software-saas", label: "Software / SaaS", sector: "TECH", criticalityBaseline: "MEDIUM" },
  { id: "cloud-provider", label: "Cloud Provider", sector: "CLOUD", criticalityBaseline: "HIGH" },
  { id: "finance", label: "Finance", sector: "FINANCE", criticalityBaseline: "HIGH" },
  { id: "banking", label: "Banking", sector: "FINANCE", criticalityBaseline: "HIGH" },
  { id: "healthcare", label: "Healthcare", sector: "HEALTH", criticalityBaseline: "HIGH" },
  { id: "government", label: "Government", sector: "PUBLIC", criticalityBaseline: "CRITICAL" },
  { id: "defense", label: "Defense", sector: "DEFENSE", criticalityBaseline: "CRITICAL" },
  { id: "defense-contractor", label: "Defense Contractor", sector: "DEFENSE", criticalityBaseline: "CRITICAL" },
  { id: "telecommunications", label: "Telecommunications", sector: "TELECOM", criticalityBaseline: "HIGH" },
  { id: "energy", label: "Energy", sector: "ENERGY", criticalityBaseline: "CRITICAL" },
  { id: "manufacturing", label: "Manufacturing", sector: "MANUFACTURING", criticalityBaseline: "MEDIUM" },
  { id: "critical-infrastructure", label: "Critical Infrastructure", sector: "CRITICAL_INFRA", criticalityBaseline: "CRITICAL" },
  { id: "transportation", label: "Transportation", sector: "TRANSPORT", criticalityBaseline: "HIGH" },
  { id: "retail", label: "Retail", sector: "RETAIL", criticalityBaseline: "MEDIUM" },
  { id: "education", label: "Education", sector: "EDUCATION", criticalityBaseline: "MEDIUM" },
  { id: "enterprise", label: "Enterprise", sector: "TECH", criticalityBaseline: "MEDIUM" },
];

export const DATA_TYPES: DataTypeFlag[] = [
  { id: "PERSONAL", label: "Personal data" },
  { id: "FINANCIAL", label: "Financial data" },
  { id: "HEALTH", label: "Health data" },
  { id: "CUSTOMER", label: "Customer data" },
  { id: "EMPLOYEE", label: "Employee data" },
  { id: "INTERNAL", label: "Internal business data" },
  { id: "CLASSIFIED", label: "Classified / restricted" },
  { id: "SOURCECODE", label: "Source code" },
  { id: "TELEMETRY", label: "Telemetry / operational data" },
];

export const DEPLOYMENT_MODELS = [
  { id: "ON_PREM", label: "On-premises" },
  { id: "CLOUD", label: "Cloud" },
  { id: "HYBRID", label: "Hybrid" },
  { id: "MULTI_CLOUD", label: "Multi-cloud" },
  { id: "EDGE", label: "Edge / distributed" },
];

export const ORG_SIZES = [
  { id: "SME", label: "SME" },
  { id: "MID", label: "Mid-market" },
  { id: "ENTERPRISE", label: "Enterprise" },
  { id: "GOVERNMENT", label: "Government / public body" },
];

export function regionOf(code: string): RegionInfo {
  return REGIONS.find((r) => r.code === code) ?? { code, label: code, flag: "🏳️", bloc: "OTHER" };
}

export function industryOf(id: string): IndustryInfo {
  return INDUSTRIES.find((i) => i.id === id) ?? { id, label: id, sector: "TECH", criticalityBaseline: "MEDIUM" };
}

export function flagOf(code: string): string {
  return regionOf(code).flag;
}