import { query, type Query } from "@/lib/query";
import { PaymentsView } from "@/components/payments";
export const metadata = { title: "Payments" };
export default async function Page({ searchParams }: { searchParams: Query }) { return <PaymentsView initialStatus={(await query(searchParams)).status ?? "all"} />; }
