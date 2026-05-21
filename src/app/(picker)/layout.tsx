import { PickerHeader } from "@/components/shared/picker-header";

export default function PickerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ds-bg">
      <PickerHeader />
      <main className="max-w-3xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
