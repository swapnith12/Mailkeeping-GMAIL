import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

/**
 * Cheap uptime-monitor target. Checks Redis connectivity specifically
 * because an Upstash outage silently breaks quota checks, subscription
 * lookups, and the scan cache — better to report unhealthy than to serve
 * requests that are quietly falling back to wrong defaults.
 */
export async function GET() {
  try {
    await redis.ping();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "redis unreachable" }, { status: 503 });
  }
}
