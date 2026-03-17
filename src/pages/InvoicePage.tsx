import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Printer } from "lucide-react";

export default function InvoicePage() {
  const { requestId } = useParams<{ requestId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", requestId],
    queryFn: async () => {
      // Get invoice
      const { data: invoice, error: invErr } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("top_up_request_id", requestId)
        .single();
      if (invErr) throw invErr;

      // Get top-up request
      const { data: request } = await supabase
        .from("top_up_requests")
        .select("*")
        .eq("id", requestId!)
        .single();

      // Get client profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", invoice.user_id)
        .single();

      return { invoice, request, profile };
    },
    enabled: !!requestId,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data?.invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Invoice not found</p>
      </div>
    );
  }

  const { invoice, request, profile } = data;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .invoice-container { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 24px !important; }
        }
      `}</style>

      <div className="min-h-screen bg-muted/30 p-4 md:p-8">
        <div className="no-print flex justify-end max-w-3xl mx-auto mb-4">
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print / Download PDF
          </Button>
        </div>

        <div className="invoice-container max-w-3xl mx-auto bg-white text-black rounded-lg shadow-lg p-8 md:p-12">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-6 mb-6">
            <div className="flex items-center gap-4">
              <img src="/images/company-logo.png" alt="SOFT IT BD" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SOFT IT BD</h1>
                <p className="text-sm text-gray-500">South Bepari Para, Agrabad, Chittagong</p>
                <p className="text-sm text-gray-500">Mobile: 01629344993</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-gray-300 uppercase tracking-wider">INVOICE</h2>
              <p className="text-sm font-semibold text-gray-700 mt-1">{invoice.invoice_number}</p>
              <p className="text-sm text-gray-500">{format(new Date(invoice.created_at), "MMMM d, yyyy")}</p>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Bill To</h3>
            <p className="text-lg font-semibold text-gray-900">{profile?.company || profile?.full_name || "—"}</p>
            {profile?.phone && <p className="text-sm text-gray-600">Phone: {profile.phone}</p>}
            {profile?.email && <p className="text-sm text-gray-600">Email: {profile.email}</p>}
          </div>

          {/* Invoice Table */}
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                <th className="text-right py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Rate</th>
                <th className="text-right py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">BDT Amount</th>
                <th className="text-right py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">USD Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-4 text-gray-800 font-medium">Meta ads top up</td>
                <td className="py-4 text-right text-gray-600">৳{Number(invoice.usd_rate || 0).toFixed(2)}/USD</td>
                <td className="py-4 text-right text-gray-600">৳{Number(invoice.bdt_amount || 0).toLocaleString()}</td>
                <td className="py-4 text-right font-semibold text-gray-900">${Number(invoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          {/* Total */}
          <div className="flex justify-end mb-12">
            <div className="w-64">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="font-medium">${Number(invoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-800">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold text-lg text-gray-900">${Number(invoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="border-t border-gray-200 pt-6 flex justify-between items-end">
            <div className="text-xs text-gray-400">
              <p>Payment Reference: {request?.payment_reference || "—"}</p>
              <p>Generated automatically by SOFT IT BD</p>
            </div>
            <div className="text-center">
              <img src="/images/ceo-signature.png" alt="CEO Signature" className="h-16 mx-auto mb-1 object-contain" />
              <div className="border-t border-gray-300 pt-1 px-8">
                <p className="text-sm font-semibold text-gray-700">CEO</p>
                <p className="text-xs text-gray-500">SOFT IT BD</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
