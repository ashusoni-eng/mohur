import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { currentMerchant } from "@/lib/server/auth";
export const metadata = { title: "Sign in" };
export default async function Page() {
  if (await currentMerchant()) redirect("/app");
  return <AuthPage mode="login" title="Welcome back" sub="Sign in to your treasury." />;
}
