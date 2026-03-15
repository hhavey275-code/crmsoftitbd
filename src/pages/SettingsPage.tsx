import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, Zap, DollarSign, Type, Megaphone, Volume2, Lock, Hand } from "lucide-react";

export default function SettingsPage() {
  const { profile, user, role, isAdmin } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [company, setCompany] = useState(profile?.company ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { logoUrl, siteName: currentSiteName, headerAnnouncement: currentAnnouncement, welcomeTitle: currentWelcomeTitle, welcomeNote: currentWelcomeNote, refetch } = useSiteSettings();

  // Site Name state
  const [siteNameInput, setSiteNameInput] = useState("");
  const [savingSiteName, setSavingSiteName] = useState(false);

  // Header Announcement state
  const [announcementInput, setAnnouncementInput] = useState("");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Welcome Title/Note state
  const [welcomeTitleInput, setWelcomeTitleInput] = useState("");
  const [welcomeNoteInput, setWelcomeNoteInput] = useState("");
  const [savingWelcome, setSavingWelcome] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification sound state
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("notification_sound") !== "false");

  // USD Rate state
  const { data: currentRate, refetch: refetchRate } = useQuery({
    queryKey: ["usd-rate-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "";
    },
    enabled: isAdmin,
  });
  const [usdRate, setUsdRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // Sync rate input when data loads
  if (currentRate && !usdRate && !savingRate) {
    setUsdRate(currentRate);
  }
  // Sync site name input when data loads
  if (currentSiteName && !siteNameInput && !savingSiteName) {
    setSiteNameInput(currentSiteName);
  }
  // Sync announcement input when data loads
  if (currentAnnouncement && !announcementInput && !savingAnnouncement) {
    setAnnouncementInput(currentAnnouncement);
  }
  // Sync welcome inputs when data loads
  if (currentWelcomeTitle && !welcomeTitleInput && !savingWelcome) {
    setWelcomeTitleInput(currentWelcomeTitle);
  }
  if (currentWelcomeNote && !welcomeNoteInput && !savingWelcome) {
    setWelcomeNoteInput(currentWelcomeNote);
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

  const handleSaveSiteName = async () => {
    if (!siteNameInput.trim()) return;
    setSavingSiteName(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "site_name", value: siteNameInput.trim() }, { onConflict: "key" });
    setSavingSiteName(false);
    if (error) {
      toast.error("Failed to save site name");
    } else {
      toast.success("Site name updated!");
      refetch();
    }
  };

  const handleSaveAnnouncement = async () => {
    setSavingAnnouncement(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "header_announcement", value: announcementInput.trim() }, { onConflict: "key" });
    setSavingAnnouncement(false);
    if (error) {
      toast.error("Failed to save announcement");
    } else {
      toast.success("Header announcement updated!");
      refetch();
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

  const handleSaveWelcome = async () => {
    setSavingWelcome(true);
    const { error: e1 } = await supabase
      .from("site_settings")
      .upsert({ key: "welcome_title", value: welcomeTitleInput.trim() }, { onConflict: "key" });
    const { error: e2 } = await supabase
      .from("site_settings")
      .upsert({ key: "welcome_note", value: welcomeNoteInput.trim() }, { onConflict: "key" });
    setSavingWelcome(false);
    if (e1 || e2) {
      toast.error("Failed to save welcome settings");
    } else {
      toast.success("Welcome settings updated!");
      refetch();
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

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password changed successfully!");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleSoundToggle = (checked: boolean) => {
    setSoundEnabled(checked);
    localStorage.setItem("notification_sound", checked ? "true" : "false");
    toast.success(checked ? "Notification sound enabled" : "Notification sound disabled");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Header Announcement - Admin only */}
        {isAdmin && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-amber-600" />
                Header Announcement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set a scrolling announcement that appears in the header bar for all users.
              </p>
              <div className="space-y-3">
                <Textarea
                  value={announcementInput}
                  onChange={(e) => setAnnouncementInput(e.target.value)}
                  placeholder="e.g. 🎉 Welcome to our platform! New features coming soon..."
                  rows={2}
                />
                <Button onClick={handleSaveAnnouncement} disabled={savingAnnouncement}>
                  {savingAnnouncement ? "Saving..." : "Save Announcement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Site Name - Admin only */}
        {isAdmin && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="h-5 w-5 text-primary" />
                Site Name
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Change the platform name displayed in the sidebar and across the app.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Platform Name</Label>
                  <Input
                    value={siteNameInput}
                    onChange={(e) => setSiteNameInput(e.target.value)}
                    placeholder="Meta Ad Top-Up"
                  />
                </div>
                <Button onClick={handleSaveSiteName} disabled={savingSiteName} className="mt-6">
                  {savingSiteName ? "Saving..." : "Save Name"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* USD Rate - Admin only */}
        {isAdmin && (
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

        {/* Welcome Title & Note - Admin only */}
        {isAdmin && (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hand className="h-5 w-5 text-violet-600" />
                Auth Page Welcome
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Customize the welcome title and note shown on the login/signup page.
              </p>
              <div className="space-y-2">
                <Label>Welcome Title</Label>
                <Input
                  value={welcomeTitleInput}
                  onChange={(e) => setWelcomeTitleInput(e.target.value)}
                  placeholder="Welcome"
                />
              </div>
              <div className="space-y-2">
                <Label>Welcome Note</Label>
                <Textarea
                  value={welcomeNoteInput}
                  onChange={(e) => setWelcomeNoteInput(e.target.value)}
                  placeholder="Sign in to your account to manage your ad campaigns"
                  rows={2}
                />
              </div>
              <Button onClick={handleSaveWelcome} disabled={savingWelcome}>
                {savingWelcome ? "Saving..." : "Save Welcome Settings"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Logo Upload - Admin only */}
        {isAdmin && (
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

        {/* Notification Sound */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-blue-600" />
              Notification Sound
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Play sound on new notifications</p>
                <p className="text-xs text-muted-foreground mt-0.5">A short beep will play when you receive a new notification</p>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={handleSoundToggle} />
            </div>
          </CardContent>
        </Card>

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

        {/* Change Password */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-orange-600" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" minLength={6} />
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" minLength={6} />
            </div>
            <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword || !confirmPassword}>
              {changingPassword ? "Changing..." : "Change Password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
