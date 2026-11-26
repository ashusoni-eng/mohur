import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { currentMerchant } from "@/lib/server/auth";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await currentMerchant()) redirect("/app");
  return <AuthPage deleted={(await searchParams).deleted === "1"} mode="login" title="Welcome back" sub="Sign in to your treasury." />;
}
