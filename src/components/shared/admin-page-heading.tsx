"use client";

import { usePathname } from "next/navigation";

const pageConfig: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Pregled stanja skladišta i narudžbi.",
  },
  "/batches": {
    title: "Batchevi",
    description: "Grupni picking nalozi.",
  },
  "/orders": {
    title: "Narudžbe",
    description: "Pregled narudžbi uvezenih iz WooCommerce.",
  },
  "/locations": {
    title: "SKU Lokacije",
    description: "Skladišne lokacije i raspored prolaza.",
  },
  "/users": {
    title: "Korisnici",
    description: "Upravljanje računima i ulogama.",
  },
};

export function AdminPageHeading() {
  const pathname = usePathname();

  // Only show on exact list-page routes, not detail pages like /batches/123
  const config = pageConfig[pathname];
  if (!config) return null;

  return (
    <div className="mb-6">
      <h1 className="text-ds-20 font-semibold text-ds-text-primary tracking-tight leading-none">
        {config.title}
      </h1>
      <p className="text-ds-13 text-ds-text-secondary mt-1">{config.description}</p>
    </div>
  );
}
