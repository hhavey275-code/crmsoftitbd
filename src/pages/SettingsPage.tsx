import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Zap, DollarSign, Type } from "lucide-react";

export default function SettingsPage() {
  const { profile, user, role } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [company, setCompany] = useState(profile?.company ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { logoUrl, refetch } = useSiteSettings();

  // USD Rate state
  const { data: currentRate, refetch: refetchRate } = useQuery({
    queryKey: ["usd-rate-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "";
    },
    enabled: role === "admin",
  });
  const [usdRate, setUsdRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // Sync rate input when data loads
  if (currentRate && !usdRate && !savingRate) {
    setUsdRate(currentRate);
  }

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, company })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated");
    }
  };

  const handleSaveRate = async () => {
    if (!usdRate || isNaN(Number(usdRate))) return;
    setSavingRate(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "usd_rate", value: usdRate }, { onConflict: "key" });
    setSavingRate(false);
    if (error) {
      toast.error("Failed to save USD rate");
    } else {
      toast.success("USD rate updated!");
      refetchRate();
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const filePath = `brand-logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast.error("Failed to upload logo");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now();
    const { error: settingsError } = await supabase
      .from("site_settings")
      .upsert({ key: "logo_url", value: publicUrl }, { onConflict: "key" });
    setUploading(false);
    if (settingsError) {
      toast.error("Failed to save logo setting");
    } else {
      toast.success("Logo updated!");
      refetch();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* USD Rate - Admin only */}
        {role === "admin" && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-cyan-600" />
                USD Exchange Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set the BDT to USD exchange rate. Clients will see this rate when submitting top-up requests.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Label>1 USD = BDT</Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={usdRate}
                    onChange={(e) => setUsdRate(e.target.value)}
                    placeholder="120"
                  />
                </div>
                <Button onClick={handleSaveRate} disabled={savingRate} className="mt-6">
                  {savingRate ? "Saving..." : "Save Rate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logo Upload - Admin only */}
        {role === "admin" && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Brand Logo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Current logo" className="h-16 w-16 rounded-lg border object-contain p-1" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted">
                    <Zap className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Upload your brand logo. It will appear in the sidebar, title bar, and login page.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading ? "Uploading..." : "Upload Logo"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
