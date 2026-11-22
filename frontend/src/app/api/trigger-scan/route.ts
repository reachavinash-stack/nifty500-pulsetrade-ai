import { NextResponse } from "next/server";

export async function POST() {
  const token = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO; // e.g., "username/nifty500-pulsetrade-ai"

  if (!token || !repo) {
    return NextResponse.json(
      {
        status: "simulated",
        message:
          "Configure GITHUB_PAT and GITHUB_REPO in Vercel env vars to dispatch live GitHub Actions scans.",
      },
      { status: 200 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/daily_nifty500_scan.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { force_run: "true" },
      }),
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { status: "error", message: `GitHub API returned ${response.status}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "dispatched",
    message: "Live Nifty 500 scan started on GitHub Actions. Refresh in ~3 minutes.",
  });
}
