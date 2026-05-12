import { QuoteForm } from "@/components/quotes/QuoteForm";

interface EditQuotePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditQuotePage({ params }: EditQuotePageProps) {
  const { id } = await params;

  return <QuoteForm quoteId={id} />;
}
