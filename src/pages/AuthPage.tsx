import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Shield, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { getSetting, loading: settingsLoading } = usePlatformSettings();
  const isRegistrationOpen = getSetting("registration_open", true) === true;

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
    <div className="min-h-screen flex items-center justify-center bg-background bg-scanline p-4 relative overflow-hidden">
      <div className="absolute top-12 left-8 h-3 w-3 rounded-full bg-biohazard/70 blur-[1px] animate-ember-float" />
      <div className="absolute top-20 right-10 h-2.5 w-2.5 rounded-full bg-blood/80 blur-[1px] animate-ember-float [animation-delay:0.8s]" />
      <div className="absolute bottom-12 left-1/4 h-2 w-2 rounded-full bg-toxic/70 blur-[1px] animate-ember-float [animation-delay:1.6s]" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring" }}
          >
            <img src="/arcade.png" alt="ARCADE event logo" className="w-[260px] max-w-full mx-auto drop-shadow-[0_8px_24px_hsl(var(--blood)/0.35)]" />
          </motion.div>
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            <div className="mt-3 inline-flex items-center gap-3 px-3 py-2 rounded-full border border-border bg-card/70 backdrop-blur-sm">
              <img src="/logo.png" alt="Skill and Tell Scientific Club logo" className="w-10 h-10 rounded-full border border-border" />
              <span className="text-xs font-mono-arcade tracking-[0.16em] uppercase text-bone">Skill and Tell Scientific Club</span>
            </div>
          </motion.div>
          <p className="font-flavor text-foreground/80 mt-4 text-sm">
            Strategy. Collection. Competition.
          </p>
        </div>

        <div className="panel-ember rounded-xl p-6 glow-toxic">
          <div className="flex mb-6 gap-2">
            <Button
              variant={isLogin ? "default" : "outline"}
              className="flex-1"
              onClick={() => setIsLogin(true)}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
            <Button
              variant={!isLogin ? "default" : "outline"}
              className="flex-1"
              onClick={() => setIsLogin(false)}
              disabled={settingsLoading}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Register
            </Button>
          </div>

          {!isLogin && !settingsLoading && !isRegistrationOpen && (
            <p className="text-xs text-blood font-flavor">Registration is currently closed by the admin.</p>
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
                  className="mt-1"
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
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="font-flavor">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="mt-1"
                required
              />
            </div>

            {!isLogin && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
              >
                <Label htmlFor="confirmPassword" className="font-flavor">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  className="mt-1"
                  required={!isLogin}
                />
              </motion.div>
            )}

            <Button type="submit" className="w-full" disabled={loading || (!isLogin && (!isRegistrationOpen || settingsLoading))}>
              <Shield className="w-4 h-4 mr-2" />
              {loading ? "Processing..." : isLogin ? "Enter the Arena" : "Register Team"}
            </Button>
          </form>
        </div>

        <p className="text-center text-muted-foreground text-xs mt-6 font-flavor tracking-wide">
          Skill&Tell Scientific Club — ARCADE Event Platform
        </p>
      </motion.div>
    </div>
  );
}
