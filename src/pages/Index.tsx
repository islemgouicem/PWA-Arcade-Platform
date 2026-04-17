import { motion, easeOut } from "framer-motion";
import { ArrowRight, Calendar, Flag, MapPin, ShieldCheck, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import ArcadeCard from "@/components/arcade_card";

const agenda = [
  { time: "08:00 - 09:00", title: "Check-in + Gear Sync", note: "Badge pickup, team verification, arena warm-up." },
  { time: "09:15 - 12:00", title: "Scenario Runs", note: "Timed missions, puzzle chains, and survival decisions." },
  { time: "13:00 - 16:30", title: "Boss Arc", note: "Advanced challenge branch with hidden multipliers." },
  { time: "17:00 - 18:00", title: "Final Ranking", note: "Leaderboard reveal and champion announcement." },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.65, ease: easeOut },
};

export default function Index() {
  return (
    <div className="arcade-landing text-[#77867F]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="SkillnTell" className="h-9 w-9 rounded-full border border-[#CB7822]/70" />
            <img src="/arcade.png" alt="Arcade" className="h-7 w-auto" />
          </div>

          <nav className="hidden items-center gap-8 text-sm tracking-[0.1em] text-[#77867F] md:flex">
            <a href="#about" className="transition-colors hover:text-[#CB7822]">About</a>
            <a href="#agenda" className="transition-colors hover:text-[#CB7822]">Agenda</a>
            <a href="#registration" className="transition-colors hover:text-[#CB7822]">Registration</a>
          </nav>

          <Link
            to="/auth"
            className="inline-flex items-center rounded-full border border-[#CB7822]/80 bg-[#1a0004]/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#CB7822] transition hover:bg-[#CB7822]/16"
          >
            Join The Fight
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#CB7822]/25">
        <div className="absolute inset-0 bg-[url('/hero.png')] bg-cover bg-center opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/65 to-[#170003]" />
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#CB7822]/20 blur-[110px]" />

        <div className="relative mx-auto flex min-h-[78vh] max-w-6xl flex-col items-center justify-center px-6 py-20 text-center">
          <motion.img
            src="/arcade.png"
            alt="Arcade"
            className="w-[250px] max-w-full drop-shadow-[0_16px_34px_rgba(203,120,34,0.28)] sm:w-[330px]"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85 }}
          />

          <motion.p
            className="mt-6 max-w-2xl text-base leading-relaxed text-[#b7c1bb] sm:text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            The arena is hungry. Build your squad, beat the clock, and dominate the survival ladder through
            immersive missions and pressure-driven strategy.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs uppercase tracking-[0.14em] text-[#97a79f]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.7 }}
          >
            <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-[#CB7822]" /> 25 April 2026</span>
            <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#CB7822]" /> ENSIA School</span>
          </motion.div>

          <Link
            to="/auth"
            className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#CB7822]/85 bg-[#1b0004]/85 px-7 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#CB7822] transition hover:-translate-y-0.5 hover:bg-[#CB7822]/16"
          >
            Start Mission <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section id="about" className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <motion.div {...fadeUp}>
          <ArcadeCard
            size="md"
            title="About ARCADE"
            icon={<ShieldCheck className="h-full w-full" />}
            className="bg-[#190004]/50"
            cardHeight="auto"
            contentPadding="px-6 py-8 sm:px-10 sm:py-10"
          >
            <div className="grid gap-8 md:grid-cols-[1fr_280px] md:items-center">
              <div>
                <p className="mb-4 text-sm uppercase tracking-[0.16em] text-[#CB7822]">What is ARCADE?</p>
                <p className="text-[15px] leading-7 text-[#b6c1ba] sm:text-base">
                  ARCADE is a scenario-based competitive event by SkillnTell where teams and individuals solve
                  chained missions under pressure. Every decision matters: decode clues, optimize your route,
                  and coordinate as one unit to unlock score boosts and climb the final leaderboard.
                </p>
              </div>
              <div className="mx-auto w-full max-w-[260px]">
                <img src="/about_soldier.png" alt="Arcade soldier" className="h-auto w-full object-contain" />
              </div>
            </div>
          </ArcadeCard>
        </motion.div>
      </section>

      <section id="agenda" className="relative border-y border-[#CB7822]/20 bg-black/30 py-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[url('/Rectangle 410.png')] bg-cover bg-center opacity-14" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="mb-10 text-center">
            <img src="/agenda_zombie.png" alt="Agenda character" className="mx-auto mb-3 h-24 w-auto sm:h-28" />
            <h2 className="font-compacta text-5xl tracking-[0.08em] text-[#CB7822] sm:text-6xl">Agenda</h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            {agenda.map((item, idx) => (
              <motion.div key={item.time} {...fadeUp} transition={{ ...fadeUp.transition, delay: idx * 0.08 }}>
                <ArcadeCard
                  size="sm"
                  cardHeight="auto"
                  contentPadding="px-5 py-6 sm:px-7 sm:py-7"
                  className="bg-[#170003]/56"
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-[#CB7822]">{item.time}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#e4e9e5]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#a3b2aa]">{item.note}</p>
                </ArcadeCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="registration" className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <motion.div {...fadeUp}>
          <ArcadeCard
            size="lg"
            title="Registration Protocol"
            icon={<Flag className="h-full w-full" />}
            cardHeight="auto"
            className="bg-[#190004]/50"
            contentPadding="px-6 py-8 sm:px-10 sm:py-10"
          >
            <div className="grid gap-8 lg:grid-cols-[1fr_270px]">
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {["Team Name", "School", "Leader Email", "Phone Number"].map((label) => (
                    <div key={label}>
                      <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[#CB7822]">{label}</p>
                      <div className="rounded-full border border-[#77867F]/40 bg-black/35 px-4 py-2 text-sm text-[#9eb0a7]">
                        Enter {label.toLowerCase()}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-[#CB7822]/35 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-[#CB7822]">Team Mode</p>
                  <p className="mt-2 text-sm leading-6 text-[#b4c0b9]">
                    Squad-based admission, limited slots. Final access is granted after admin verification.
                  </p>
                </div>

                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-full border border-[#CB7822] bg-[#CB7822]/12 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#CB7822] transition hover:bg-[#CB7822]/22"
                >
                  Register Now <Swords className="h-4 w-4" />
                </Link>
              </div>

              <div className="mx-auto w-full max-w-[250px] self-end">
                <img src="/organizers_soldiers.png" alt="Organizers" className="h-auto w-full object-contain" />
              </div>
            </div>
          </ArcadeCard>
        </motion.div>
      </section>

      <section className="relative overflow-hidden border-t border-[#CB7822]/20 py-16 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[url('/target.png')] bg-center opacity-20" />
        <div className="relative mx-auto max-w-4xl px-6">
          <motion.h2 {...fadeUp} className="font-compacta text-5xl tracking-[0.08em] text-[#CB7822] sm:text-6xl">
            Ready For Impact?
          </motion.h2>
          <motion.p {...fadeUp} className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#b4c0b9] sm:text-base">
            Your team has one objective: survive, adapt, and finish on top.
            The arena opens once. Make your move count.
          </motion.p>
          <motion.div {...fadeUp} className="mt-8">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-full border border-[#CB7822]/90 bg-[#180003]/82 px-8 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#CB7822] transition hover:bg-[#CB7822]/15"
            >
              Enter ARCADE
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
