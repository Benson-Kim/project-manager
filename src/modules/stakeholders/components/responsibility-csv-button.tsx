"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { messages } from "@/lib/messages";
import { responsibilityCsv, type CsvRow } from "../schemas/responsibility-csv";
import type { ResponsibilityFramework } from "../schemas/responsibility-frameworks";
import type { ResponsibilityGrid } from "../schemas/responsibility-grid";
import type { ResponsibilityMember } from "../schemas/responsibility-matrix";

const t = messages.responsibility;

interface Props {
  framework: ResponsibilityFramework;
  corner: string;
  members: readonly Pick<ResponsibilityMember, "stakeholderId" | "name">[];
  rows: readonly CsvRow[];
  grid: Pick<ResponsibilityGrid, "roleAt">;
}

export function ResponsibilityCsvButton({ framework, corner, members, rows, grid }: Props) {
  const { toast } = useToast();

  async function copy() {
    // The byte-order mark is for files a spreadsheet opens, not for pasted text.
    const csv = responsibilityCsv(framework, corner, members, rows, grid).replace(/^﻿/, "");
    try {
      await navigator.clipboard.writeText(csv);
      toast({ variant: "success", title: t.csvCopied });
    } catch {
      toast({ variant: "error", title: t.csvCopyFailed });
    }
  }

  return (
    <Button variant="secondary" size="compact" onClick={copy} data-testid="responsibility-copy-csv">
      {t.copyCsv}
    </Button>
  );
}
