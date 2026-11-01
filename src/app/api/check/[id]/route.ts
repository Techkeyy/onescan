import { getJobs } from "@/lib/jobs";
import { json } from "../../_lib/util";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJobs().get(id);
  return job ? json(job) : json({ error: "No such check." }, 404);
}
