import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Shield, LogIn, UserPlus, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import ArcadeCard from "@/components/arcade_card";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { getSetting, loading: settingsLoading } = usePlatformSettings();
  const isRegistrationOpen = getSetting("registration_open", true);

  // Force return to login if registration closes while on register tab
  useEffect(() => {
    if (!isRegistrationOpen && !isLogin && !settingsLoading) {
      setIsLogin(true);
    }
  }, [isRegistrationOpen, isLogin, settingsLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!isLogin) {
      if (settingsLoading) {
        toast.error("Please wait while loading platform settings");
        setLoading(false);
        return;
      }
      if (!isRegistrationOpen) {
        toast.error("Registration is currently closed by the admin");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        setLoading(false);
        return;
      }
      if (!teamName.trim()) {
        toast.error("Team name is required");
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, teamName.trim());
      if (error) {
        toast.error(error.message || "Registration failed");
      } else {
        toast.success("Team registered! Welcome to ARCADE.");
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error("Invalid credentials");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/registeration_1.png')] bg-cover bg-center opacity-24" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/78 via-[#1a0003]/88 to-black/95" />
      <div className="absolute top-12 left-8 h-3 w-3 rounded-full bg-biohazard/70 blur-[1px] animate-ember-float" />
      <div className="absolute top-20 right-10 h-2.5 w-2.5 rounded-full bg-blood/80 blur-[1px] animate-ember-float [animation-delay:0.8s]" />
      <div className="absolute bottom-12 left-1/4 h-2 w-2 rounded-full bg-toxic/70 blur-[1px] animate-ember-float [animation-delay:1.6s]" />
      <img src="/reg_2.png" alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 hidden w-56 opacity-70 md:block" />
      <img src="/reg_3.png" alt="" aria-hidden="true" className="pointer-events-none absolute right-2 top-20 hidden w-48 opacity-75 lg:block" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            <div className="mt-2 inline-flex items-center">
              <img src="/logo.png" alt="Skill and Tell Scientific Club logo" className="w-[100px]" />
            </div>
          </motion.div>
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring" }}
          >
            <img src="/arcade.png" alt="ARCADE event logo" className="w-[260px] max-w-full mx-auto drop-shadow-[0_8px_24px_hsl(var(--blood)/0.35)]" />
          </motion.div>
        </div>

        <ArcadeCard
          size="md"
          title={isLogin ? "Welcome Back" : "Create Your Squad"}
          icon={<Shield className="h-full w-full" />}
          cardHeight="auto"
          className="auth-arcade-card"
          contentPadding="px-5 py-6 sm:px-7 sm:py-7"
        >
          <div className="pointer-events-none absolute right-5 top-16 hidden lg:block">
            <img src="/target.png" alt="" aria-hidden="true" className="w-20 opacity-20" />
          </div>

          {isRegistrationOpen && (<div className="flex mb-6 gap-2">
            <Button
              variant="ghost"
              className={`flex-1 arcade-auth-tab ${isLogin ? "arcade-auth-tab-active" : ""}`}
              onClick={() => setIsLogin(true)}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>

            <Button
              variant="ghost"
              className={`flex-1 arcade-auth-tab ${!isLogin ? "arcade-auth-tab-active" : ""}`}
              onClick={() => setIsLogin(false)}
              disabled={settingsLoading}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Register
            </Button>

          </div>
          )}
          {!isLogin && !settingsLoading && !isRegistrationOpen && (
            <p className="text-xs text-blood font-flavor mb-4">Registration is currently closed by the admin.</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <Label htmlFor="teamName" className="font-flavor">Team Name</Label>
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter your squad name..."
                  className="mt-1 arcade-auth-field"
                  required={!isLogin}
                />
              </motion.div>
            )}

            <div>
              <Label htmlFor="email" className="font-flavor">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="team@arcade.com"
                className="mt-1 arcade-auth-field"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="font-flavor">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="pr-10 arcade-auth-field"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
              >
                <Label htmlFor="confirmPassword" className="font-flavor">Confirm Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••"
                    className="pr-10 arcade-auth-field"
                    required={!isLogin}
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </motion.div>
            )}

            <Button type="submit" className="w-full arcade-auth-submit" disabled={loading || (!isLogin && (!isRegistrationOpen || settingsLoading))}>
              <Shield className="w-4 h-4 mr-2" />
              {loading ? "Processing..." : isLogin ? "Enter the Arena" : "Register Team"}
            </Button>
          </form>
        </ArcadeCard>

        <p className="text-center text-muted-foreground text-xs mt-6 font-flavor tracking-wide">
          Skill&Tell Scientific Club — ARCADE Event Platform
        </p>
      </motion.div>
    </div>
  );
}
