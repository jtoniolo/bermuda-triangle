"use client";
// PROTOTYPE — throwaway. Round 1: three variants of the floor plan editor, switchable via ?variant=A|B|C, on /prototype/floor-plan-editor/round-1.
// All variants share one floor plan state, so the user can compare the same shape in each variant.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import { useFloorPlan, StatePanel } from "./shared";
import { VariantA, name as nameA } from "./VariantA";
import { VariantB, name as nameB } from "./VariantB";
import { VariantC, name as nameC } from "./VariantC";

const VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
];

function Editor() {
  const plan = useFloorPlan();
  const variant = useSearchParams().get("variant") ?? "A";
  return (
    <>
      {variant === "A" && <VariantA plan={plan} />}
      {variant === "B" && <VariantB plan={plan} />}
      {variant === "C" && <VariantC plan={plan} />}
      <StatePanel plan={plan} />
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
