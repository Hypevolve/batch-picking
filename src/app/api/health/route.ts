import { NextResponse } from "next/server";
import { version } from "../../../../package.json";

// Public: lets anyone check which build is live. Only the app version and the
// git commit Render deployed (RENDER_GIT_COMMIT); nothing else from the environment.
const GIT_SHA = /^[0-9a-f]{7,40}$/i;

export async function GET() {
  const commit = process.env.RENDER_GIT_COMMIT?.trim() ?? "";
  return NextResponse.json(
    { status: "ok", version, commit: GIT_SHA.test(commit) ? commit : null },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
