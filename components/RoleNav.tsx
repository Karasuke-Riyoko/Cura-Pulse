"use client";

import React from "react";
import { TopBar, useViewState } from "@/components/Shell";

/** Legacy wrapper kept for older pages: renders the shared CuraPulse top bar. */
export default function RoleNav() {
  const view = useViewState("desktop");
  return <TopBar view={view} />;
}
