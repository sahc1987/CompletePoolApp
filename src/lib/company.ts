import { prisma } from "./prisma";

/**
 * Business identity as printed on invoices and receipts. Everything except the
 * name is optional — a field left blank is omitted from the document rather
 * than rendered as an empty line, so a half-filled Settings page still
 * produces a clean page.
 */
export type CompanyInfo = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  paymentTerms: string;
  paymentNote: string | null;
  documentFooter: string | null;
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "Complete Pool Service Inc.",
  tagline: "Pool maintenance & repair",
  address: null,
  phone: null,
  email: null,
  website: null,
  taxId: null,
  paymentTerms: "Due upon receipt",
  paymentNote: null,
  documentFooter: null,
};

const blankToNull = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Reads the singleton settings row, falling back to defaults before setup. */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  const row = await prisma.appSettings.findUnique({ where: { id: "app" } });
  if (!row) return DEFAULT_COMPANY;

  return {
    name: blankToNull(row.companyName) ?? DEFAULT_COMPANY.name,
    // Distinguishes "never configured" from "deliberately cleared": the
    // tagline default only applies while the whole block is untouched.
    tagline: blankToNull(row.companyTagline),
    address: blankToNull(row.companyAddress),
    phone: blankToNull(row.companyPhone),
    email: blankToNull(row.companyEmail),
    website: blankToNull(row.companyWebsite),
    taxId: blankToNull(row.companyTaxId),
    paymentTerms: blankToNull(row.paymentTerms) ?? DEFAULT_COMPANY.paymentTerms,
    paymentNote: blankToNull(row.paymentNote),
    documentFooter: blankToNull(row.documentFooter),
  };
}
