import { env } from "@/lib/server/env";
import { Developers } from "@/components/developers";
export const metadata = { title: "Developers" };
export default function Page() { return <Developers base={env.appUrl} />; }
