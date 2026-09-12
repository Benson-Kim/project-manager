import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Project Manager",
    short_name: "ProjectMgr",
    description:
      "Mobile-first project management: charter, stakeholders, meetings, financials, risks, to-dos and reports.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [],
  };
}
