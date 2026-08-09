"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Crosshair, Chrome } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  if (status === "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-light">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-brand-light text-slate-900 font-sans selection:bg-brand-purple selection:text-white overflow-hidden">
      {/* Navbar */}
      <motion.nav 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Slay.res logo" className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight">Slay.res</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <Link href="#" className="hover:text-slate-900 transition-colors">For Students</Link>
          <Link href="#" className="hover:text-slate-900 transition-colors">For Institutions</Link>
          <Link href="#" className="hover:text-slate-900 transition-colors">Features</Link>
          <Link href="#" className="hover:text-slate-900 transition-colors">Templates</Link>
          <Link href="#" className="hover:text-slate-900 transition-colors">Support</Link>
        </div>
        <div>
          <Link
            href="/login"
            className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 inline-block"
          >
            Get Hired
          </Link>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="px-4 pt-4 pb-12 max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[2.5rem] bg-brand-dark px-6 py-24 sm:px-12 sm:py-32 lg:px-16 text-center text-white min-h-[600px] flex flex-col items-center justify-start"
        >
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <motion.div
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="w-full h-full relative"
            >
              <Image 
                src="/hero-bg.png" 
                alt="Hero background" 
                fill 
                className="object-cover object-center opacity-90"
                priority
              />
            </motion.div>
            {/* Gradient overlay to ensure text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/40 to-brand-dark/20"></div>
          </div>
          
          <motion.div 
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="relative z-10 max-w-3xl flex flex-col items-center mt-8"
          >
            <motion.div variants={fadeIn}>
              <Crosshair className="h-8 w-8 text-indigo-300 mb-6" />
            </motion.div>
            <motion.h1 variants={fadeIn} className="text-4xl font-medium tracking-tight sm:text-6xl mb-6">
              Where Profiles Get Tailored
            </motion.h1>
            <motion.p variants={fadeIn} className="text-lg leading-relaxed text-indigo-100/90 max-w-2xl mb-10">
              A deterministic, zero-hallucination engine that instantly adapts your master profile to any job description with 100% precision. Stop lying, start 'Slaying'.
            </motion.p>
            <motion.div variants={fadeIn}>
              <Link
                href="/login"
                className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-brand-dark shadow-sm hover:bg-indigo-50 transition-all hover:scale-105 active:scale-95 inline-block"
              >
                Try it now
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* What is Slay.res? Section */}
      <section className="max-w-7xl mx-auto px-6 py-16 md:py-24 overflow-hidden">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="grid md:grid-cols-2 gap-12 items-start"
        >
          <motion.div variants={fadeIn}>
            <h2 className="text-4xl font-medium tracking-tight mb-8">What is Slay.res?</h2>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark transition-all hover:scale-105 active:scale-95"
            >
              Explore now
            </Link>
          </motion.div>
          <motion.div variants={fadeIn}>
            <p className="text-lg text-slate-800 leading-relaxed font-medium">
              Slay.res is a B2B and B2C resume tailoring platform. It enables colleges, bootcamps, and career services to instantly create hyper-tailored resumes for whole student batches, while empowering individuals with a precise browser extension for 1-click tailoring on job boards, ensuring traceability and impact.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {/* Card 1: Institutional Tailoring */}
          <motion.div variants={fadeIn} className="md:col-span-2 relative overflow-hidden rounded-3xl bg-brand-purple p-8 text-white min-h-[320px] flex flex-col justify-between group cursor-default hover:-translate-y-1 transition-transform duration-300">
            <div className="absolute right-0 top-0 bottom-0 w-2/3 pointer-events-none">
               <Image 
                src="/card-institutional.png" 
                alt="Institutional Tailoring" 
                fill 
                className="object-cover object-right opacity-80 mix-blend-screen transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <div className="relative z-10 max-w-[200px]">
              <h3 className="text-2xl font-medium mb-16">Institutional<br/>Tailoring</h3>
              <p className="text-sm text-indigo-100/70">
                Empower placement offices to batch-process students. Tailor hundreds of profiles for specific job drives in minutes, boosting institutional metrics.
              </p>
            </div>
          </motion.div>

          {/* Card 2: Always Factual */}
          <motion.div variants={fadeIn} className="rounded-3xl bg-brand-purple p-8 text-white flex flex-col justify-between min-h-[320px] hover:-translate-y-1 transition-transform duration-300">
            <div>
              <h3 className="text-2xl font-medium mb-6">Always Factual,<br/>Always Traceable</h3>
              <Crosshair className="h-6 w-6 text-indigo-300" />
            </div>
            <p className="text-sm text-indigo-100/70">
              Our verifyTraceability() logic ensures zero fabrication. Every tailored point is cross-referenced, making resume writing authentic and easy.
            </p>
          </motion.div>

          {/* Card 3: 100% Extension */}
          <motion.div variants={fadeIn} className="rounded-3xl bg-brand-purple p-8 text-white flex flex-col justify-between min-h-[320px] hover:-translate-y-1 transition-transform duration-300">
            <div>
              <h3 className="text-2xl font-medium mb-6">100% Extension<br/>Integrated</h3>
              <Chrome className="h-6 w-6 text-indigo-300" />
            </div>
            <p className="text-sm text-indigo-100/70">
              A smooth Chrome extension experience. Highlight a JD, right-click, and get an instantly tailored resume, ready for the one-click apply.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* Use Cases Section */}
      <section className="max-w-7xl mx-auto px-6 py-24 pt-12 overflow-hidden">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="grid lg:grid-cols-2 gap-12"
        >
          {/* Left Side */}
          <div className="flex flex-col justify-between">
            <motion.div variants={fadeIn}>
              <p className="text-sm font-medium text-slate-500 mb-2">Use cases in Action</p>
              <h2 className="text-4xl md:text-5xl font-medium tracking-tight mb-12">Use cases</h2>
              
              <div className="mb-12">
                <h3 className="text-2xl font-medium mb-4">For Institutions</h3>
                <p className="text-slate-600 mb-6 max-w-md">
                  Leverage batch processing to streamline student support, manage rosters, and optimise placement success rates with data-driven career resources.
                </p>
                <Link href="#" className="inline-flex items-center text-sm font-medium text-slate-900 hover:text-brand-purple transition-colors group">
                  <ArrowRight className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /> Learn more
                </Link>
              </div>
            </motion.div>

            <motion.div variants={fadeIn} className="mt-auto">
               <div className="inline-flex items-center gap-4 rounded-3xl bg-white px-8 py-6 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all hover:-translate-y-1 group">
                  <ArrowRight className="h-6 w-6 transform -rotate-45 group-hover:rotate-0 transition-transform duration-300" />
                  <span className="text-2xl font-medium">Visit site</span>
               </div>
            </motion.div>
          </div>

          {/* Right Side - For Individuals Card */}
          <motion.div 
            variants={fadeIn}
            className="relative overflow-hidden rounded-[2.5rem] bg-white p-10 md:p-14 shadow-sm border border-slate-100 min-h-[500px] flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="relative z-10">
              <h3 className="text-3xl font-medium mb-6">For Individuals</h3>
              <p className="text-slate-600 max-w-md mb-8 relative z-10 bg-white/40 backdrop-blur-sm p-4 -ml-4 rounded-xl">
                Use our extension on LinkedIn, Indeed, and Naukri. Turn your master profile into a precision-tailored resume in one click, and explore our affordable pricing plans.
              </p>
            </div>
            
            <div className="absolute left-0 right-0 bottom-0 h-3/4 pointer-events-none">
              <Image 
                src="/card-individuals.png" 
                alt="For Individuals" 
                fill 
                className="object-cover object-bottom"
              />
            </div>

            <div className="absolute bottom-8 right-8 flex gap-2 z-10">
               <div className="bg-white/80 backdrop-blur-md rounded-full p-4 shadow-sm cursor-pointer hover:bg-white hover:scale-105 transition-all">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transform rotate-180">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                 </svg>
               </div>
               <div className="bg-white/80 backdrop-blur-md rounded-full p-4 shadow-sm cursor-pointer hover:bg-white hover:scale-105 transition-all">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                 </svg>
               </div>
            </div>
          </motion.div>
        </motion.div>
      </section>
    </main>
  );
}
