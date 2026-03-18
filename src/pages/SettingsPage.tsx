import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Upload, Zap, Type, Megaphone, Volume2, Lock, Hand, Bot,
  Palette, ImageIcon, Settings, User, Shield, Bell
} from "lucide-react";

const ANNOUNCEMENT_COLORS = [
  { label: "Primary Blue", value: "#2563eb" },
  { label: "Emerald Green", value: "#10b981" },
  { label: "Amber Orange", value: "#f59e0b" },
  { label: "Rose Red", value: "#f43f5e" },
  { label: "Violet Purple", value: "#8b5cf6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "White", value: "#ffffff" },
  { label: "Custom", value: "custom" },
];

const ANNOUNCEMENT_SIZES = [
  { label: "Small", value: "text-xs" },
  { label: "Medium", value: "text-sm" },
  { label: "Large", value: "text-base" },
  { label: "Extra Large", value: "text-lg" },
];

export default function SettingsPage() {
  const { profile, user, isAdmin } = useAuth();
  const {
    logoUrl, siteName: currentSiteName,
    headerAnnouncement: currentAnnouncement,
    welcomeTitle: currentWelcomeTitle,
    welcomeNote: currentWelcomeNote,
    announcementColor: currentAnnouncementColor,
    announcementSize: currentAnnouncementSize,
    refetch,
  } = useSiteSettings();

  // Profile
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [company, setCompany] = useState(profile?.company ?? "");
  const [saving, setSaving] = useState(false);

  // Logo
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Site Name
  const [siteNameInput, setSiteNameInput] = useState("");
  const [savingSiteName, setSavingSiteName] = useState(false);

  // Announcement
  const [announcementInput, setAnnouncementInput] = useState("");
  const [announcementColor, setAnnouncementColor] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [announcementSize, setAnnouncementSize] = useState("");
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Welcome
  const [welcomeTitleInput, setWelcomeTitleInput] = useState("");
  const [welcomeNoteInput, setWelcomeNoteInput] = useState("");
  const [savingWelcome, setSavingWelcome] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification sound
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("notification_sound") !== "false");
  const [uploadingSound, setUploadingSound] = useState(false);
  const soundFileRef = useRef<HTMLInputElement>(null);
  const customSoundUrl = localStorage.getItem("notification_sound_url");

  // Telegram Bot Token
  const { data: currentBotToken, refetch: refetchBotToken } = useQuery({
    queryKey: ["telegram-bot-token-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "telegram_bot_token").single();
      return data?.value ?? "";
    },
    enabled: isAdmin,
  });
  const [botTokenInput, setBotTokenInput] = useState("");
  const [savingBotToken, setSavingBotToken] = useState(false);

  // Sync inputs
  if (currentSiteName && !siteNameInput && !savingSiteName) setSiteNameInput(currentSiteName);
  if (currentAnnouncement && !announcementInput && !savingAnnouncement) setAnnouncementInput(currentAnnouncement);
  if (currentAnnouncementColor && !announcementColor && !savingAnnouncement) {
    const isPreset = ANNOUNCEMENT_COLORS.some(c => c.value === currentAnnouncementColor);
    if (isPreset) {
      setAnnouncementColor(currentAnnouncementColor);
    } else {
      setAnnouncementColor("custom");
      setCustomColor(currentAnnouncementColor);
    }
  }
  if (currentAnnouncementSize && !announcementSize && !savingAnnouncement) setAnnouncementSize(currentAnnouncementSize);
  if (currentWelcomeTitle && !welcomeTitleInput && !savingWelcome) setWelcomeTitleInput(currentWelcomeTitle);
  if (currentWelcomeNote && !welcomeNoteInput && !savingWelcome) setWelcomeNoteInput(currentWelcomeNote);
  if (currentBotToken && !botTokenInput && !savingBotToken) setBotTokenInput(currentBotToken);

  // Handlers
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, company }).eq("user_id", user.id);
    setSaving(false);
    error ? toast.error("Failed to update profile") : toast.success("Profile updated");
  };

  const handleSaveSiteName = async () => {
    if (!siteNameInput.trim()) return;
    setSavingSiteName(true);
    const { error } = await supabase.from("site_settings").upsert({ key: "site_name", value: siteNameInput.trim() }, { onConflict: "key" });
    setSavingSiteName(false);
    error ? toast.error("Failed to save site name") : (toast.success("Site name updated!"), refetch());
  };

  const handleSaveAnnouncement = async () => {
    setSavingAnnouncement(true);
    const finalColor = announcementColor === "custom" ? customColor : announcementColor;
    const promises = [
      supabase.from("site_settings").upsert({ key: "header_announcement", value: announcementInput.trim() }, { onConflict: "key" }),
      supabase.from("site_settings").upsert({ key: "announcement_color", value: finalColor || "#2563eb" }, { onConflict: "key" }),
      supabase.from("site_settings").upsert({ key: "announcement_size", value: announcementSize || "text-sm" }, { onConflict: "key" }),
    ];
    const results = await Promise.all(promises);
    setSavingAnnouncement(false);
    const hasError = results.some(r => r.error);
    hasError ? toast.error("Failed to save announcement") : (toast.success("Announcement updated!"), refetch());
  };

  const handleSaveWelcome = async () => {
    setSavingWelcome(true);
    const { error: e1 } = await supabase.from("site_settings").upsert({ key: "welcome_title", value: welcomeTitleInput.trim() }, { onConflict: "key" });
    const { error: e2 } = await supabase.from("site_settings").upsert({ key: "welcome_note", value: welcomeNoteInput.trim() }, { onConflict: "key" });
    setSavingWelcome(false);
    (e1 || e2) ? toast.error("Failed to save welcome settings") : (toast.success("Welcome settings updated!"), refetch());
  };

  const handleSaveBotToken = async () => {
    if (!botTokenInput.trim()) return;
    setSavingBotToken(true);
    const { error } = await supabase.from("site_settings").upsert({ key: "telegram_bot_token", value: botTokenInput.trim() }, { onConflict: "key" });
    setSavingBotToken(false);
    error ? toast.error("Failed to save bot token") : (toast.success("Telegram bot token updated!"), refetchBotToken());
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const filePath = `brand-logo.${ext}`;
    const { error: uploadError } = await supabase.storage.from("logos").upload(filePath, file, { upsert: true });
    if (uploadError) { toast.error("Failed to upload logo"); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now();
    const { error: settingsError } = await supabase.from("site_settings").upsert({ key: "logo_url", value: publicUrl }, { onConflict: "key" });
    setUploading(false);
    settingsError ? toast.error("Failed to save logo setting") : (toast.success("Logo updated!"), refetch());
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) { toast.error(error.message); } else { toast.success("Password changed!"); setNewPassword(""); setConfirmPassword(""); }
  };

  const handleSoundToggle = (checked: boolean) => {
    setSoundEnabled(checked);
    localStorage.setItem("notification_sound", checked ? "true" : "false");
    toast.success(checked ? "Notification sound enabled" : "Notification sound disabled");
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) { toast.error("Please upload an audio file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("File must be under 2MB"); return; }

    setUploadingSound(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      localStorage.setItem("notification_sound_url", dataUrl);
      toast.success("Notification sound uploaded!");
    } catch {
      toast.error("Failed to save custom sound");
    } finally {
      setUploadingSound(false);
    }
  };

  const handleTestSound = () => {
    const url = localStorage.getItem("notification_sound_url");
    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.5;
      audio.play().catch(() => toast.error("Could not play sound"));
    } else {
      // Default beep
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; osc.type = "sine"; gain.gain.value = 0.3;
        osc.start(); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
      } catch { toast.error("Audio not available"); }
    }
  };

  const resolvedColor = announcementColor === "custom" ? customColor : announcementColor;

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your account and platform preferences</p>
        </div>

        {/* ─── ADMIN: Branding Section ─── */}
        {isAdmin && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Branding & Appearance</h2>
            </div>
            <Separator />

            {/* Brand Logo */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-violet-500" />
                  Brand Logo
                </CardTitle>
                <CardDescription>Upload your brand logo for sidebar, header & login page</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-xl border object-contain p-1 bg-muted" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl border bg-muted">
                      <Zap className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      {uploading ? "Uploading..." : "Upload Logo"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Site Name */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Type className="h-4 w-4 text-blue-500" />
                  Site Name
                </CardTitle>
                <CardDescription>Displayed in the sidebar and across the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Input value={siteNameInput} onChange={(e) => setSiteNameInput(e.target.value)} placeholder="Meta Ad Top-Up" className="flex-1" />
                  <Button onClick={handleSaveSiteName} disabled={savingSiteName} size="sm">
                    {savingSiteName ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Announcement */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-amber-500" />
                  Header Announcement
                </CardTitle>
                <CardDescription>Scrolling ticker shown in the header bar for all users</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={announcementInput}
                  onChange={(e) => setAnnouncementInput(e.target.value)}
                  placeholder="🎉 Welcome to our platform! New features coming soon..."
                  rows={2}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Text Color</Label>
                    <div className="flex items-center gap-2">
                      <Select value={announcementColor || "#2563eb"} onValueChange={(v) => { setAnnouncementColor(v); if (v !== "custom") setCustomColor(""); }}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent>
                          {ANNOUNCEMENT_COLORS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              <div className="flex items-center gap-2">
                                {c.value !== "custom" && <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.value }} />}
                                {c.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {announcementColor === "custom" && (
                      <div className="flex items-center gap-2">
                        <input type="color" value={customColor || "#2563eb"} onChange={(e) => setCustomColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                        <Input value={customColor} onChange={(e) => setCustomColor(e.target.value)} placeholder="#ff5733" className="flex-1 h-8 text-xs" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Text Size</Label>
                    <Select value={announcementSize || "text-sm"} onValueChange={setAnnouncementSize}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANNOUNCEMENT_SIZES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview */}
                {announcementInput && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                    <span className={`font-medium ${announcementSize || "text-sm"}`} style={{ color: resolvedColor || "#2563eb" }}>
                      {announcementInput}
                    </span>
                  </div>
                )}

                <Button onClick={handleSaveAnnouncement} disabled={savingAnnouncement} size="sm">
                  {savingAnnouncement ? "Saving..." : "Save Announcement"}
                </Button>
              </CardContent>
            </Card>

            {/* Welcome Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hand className="h-4 w-4 text-violet-500" />
                  Auth Page Welcome
                </CardTitle>
                <CardDescription>Customize the welcome message on the login/signup page</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Welcome Title</Label>
                  <Input value={welcomeTitleInput} onChange={(e) => setWelcomeTitleInput(e.target.value)} placeholder="Welcome" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Welcome Note</Label>
                  <Textarea value={welcomeNoteInput} onChange={(e) => setWelcomeNoteInput(e.target.value)} placeholder="Sign in to manage your ad campaigns" rows={2} />
                </div>
                <Button onClick={handleSaveWelcome} disabled={savingWelcome} size="sm">
                  {savingWelcome ? "Saving..." : "Save Welcome Settings"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── ADMIN: Integrations Section ─── */}
        {isAdmin && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Integrations</h2>
            </div>
            <Separator />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-sky-500" />
                  Telegram Bot Token
                </CardTitle>
                <CardDescription>Used for receiving bank notification messages via Telegram</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Input type="password" value={botTokenInput} onChange={(e) => setBotTokenInput(e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" className="flex-1" />
                  <Button onClick={handleSaveBotToken} disabled={savingBotToken} size="sm">
                    {savingBotToken ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Notification Section (All users) ─── */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Notifications</h2>
          </div>
          <Separator />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-blue-500" />
                Notification Sound
              </CardTitle>
              <CardDescription>Configure alert sounds for new notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable notification sound</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Play a sound when you receive a new notification</p>
                </div>
                <Switch checked={soundEnabled} onCheckedChange={handleSoundToggle} />
              </div>

              {soundEnabled && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Custom Sound</p>
                      <p className="text-xs text-muted-foreground">Upload an audio file (MP3, WAV — max 2MB)</p>
                    </div>
                    <input ref={soundFileRef} type="file" accept="audio/*" className="hidden" onChange={handleSoundUpload} />
                    <Button variant="outline" size="sm" disabled={uploadingSound} onClick={() => soundFileRef.current?.click()}>
                      <Upload className="mr-2 h-3.5 w-3.5" />
                      {uploadingSound ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                  {customSoundUrl && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Volume2 className="h-3 w-3" />
                      <span>Custom sound uploaded</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { localStorage.removeItem("notification_sound_url"); toast.success("Reset to default beep"); window.location.reload(); }}>
                        Reset to default
                      </Button>
                    </div>
                  )}
                  <Button variant="secondary" size="sm" onClick={handleTestSound}>
                    <Volume2 className="mr-2 h-3.5 w-3.5" />
                    Test Sound
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Account Section (All users) ─── */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>
          <Separator />

          {/* Profile */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Email</Label>
                <Input value={user?.email ?? ""} disabled className="bg-muted" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Company</Label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-orange-500" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">New Password</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Confirm Password</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" minLength={6} />
                </div>
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword || !confirmPassword} size="sm">
                {changingPassword ? "Changing..." : "Change Password"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
