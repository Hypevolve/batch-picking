import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;

  if (role === "admin") {
    redirect("/dashboard");
  } else {
    redirect("/pick");
  }
}
