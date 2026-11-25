import { query, type Query } from "@/lib/query";
import { PublicFrame } from "@/components/public-frame";
import { StatusLookup } from "@/components/status-lookup";
export const metadata = { title: "Check a payment" };
export default async function Page({ searchParams }: { searchParams: Query }) { return <PublicFrame><StatusLookup initialId={(await query(searchParams)).id ?? ""} /></PublicFrame>; }
