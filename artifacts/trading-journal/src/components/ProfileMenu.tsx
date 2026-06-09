import { useRef, useEffect, useState, useCallback } from "react";
import {
  User, Settings, Palette, Download, LogOut,
  X, Camera, Eye, EyeOff, ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ProfileData {
  name: string;
  email: string;
  avatarDataUrl: string | null;
}

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem("tradevault_profile");
    if (raw) return JSON.parse(raw) as ProfileData;
  } catch { /**/ }
  return { name: "Revanth Chinnithi", email: "revanth@tradevault.app", avatarDataUrl: null };
}

function saveProfile(p: ProfileData) {
  try { localStorage.setItem("tradevault_profile", JSON.stringify(p)); } catch { /**/ }
}

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const update = useCallback((p: Partial<ProfileData>) => {
    setProfile(prev => {
      const next = { ...prev, ...p };
      saveProfile(next);
      return next;
    });
  }, []);
  return { profile, update };
}

export function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const MENU_ITEMS = [
  { icon: User,     label: "My Profile",  action: "profile",    danger: false },
  { icon: Settings, label: "Settings",    action: "settings",   danger: false },
  { icon: Palette,  label: "Appearance",  action: "appearance", danger: false },
  { icon: Download, label: "Export Data", action: "export",     danger: false },
  { icon: LogOut,   label: "Sign Out",    action: "signout",    danger: true  },
];

interface DropdownProps {
  profile: ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function ProfileDropdown({ profile, onUpdate, onClose, anchorRef }: DropdownProps) {
  const [, navigate] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (showModal) return;
      if (
        dropRef.current  && !dropRef.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, showModal, anchorRef]);

  function handleAction(action: string) {
    if (action === "settings")   { navigate("/settings"); onClose(); return; }
    if (action === "profile")    { setShowModal(true); return; }
    if (action === "export") {
      const data = JSON.stringify({
        profile: { name: profile.name, email: profile.email },
        exportedAt: new Date().toISOString(),
        note: "TradeVault profile export",
      }, null, 2);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = "tradevault-profile.json";
      a.click();
      return;
    }
    if (action === "signout") {
      onClose();
      return;
    }
  }

  const initials = getInitials(profile.name);

  return (
    <>
      <div
        ref={dropRef}
        className="dropdown-in absolute top-[calc(100%+10px)] right-0 w-[230px] rounded-2xl overflow-hidden z-50"
        style={{
          background:          "var(--surface-header)",
          backdropFilter:      "blur(24px)",
          WebkitBackdropFilter:"blur(24px)",
          border:              "1px solid var(--surface-btn-border)",
          boxShadow:           "0 24px 64px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset",
        }}
      >
        <div
          className="flex items-center gap-3 p-3.5"
          style={{ borderBottom: "1px solid var(--surface-divider)" }}
        >
          <div
            className="w-10 h-10 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
            style={{
              background:  "var(--surface-avatar-bg)",
              border:      "1.5px solid var(--surface-avatar-border)",
              boxShadow:   "0 4px 12px rgba(16,185,129,0.12)",
            }}
          >
            {profile.avatarDataUrl
              ? <img src={profile.avatarDataUrl} alt={profile.name} className="w-full h-full object-cover" />
              : <span className="text-[13px] font-bold" style={{ color: "var(--surface-avatar-text)" }}>{initials}</span>
            }
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">{profile.name}</p>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{profile.email}</p>
          </div>
        </div>

        <div className="p-1.5 space-y-0.5">
          {MENU_ITEMS.map((item, i) => (
            <div key={item.action}>
              {i === MENU_ITEMS.length - 1 && (
                <div className="my-1.5 mx-2" style={{ height: "1px", background: "var(--surface-divider)" }} />
              )}
              <button
                onClick={() => handleAction(item.action)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-100 group"
                style={{ color: item.danger ? "#f87171" : "hsl(var(--muted-foreground))" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = item.danger ? "rgba(248,113,113,0.09)" : "var(--surface-btn-hover)";
                  e.currentTarget.style.color = item.danger ? "#fca5a5" : "hsl(var(--foreground))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = item.danger ? "#f87171" : "hsl(var(--muted-foreground))";
                }}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
                {!item.danger && (
                  <ChevronRight className="w-3 h-3 ml-auto opacity-25 group-hover:opacity-50 transition-opacity" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <ProfileModal
          profile={profile}
          onUpdate={onUpdate}
          onClose={() => { setShowModal(false); onClose(); }}
        />
      )}
    </>
  );
}

interface ModalProps {
  profile: ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
  onClose: () => void;
}

function ProfileModal({ profile, onUpdate, onClose }: ModalProps) {
  const [name,     setName]     = useState(profile.name);
  const [email,    setEmail]    = useState(profile.email);
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ avatarDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 350));
    onUpdate({ name: name.trim(), email: email.trim() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const initials = getInitials(name || "RC");

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(10px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{
          background: "hsl(var(--popover))",
          border:     "1px solid var(--surface-btn-border)",
          boxShadow:  "0 32px 80px rgba(0,0,0,0.65)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--surface-divider)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "var(--surface-avatar-bg)", border: "1px solid var(--surface-avatar-border)" }}
            >
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[14px] font-semibold text-white">Edit Profile</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white transition-colors"
            style={{ background: "var(--surface-btn-hover)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer shrink-0" onClick={() => fileRef.current?.click()}>
              <div
                className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  background: "var(--surface-avatar-bg)",
                  border:     "2px solid var(--surface-avatar-border)",
                  boxShadow:  "0 4px 16px rgba(16,185,129,0.10)",
                }}
              >
                {profile.avatarDataUrl
                  ? <img src={profile.avatarDataUrl} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-[20px] font-bold" style={{ color: "var(--surface-avatar-text)" }}>{initials}</span>
                }
              </div>
              <div
                className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "rgba(0,0,0,0.58)" }}
              >
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-[13px] font-medium text-white/75">Profile Photo</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click avatar to upload</p>
              {profile.avatarDataUrl && (
                <button
                  onClick={() => onUpdate({ avatarDataUrl: null })}
                  className="text-[11px] text-red-400 hover:text-red-300 mt-1.5 transition-colors"
                >
                  Remove photo
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Full Name</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="rounded-xl h-10 text-sm"
                style={{ background: "var(--surface-input-bg)", border: "1px solid var(--surface-input-border)" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="rounded-xl h-10 text-sm"
                style={{ background: "var(--surface-input-bg)", border: "1px solid var(--surface-input-border)" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                New Password <span className="normal-case text-muted-foreground/45 font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="rounded-xl h-10 pr-10 text-sm"
                  style={{ background: "var(--surface-input-bg)", border: "1px solid var(--surface-input-border)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-xl text-sm font-medium"
              style={{
                background: saving || !name.trim() ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.75)",
                color:      "white",
                border:     "1px solid rgba(16,185,129,0.30)",
              }}
            >
              {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-sm text-muted-foreground"
              style={{ background: "transparent", border: "1px solid var(--surface-btn-border)" }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
