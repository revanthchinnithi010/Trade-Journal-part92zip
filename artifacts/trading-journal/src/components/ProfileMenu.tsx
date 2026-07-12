import { useRef, useEffect, useState, useCallback } from "react";
import {
  User, Settings, Palette, Download, LogOut,
  X, Camera, Eye, EyeOff, ChevronRight, ChevronLeft,
  Sun, Moon, Monitor, Check,
} from "lucide-react";
import { SidebarSystemSections } from "./SidebarSystemSections";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";
import { AnimatedModal, AnimatedButton } from "@/components/animations";
import { motion, AnimatePresence } from "motion/react";

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
  return { name: "Trader", email: "", avatarDataUrl: null };
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

const THEME_OPTIONS: { mode: ThemeMode; label: string; sub: string; Icon: React.ElementType }[] = [
  { mode: "light",  label: "Light",          sub: "Always use light theme",   Icon: Sun     },
  { mode: "dark",   label: "Dark",           sub: "Always use dark theme",    Icon: Moon    },
  { mode: "system", label: "System Default", sub: "Follow device preference", Icon: Monitor },
];

interface AppearancePanelProps {
  onBack: () => void;
}

function AppearancePanel({ onBack }: AppearancePanelProps) {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <div>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-3"
        style={{ borderBottom: "1px solid var(--surface-divider)" }}
      >
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white transition-colors"
          style={{ background: "var(--surface-btn-hover)" }}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: "rgba(165,180,252,0.12)", border: "1px solid rgba(165,180,252,0.20)" }}
          >
            <Palette className="w-3 h-3" style={{ color: "#a5b4fc" }} />
          </div>
          <span className="text-[13px] font-semibold text-white/90">Appearance</span>
        </div>
      </div>

      {/* Theme Mode section */}
      <div className="p-2">
        <p
          className="text-[9px] font-bold uppercase tracking-[0.12em] px-2 pt-1 pb-2"
          style={{ color: "rgba(148,163,184,0.45)" }}
        >
          Theme Mode
        </p>
        <div className="space-y-0.5">
          {THEME_OPTIONS.map(({ mode, label, sub, Icon }) => {
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-100 group text-left"
                style={{
                  background: active ? "rgba(165,180,252,0.10)" : "transparent",
                  border:     active ? "1px solid rgba(165,180,252,0.22)" : "1px solid transparent",
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)";
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: active ? "rgba(165,180,252,0.18)" : "var(--surface-btn-hover)",
                    border:     active ? "1px solid rgba(165,180,252,0.30)" : "1px solid var(--surface-btn-border)",
                  }}
                >
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: active ? "#a5b4fc" : "hsl(var(--muted-foreground))" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[12px] font-medium leading-tight"
                    style={{ color: active ? "#e0e7ff" : "hsl(var(--foreground))" }}
                  >
                    {label}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{sub}</p>
                </div>
                {active && (
                  <div
                    className="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "#a5b4fc", width: 18, height: 18 }}
                  >
                    <Check className="w-2.5 h-2.5 text-[#1e1b4b]" style={{ strokeWidth: 3 }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface DropdownProps {
  open: boolean;
  profile: ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

// Shared premium ease — smooth ease-out, no spring/bounce anywhere.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

// Backdrop: fade only. Slightly slower on the way in than the way out,
// matching the menu's own open/close asymmetry.
const backdropVariants = {
  hidden:  { opacity: 0,    transition: { duration: 0.17, ease: PREMIUM_EASE } },
  visible: { opacity: 0.45, transition: { duration: 0.24, ease: PREMIUM_EASE } },
};

// Menu panel: fade + scale + slide down from the top-right anchor.
const menuVariants = {
  hidden:  { opacity: 0, scale: 0.96, y: -12, transition: { duration: 0.17, ease: PREMIUM_EASE } },
  visible: { opacity: 1, scale: 1,    y: 0,   transition: { duration: 0.24, ease: PREMIUM_EASE } },
};

// Menu items: staggered fade + slide-in from the right, 18ms apart.
const itemVariants = {
  hidden: { opacity: 0, x: 8 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { duration: 0.18, delay: i * 0.018, ease: PREMIUM_EASE },
  }),
};

const tapTransition = { duration: 0.12, ease: PREMIUM_EASE };

export function ProfileDropdown({ open, profile, onUpdate, onClose }: DropdownProps) {
  const [, navigate] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [panel, setPanel] = useState<"menu" | "appearance">("menu");
  const dropRef = useRef<HTMLDivElement>(null);

  // Reset to menu view whenever the dropdown opens.
  useEffect(() => {
    if (open) setPanel("menu");
  }, [open]);

  // Suppress every .glass-card's backdrop-filter blur elsewhere in the app
  // while the menu is open/animating (same "tj-modal-open" convention used
  // by the alert modals) — animating a small motion panel is cheap, but
  // Chrome recomputing dozens of blurred glass cards behind it every frame,
  // on top of the live tick/candle RAF loop, is what actually caused the lag.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("tj-modal-open");
    return () => document.body.classList.remove("tj-modal-open");
  }, [open]);

  function handleAction(action: string) {
    if (action === "settings")   { navigate("/settings"); onClose(); return; }
    if (action === "profile")    { setShowModal(true); return; }
    if (action === "appearance") { setPanel("appearance"); return; }
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
      <AnimatePresence>
        {open && (
          <>
            {/* ── Backdrop: fade only, blurred, click-outside-to-close ──
                position:fixed so it covers the whole viewport regardless of
                where the trigger sits in the header; sits below the menu
                (z-40 vs z-50) and above everything else in the app,
                including the always-mounted Dashboard/Charts keep-alive
                nodes, so it never triggers a re-render of page content. */}
            {/* No backdrop-filter here on purpose: blurring the full,
                live-ticking viewport every animation frame (charts +
                price RAF loops running underneath) was the source of the
                jank. A flat opacity dim reads as "premium dimmed backdrop"
                just as well and is essentially free to animate. */}
            <motion.div
              key="profile-menu-backdrop"
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,1)", willChange: "opacity" }}
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={onClose}
            />

            <motion.div
              ref={dropRef}
              key="profile-menu-panel"
              variants={menuVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              style={{
                transformOrigin:      "top right",
                background:           "rgba(18,18,20,0.92)",
                backdropFilter:        "blur(24px)",
                WebkitBackdropFilter:  "blur(24px)",
                border:                "1px solid rgba(255,255,255,0.06)",
                boxShadow:             "0 20px 60px rgba(0,0,0,0.45)",
                maxHeight:             "min(88vh, 700px)",
                overflowY:             "auto",
                overflowX:             "hidden",
                willChange:            "transform, opacity",
              }}
              className="absolute top-[calc(100%+10px)] right-0 w-[276px] rounded-[24px] z-50"
            >
              <AnimatePresence mode="wait">
                {panel === "appearance" ? (
                  <motion.div
                    key="appearance"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                  >
                    <AppearancePanel onBack={() => setPanel("menu")} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18, ease: PREMIUM_EASE }}
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
                          <motion.button
                            custom={i}
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            whileTap={{ scale: 0.985, transition: tapTransition }}
                            onClick={() => handleAction(item.action)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-colors duration-150 group"
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
                          </motion.button>
                        </div>
                      ))}
                    </div>

                    {/* ── System Status, Backend Info, Backup & Restore ── */}
                    <div className="px-1.5 pb-2">
                      <SidebarSystemSections open={true} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatedModal
        open={showModal}
        onClose={() => { setShowModal(false); onClose(); }}
        title="Edit Profile"
      >
        <ProfileModal
          profile={profile}
          onUpdate={onUpdate}
          onClose={() => { setShowModal(false); onClose(); }}
        />
      </AnimatedModal>
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
