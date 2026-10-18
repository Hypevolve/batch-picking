import { NextResponse } from "next/server";
import { version } from "../../../../package.json";
import { isServiceRoleConfigured } from "@/server/db/supabase-admin";

// Public: lets anyone check which build is live. Only the app version, the git
// commit Render deployed (RENDER_GIT_COMMIT) and whether the server has a
// Supabase service role key (a boolean, never the key); nothing else from the environment.
const GIT_SHA = /^[0-9a-f]{7,40}$/i;

export async function GET() {
  const commit = process.env.RENDER_GIT_COMMIT?.trim() ?? "";
  return NextResponse.json(
    {
      status: "ok",
      version,
      commit: GIT_SHA.test(commit) ? commit : null,
      serviceRoleConfigured: isServiceRoleConfigured(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
