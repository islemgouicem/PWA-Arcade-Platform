import { motion, easeOut } from "framer-motion";
import { ArrowRight, CheckCircle2, Share2, Smartphone, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import ArcadeCard from "@/components/arcade_card";

const fadeUp = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.65, ease: easeOut },
};

const iosSteps = [
    "Open the platform in Safari on your iPhone or iPad.",
    "Tap the Share button in the browser toolbar.",
    "Choose Add to Home Screen.",
    "Launch it from your home screen like a native app.",
];

const androidSteps = [
    "Open the platform in Chrome or another Chromium-based browser.",
    "Tap the browser menu (three dots) in the top-right corner.",
    "Choose Install app or Add to Home screen.",
    "Confirm the install and launch it from your home screen or app drawer.",
];

export default function Index() {
    return (
        <div className="arcade-landing text-[#77867F]">
            <section className="relative overflow-hidden border-b border-[#CB7822]/25">
                <div className="absolute inset-0 bg-[url('/hero.png')] bg-cover bg-center opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/65 to-[#170003]" />
                <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#CB7822]/20 blur-[110px]" />

                <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-6 py-10 text-center">
                    <motion.img
                        src="/arcade.png"
                        alt="Arcade"
                        className="mb-6 w-[250px] max-w-full drop-shadow-[0_16px_34px_rgba(203,120,34,0.28)] sm:w-[330px]"
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.85 }}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.75 }}
                        className="inline-flex items-center gap-2 rounded-full border border-[#CB7822]/35 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#CB7822]"
                    >
                        <Sparkles className="h-4 w-4" />
                        Congratulations, you made it IN
                    </motion.div>



                    <motion.h1
                        className="mt-8 max-w-3xl font-compacta text-5xl leading-none tracking-[0.08em] text-[#e8ece8] sm:text-6xl"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.8 }}
                    >
                        Welcome to ARCADE'26
                    </motion.h1>

                    <motion.p
                        className="mt-5 max-w-3xl text-base leading-7 text-[#c0c9c3] sm:text-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.8 }}
                    >
                        This platform is your central hub for the event. Keep it close, because this is where
                        your live game flow happens.
                    </motion.p>



                    <motion.p
                        className="mt-5 max-w-2xl text-sm leading-7 text-[#b4c0b9] sm:text-base"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.8 }}
                    >
                        You can use the platform directly in your browser, but installing it to your home screen gives you a
                        cleaner, faster, and more portable app-like experience.
                    </motion.p>



                    <motion.div
                        className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs uppercase tracking-[0.14em] text-[#97a79f]"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.7 }}
                    >
                        <span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4 text-[#CB7822]" /> PWA Ready</span>
                        <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#CB7822]" /> Browser or Installed App</span>
                    </motion.div>
                </div>
            </section>

            <section className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
                <motion.div {...fadeUp}>
                    <div className="grid gap-6 lg:grid-cols-2">
                        <ArcadeCard
                            size="lg"
                            title="Install On iPhone"
                            icon={<Smartphone className="h-full w-full" />}
                            cardHeight="auto"
                            showCorners={false}
                            cornerGlow={false}
                            className="bg-[#190004]/50"
                            contentPadding="px-6 py-8 sm:px-10 sm:py-10"
                        >
                            <div>
                                <p className="mb-4 text-xs uppercase tracking-[0.16em] text-[#CB7822]">Quick guide</p>
                                <div className="space-y-4">
                                    {iosSteps.map((step, index) => (
                                        <div key={step} className="flex gap-3 rounded-2xl border border-[#77867F]/20 bg-black/25 p-4 text-left">
                                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#CB7822]/40 bg-[#CB7822]/10 text-xs font-bold text-[#CB7822]">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-6 text-[#b6c1ba] sm:text-base">{step}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 rounded-2xl border border-[#CB7822]/35 bg-black/30 p-4">
                                    <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[#CB7822]">
                                        <Share2 className="h-4 w-4" /> Why install?
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-[#b4c0b9]">
                                        Installing it keeps the experience fast, app-like, and easy to reopen from your home screen.
                                    </p>
                                </div>
                            </div>
                        </ArcadeCard>

                        <ArcadeCard
                            size="lg"
                            title="Install On Android"
                            icon={<Smartphone className="h-full w-full" />}
                            cardHeight="auto"
                            showCorners={false}
                            cornerGlow={false}
                            className="bg-[#190004]/50"
                            contentPadding="px-6 py-8 sm:px-10 sm:py-10"
                        >
                            <div>
                                <p className="mb-4 text-xs uppercase tracking-[0.16em] text-[#CB7822]">Quick guide</p>
                                <div className="space-y-4">
                                    {androidSteps.map((step, index) => (
                                        <div key={step} className="flex gap-3 rounded-2xl border border-[#77867F]/20 bg-black/25 p-4 text-left">
                                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#CB7822]/40 bg-[#CB7822]/10 text-xs font-bold text-[#CB7822]">
                                                {index + 1}
                                            </div>
                                            <p className="text-sm leading-6 text-[#b6c1ba] sm:text-base">{step}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 rounded-2xl border border-[#CB7822]/35 bg-black/30 p-4">
                                    <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-[#CB7822]">
                                        <Share2 className="h-4 w-4" /> Why install?
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-[#b4c0b9]">
                                        Installing it gives you quicker access, smoother reopening, and a more app-like experience.
                                    </p>
                                </div>
                            </div>
                        </ArcadeCard>
                    </div>
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
