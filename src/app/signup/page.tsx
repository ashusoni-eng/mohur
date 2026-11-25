import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { currentMerchant } from "@/lib/server/auth";
export const metadata = { title: "Create account" };
export default async function Page() {
  if (await currentMerchant()) redirect("/app");
  return <AuthPage mode="signup" title="Open your account" sub="Connect your bank email and start collecting in about five minutes." />;
}
