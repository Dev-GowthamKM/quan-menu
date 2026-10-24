"use client";
import { createContext, useContext, type ReactNode } from "react";

/** The store the admin panel is working on, for client components (image uploads go in its folder). */
export interface AdminStoreInfo {
  id: string | null;
  name: string;
  isHome: boolean;
  /** The store's own address, or null while it has none. */
  origin: string | null;
}

const Ctx = createContext<AdminStoreInfo>({ id: null, name: "", isHome: true, origin: null });

export function AdminStoreProvider({ value, children }: { value: AdminStoreInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAdminStore = () => useContext(Ctx);
