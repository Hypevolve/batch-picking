import { AdminSidebar } from "@/components/shared/admin-sidebar";
import { AdminHeader } from "@/components/shared/admin-header";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name || "Administrator";

  return (
    <div className="min-h-screen bg-ds-bg">
      <AdminSidebar />

      <div className="pl-[220px] flex flex-col min-h-screen">
        <AdminHeader userName={userName} />

        <main className="flex-1 px-7 py-6">
          <div className="max-w-[1040px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
