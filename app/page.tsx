import Nav from "@/components/Nav";
import ConfigForm from "@/components/ConfigForm";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-strong)]">
            Analyze a repo&apos;s commit history
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Pick a date range or a tag, fetch the commits, and get a detailed
            AI-generated report — for public or private GitHub repos. Reports
            are saved to your history and can be exported to Markdown or PDF.
          </p>
        </header>
        <ConfigForm />
      </main>
    </>
  );
}
