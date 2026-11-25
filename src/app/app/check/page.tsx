import { query, type Query } from "@/lib/query";
import { CheckView } from "@/components/check";
export const metadata = { title: "Check status" };
export default async function Page({ searchParams }: { searchParams: Query }) { return <CheckView initialId={(await query(searchParams)).id ?? ""} />; }
