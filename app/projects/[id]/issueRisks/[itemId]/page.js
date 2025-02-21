
"use client";
import ItemDetail from "@/components/ItemDetail";
import { useParams, useRouter } from "next/navigation";
import { ResourceTypes } from "@/lib/permissions";
import { useEffect } from "react";

export default function IssueRisksDetailPage() {
  const { id, itemId } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (!id || id === "undefined") {
      console.error("Invalid id:", id);
      router.push("/dashboard/projects");
    }
  }, [id, router]);

  if (!id || id === "undefined") return null;

  return (
    <ItemDetail
      projectId={id}
      resourceType={ResourceTypes.ISSUE_RISK}
      resourceName="issueRisks"
      itemId={itemId}
    />
  );
}
