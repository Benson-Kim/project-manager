
"use client";
import ItemList from "@/components/ItemList";
import { useParams, useRouter } from "next/navigation";
import { ResourceTypes } from "@/lib/permissions";
import { useEffect } from "react";

export default function QuestionAnswersListPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (!id || id === "undefined") {
      console.error("Invalid id:", id);
      router.push("/dashboard/projects");
    }
  }, [id, router]);

  if (!id || id === "undefined") return null;

  return (
    <ItemList
      projectId={id}
      resourceType={ResourceTypes.QUESTION_ANSWER}
      resourceName="questionAnswers"
    />
  );
}
