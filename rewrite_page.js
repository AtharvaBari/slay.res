const fs = require('fs');
let code = fs.readFileSync('app/builder/page.tsx', 'utf8');

const newPageCode = `export default function Page() {
  const [profile, setProfile] = useState<MasterProfile>(emptyProfile());
  const [jd, setJd] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);

  // Uploaded resume + reconciliation
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [parsed, setParsed] = useState<MasterProfile | null>(null);
  const [reconciledMsg, setReconciledMsg] = useState<string | null>(null);

  const [template, setTemplate] = useState<TemplateId>("modern");
  const [leftView, setLeftView] = useState<"pdf" | "details">("details");

  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [didUploadInStep1, setDidUploadInStep1] = useState(false);

  // Auth + persistence
  const { data: session, status } = useSession();
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      setHydrated(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!cancelled && res.ok) {
          const { data } = await res.json();
          if (data?.profile) {
            setProfile(data.profile);
            setJd(data.jd ?? "");
            if (data.template) setTemplate(data.template as TemplateId);
            setAnalysis(null);
          }
        }
      } catch {
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !hydrated) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: ensureUniqueIds(profile), jd, template }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [profile, jd, template, status, hydrated]);

  const hasDetails = profileHasContent(profile);

  function updateProfile(next: MasterProfile) {
    setProfile(next);
    setAnalysis(null);
  }

  async function parseResume(input: File | string, isStep1: boolean) {
    setParsing(true);
    setError(null);
    setReconciledMsg(null);
    try {
      let res: Response;
      if (typeof input === "string") {
        res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: input }),
        });
        setPdfUrl(null);
        setPdfName(null);
      } else {
        const form = new FormData();
        form.append("file", input);
        res = await fetch("/api/parse", { method: "POST", body: form });
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(input));
        setPdfName(input.name);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the resume.");
      const parsedProfile = data.profile as MasterProfile;
      setParsed(parsedProfile);
      
      if (isStep1) {
        updateProfile(ensureUniqueIds(parsedProfile));
        setDidUploadInStep1(true);
        setReconciledMsg("Successfully extracted resume and updated your details.");
      } else {
        const r = reconcile(profile, parsedProfile);
        if (r.missingContacts.length === 0 && r.missingLinks.length === 0 && r.missingExperiences.length === 0 && r.missingEducation.length === 0 && r.missingSkills.length === 0) {
          setReconciledMsg("Your details already contain everything from this resume.");
        } else {
          setRec(r);
        }
      }

      if (typeof input !== "string") {
        setLeftView("pdf");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the resume.");
    } finally {
      setParsing(false);
    }
  }

  function applyReconciliation(sel: ReconcileSelection) {
    if (!parsed || !rec) return;
    const merged = ensureUniqueIds(applyReconcile(profile, parsed, rec, sel));
    updateProfile(merged);
    const added =
      sel.contactKeys.size + sel.links.size + sel.experienceIds.size + sel.educationIds.size + sel.skills.size;
    setReconciledMsg(
      added > 0
        ? \`Applied \${added} item\${added === 1 ? "" : "s"} from your resume to your details.\`
        : "No changes applied — your details already cover the resume."
    );
    setRec(null);
    if (pdfUrl) setLeftView("pdf");
  }

  async function analyze(skipJd: boolean = false) {
    if (!hasDetails) return;
    setAnalyzing(true);
    setError(null);
    try {
      const targetJd = skipJd ? "" : jd;
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: ensureUniqueIds(profile), jd: targetJd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Alignment failed.");
      setAnalysis(data);
      setLeftView(pdfUrl ? "pdf" : "details");
      setCurrentStep(4);
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "smooth" })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alignment failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function loadDemo() {
    setError(null);
    setJd(SAMPLE_JD);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: SAMPLE_RESUME_TEXT }),
      });
      const data = await res.json();
      if (res.ok) {
        updateProfile(ensureUniqueIds(data.profile));
        setCurrentStep(1);
      }
    } catch {
    }
  }

  function resetAll() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setProfile(emptyProfile());
    setAnalysis(null);
    setJd("");
    setPdfUrl(null);
    setPdfName(null);
    setParsed(null);
    setRec(null);
    setReconciledMsg(null);
    setError(null);
    setCurrentStep(1);
    setDidUploadInStep1(false);
  }

  function handleNextStep1() {
    if (!hasDetails) {
      setError("Please add at least some experience or skills before continuing.");
      return;
    }
    setError(null);
    if (didUploadInStep1) {
      setCurrentStep(3); // Skip step 2
    } else {
      setCurrentStep(2);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6">
      <Header onDemo={loadDemo} status={status} session={session} saveState={saveState} />
      <Stepper step={currentStep} />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="no-print mb-4 flex items-center gap-2 rounded-xl border border-neon-red/40 bg-neon-red/10 px-4 py-3 text-sm text-neon-red"
          >
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 relative min-h-[60vh]">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <Section
                n={1}
                title="Your Base Details"
                subtitle="Fill out your resume manually, or upload a resume to instantly populate the fields."
                icon={<User className="h-5 w-5" />}
              >
                {!didUploadInStep1 && (
                  <div className="mb-8 p-6 glass-panel rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-semibold text-slate-800 mb-4 text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4 text-violet-500" /> Auto-extract from Resume
                    </h3>
                    <UploadReconcile
                      parsing={parsing}
                      pdfName={pdfName}
                      rec={null}
                      reconciledMsg={reconciledMsg}
                      onUpload={(f) => parseResume(f, true)}
                      onApply={applyReconciliation}
                      onDismiss={() => {}}
                    />
                  </div>
                )}
                <DetailsForm profile={profile} onChange={updateProfile} />
                
                <div className="mt-8 flex justify-end">
                  <button 
                    onClick={handleNextStep1}
                    className="btn-primary flex items-center gap-2 px-8 py-3 rounded-xl font-semibold"
                  >
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </Section>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <Section
                n={2}
                title="Supplementary Context"
                subtitle="Optional — upload an existing resume to enrich your profile. Your base details remain the source of truth."
                icon={<UploadCloud className="h-5 w-5" />}
              >
                <div className="mb-8 p-6 glass-panel rounded-2xl border border-slate-200 shadow-sm">
                  <UploadReconcile
                    parsing={parsing}
                    pdfName={pdfName}
                    rec={rec}
                    reconciledMsg={reconciledMsg}
                    onUpload={(f) => parseResume(f, false)}
                    onApply={applyReconciliation}
                    onDismiss={() => setRec(null)}
                  />
                  {rec && (
                    <div className="mt-6 border-t border-slate-200 pt-6">
                      <ReconcilePanel profile={profile} parsed={parsed!} rec={rec} onApply={applyReconciliation} onDismiss={() => setRec(null)} />
                    </div>
                  )}
                </div>
                
                <div className="mt-8 flex justify-between">
                  <button onClick={() => setCurrentStep(1)} className="btn-ghost px-6 py-3 rounded-xl font-medium">Back</button>
                  <div className="flex gap-3">
                    <button onClick={() => setCurrentStep(3)} className="btn-ghost px-6 py-3 rounded-xl font-medium">Skip Upload</button>
                    <button onClick={() => setCurrentStep(3)} className="btn-primary px-8 py-3 rounded-xl font-semibold flex items-center gap-2">Next Step <ArrowRight className="w-4 h-4" /></button>
                  </div>
                </div>
              </Section>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <Section
                n={3}
                title="Target Job Alignment"
                subtitle="Paste the job description. The AI tailors your real experience to match the JD."
                icon={<Target className="h-5 w-5" />}
              >
                <div className="space-y-4">
                  <textarea
                    value={jd}
                    onChange={(e) => {
                      setJd(e.target.value);
                      setAnalysis(null);
                    }}
                    placeholder="Paste the target job description here..."
                    className="field h-44 w-full resize-none rounded-2xl p-4 text-sm leading-relaxed text-slate-800"
                  />
                  <div className="flex justify-between items-center mt-6">
                    <button onClick={() => setCurrentStep(didUploadInStep1 ? 1 : 2)} className="btn-ghost px-6 py-3 rounded-xl font-medium">Back</button>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => analyze(true)}
                        disabled={analyzing}
                        className="btn-ghost flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
                      >
                        {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-violet-500" />}
                        Skip & Improve Grammar Only
                      </button>
                      <button
                        onClick={() => analyze(false)}
                        disabled={analyzing || jd.trim().length < 20}
                        className="btn-primary group flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white disabled:opacity-40"
                      >
                        {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        Tailor my resume
                        {!analyzing && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </Section>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              <Section
                n={4}
                title="Preview & Download"
                subtitle="Review your optimized resume, select a template, and download it."
                icon={<LayoutTemplate className="h-5 w-5" />}
              >
                {analysis && jd.trim().length >= 20 && (
                  <div className="mb-8">
                    <GapDashboard analysis={analysis} />
                  </div>
                )}
                {analysis && (
                  <ExportStage
                    profile={profile}
                    analysis={analysis}
                    template={template}
                    onTemplate={setTemplate}
                    pdfUrl={pdfUrl}
                    leftView={leftView}
                    onLeftView={setLeftView}
                    onReset={resetAll}
                  />
                )}
                
                <div className="mt-8 flex justify-start border-t border-slate-200 pt-6">
                  <button onClick={() => setCurrentStep(3)} className="btn-ghost px-6 py-3 rounded-xl font-medium">Back to Tuning</button>
                </div>
              </Section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="no-print mt-16 border-t border-black/10 pt-6 text-center text-xs text-slate-400">
        Slay.res · Deterministic resume engineering · Every bullet traces back to a source you wrote.
      </footer>
    </main>
  );
}`

const startIndex = code.indexOf('export default function Page() {');
const endString = `/* ================================================================== */
/*  Header + Stepper + Section shell                                  */`;
const endIndex = code.indexOf(endString);

if (startIndex !== -1 && endIndex !== -1) {
  const newCode = code.substring(0, startIndex) + newPageCode + '\n\n' + code.substring(endIndex);
  fs.writeFileSync('app/builder/page.tsx', newCode);
  console.log('Replaced Page function successfully.');
} else {
  console.error('Could not find markers');
}
