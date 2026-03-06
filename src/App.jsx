import { useState, useRef, useEffect } from "react";

// ============================================================
// DESIGN TOKENS
// ============================================================
const T = {
  bg: "#080a0f", surface: "#0e1117", surface2: "#141820", surface3: "#1a2030",
  border: "#1e2535", border2: "#252d3d", text: "#e8eaf0", muted: "#5a6480",
  muted2: "#3d4560", accent: "#2563eb", accentGlow: "rgba(37,99,235,0.15)",
  gold: "#f0a500", goldGlow: "rgba(240,165,0,0.12)", green: "#10b981",
  red: "#ef4444", orange: "#f97316", purple: "#8b5cf6",
  serif: "'Libre Baskerville', Georgia, serif",
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};
const fonts = `@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

// ============================================================
// PLAN CONFIG
// ============================================================
const PLANS = {
  single:      { name:"Single Sniff",  price:"$9",  period:"per report", color:T.accent,  freeAdditions:2,   reportsPerMonth:1,   dealComparison:false, emailAlerts:false, unlimitedAdditions:false },
  underwriter: { name:"Underwriter",   price:"$25", period:"/ month",    color:T.gold,    freeAdditions:5,   reportsPerMonth:5,   dealComparison:true,  emailAlerts:true,  unlimitedAdditions:false },
  team:        { name:"Team / Firm",   price:"$59", period:"/ month",    color:T.purple,  freeAdditions:999, reportsPerMonth:999, dealComparison:true,  emailAlerts:true,  unlimitedAdditions:true  },
};

const ASSET_TYPES = [
  { id:"rv_park",      label:"RV Park",                  icon:"🚐", benchmarks:"OER 35-50%, Cap 8-12%" },
  { id:"campground",   label:"Campground",               icon:"⛺", benchmarks:"OER 35-55%, Cap 8-12%" },
  { id:"mhp",          label:"Mobile Home Park (MHP)",   icon:"🏘️", benchmarks:"OER 30-45%, Cap 6-10%" },
  { id:"storage",      label:"Self Storage",             icon:"📦", benchmarks:"OER 25-40%, Cap 5-8%"  },
  { id:"multi_small",  label:"Multifamily (2-4 units)",  icon:"🏠", benchmarks:"OER 35-50%, Cap 5-8%"  },
  { id:"multi_large",  label:"Multifamily (5+ units)",   icon:"🏢", benchmarks:"OER 40-55%, Cap 4-7%"  },
  { id:"commercial",   label:"Small Commercial / Retail",icon:"🏪", benchmarks:"OER 30-50%, Cap 5-9%"  },
  { id:"mixed_use",    label:"Mixed Use",                icon:"🏙️", benchmarks:"OER 35-55%, Cap 5-9%"  },
  { id:"hybrid",       label:"Hybrid (e.g. RV + Storage)",icon:"🔀",benchmarks:"Varies by mix"         },
  { id:"other",        label:"Other / Unknown",          icon:"❓", benchmarks:"To be determined"      },
];

// ============================================================
// INTAKE CHAT SYSTEM PROMPT
// ============================================================
const INTAKE_SYSTEM = `You are FinSniff's intake assistant — a professional, neutral real estate underwriting assistant. Your job is to gather context about a deal through natural conversation before the investor uploads their documents.

Your personality: calm, professional, thorough. You ask clear follow-up questions based on what the investor shares. You don't rush them. You don't use filler phrases like "Great!" or "Absolutely!". Just professional, focused questions.

Guidelines:
- Ask one focused question at a time
- Follow up on anything that sounds financially suspicious or unclear
- Ask about: asking price, claimed NOI, what seems off to them, revenue sources, expenses, debt situation, operational history, anything they've already noticed
- When the investor says they're ready to upload documents (or says something like "that's all", "ready", "let's go", "done"), respond with exactly this JSON on its own line: {"action":"ready","summary":"<2-3 sentence summary of everything discussed>"}
- Keep responses under 3 sentences
- Never make up information or reference documents that haven't been shared yet`;

// ============================================================
// ANALYSIS SYSTEM PROMPT
// ============================================================
const buildAnalysisPrompt = (assetType, intakeSummary, existingReport) => {
  const asset = ASSET_TYPES.find(a => a.id === assetType);
  return `You are an expert commercial real estate underwriter specializing in due diligence for income-producing properties.

ASSET TYPE: ${asset?.label || assetType}
ASSET BENCHMARKS: ${asset?.benchmarks || "Standard commercial"}
INVESTOR CONTEXT FROM INTAKE: ${intakeSummary || "None provided"}
${existingReport ? `EXISTING REPORT (supplemental update): ${JSON.stringify(existingReport).slice(0,2000)}` : ""}

ACCURACY RULES — NON-NEGOTIABLE:
1. NEVER invent or estimate numbers. Only report figures explicitly present in uploaded documents.
2. If a figure cannot be directly verified, set it to null and mark low_confidence: true.
3. Every dollar figure must be traceable to a specific uploaded document.
4. Flag contradictions and missing data explicitly as red flags with category "Data Quality".
5. Use the investor's intake context to prioritize what to look for — if they said revenue seems inflated, scrutinize income sources harder.
6. Apply asset-type-specific benchmarks: ${asset?.benchmarks || "standard commercial benchmarks"}.

Return ONLY valid JSON with this exact structure — no preamble, no markdown:
{
  "propertyName": "string",
  "propertyType": "string",
  "assetTypeId": "${assetType}",
  "dealRiskScore": number,
  "dealRiskRationale": "string",
  "executiveSummary": "string",
  "verdict": "STRONG DEAL|PROCEED WITH CAUTION|WALK AWAY|NEEDS MORE INFO",
  "verdictRationale": "string",
  "intakeContextApplied": "string (how the investor's intake context affected your analysis)",
  "sbaFeasibility": { "eligible": boolean|null, "score": "LIKELY ELIGIBLE|POSSIBLE|UNLIKELY|INSUFFICIENT DATA", "rationale": "string", "keyIssues": ["string"], "low_confidence": boolean },
  "incomeAnalysis": {
    "ownerClaimedRevenue": number|null, "bankVerifiedRevenue": number|null,
    "revenueGap": number|null, "revenueGapPct": number|null,
    "trueNOI": number|null, "ownerClaimedNOI": number|null,
    "normalizedEBITDA": number|null, "operatingExpenseRatio": number|null,
    "benchmarkOER": "string", "oerVsBenchmark": "WITHIN RANGE|BELOW BENCHMARK|ABOVE BENCHMARK|INSUFFICIENT DATA",
    "low_confidence": boolean, "confidenceNote": "string",
    "revenueSources": [{"source":"string","amount":number|null,"pct":number|null,"verified":boolean,"low_confidence":boolean}]
  },
  "valuation": { "assumedCapRate": number|null, "impliedValueAtTrueNOI": number|null, "impliedValueAtClaimedNOI": number|null, "capRateRange": "string", "valuationNote": "string", "low_confidence": boolean },
  "redFlags": [{"title":"string","detail":"string","severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"Income|Expense|Debt|Legal|Operations|Data Quality","low_confidence":boolean}],
  "negotiationPoints": [{"point":"string","leverage":"STRONG|MODERATE|MINOR","suggestedAction":"string","basedOnFlag":"string"}],
  "expenseAddBacks": [{"item":"string","amount":number|null,"reason":"string","low_confidence":boolean}],
  "debtAnalysis": { "summary":"string","estimatedDebtService":number|null,"dscr":number|null,"dscrNote":"string","low_confidence":boolean },
  "ddChecklist": [{"priority":"CRITICAL|HIGH|MEDIUM","item":"string","finding":"string","status":"Open"}],
  "monthlyTrend": [{"month":"string","ownerClaimed":number|null,"bankVerified":number|null}],
  "strengthsFound": ["string"],
  "keyMetrics": [{"label":"string","value":"string","flag":"green|yellow|red|neutral","low_confidence":boolean}],
  "dataQualityScore": number,
  "dataQualityNote": "string",
  "missingDocuments": ["string"]
}`;
};

// ============================================================
// SHARED UI
// ============================================================
const Badge = ({ children, color=T.accent, size=12 }) => (
  <span style={{ display:"inline-flex",alignItems:"center",gap:4,background:color+"20",color,border:`1px solid ${color}40`,borderRadius:4,padding:"2px 8px",fontSize:size,fontFamily:T.mono,letterSpacing:"0.06em",fontWeight:500,whiteSpace:"nowrap" }}>{children}</span>
);
const Btn = ({ children, onClick, variant="primary", disabled, style={}, size="md" }) => {
  const pad = size==="sm"?"7px 12px":size==="lg"?"15px 32px":"10px 20px";
  const fs = size==="sm"?12:size==="lg"?15:13;
  const v = { primary:{background:T.accent,color:"#fff",border:"none"},gold:{background:T.gold,color:"#000",border:"none",boxShadow:`0 0 20px ${T.goldGlow}`},ghost:{background:"transparent",color:T.muted,border:`1px solid ${T.border2}`},outline:{background:"transparent",color:T.accent,border:`1px solid ${T.accent}50`},danger:{background:T.red+"15",color:T.red,border:`1px solid ${T.red}40`},purple:{background:T.purple,color:"#fff",border:"none"} };
  return <button onClick={onClick} disabled={disabled} style={{ ...v[variant],padding:pad,borderRadius:6,fontSize:fs,fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,fontFamily:T.sans,transition:"all 0.18s",letterSpacing:"0.01em",...style }}>{children}</button>;
};
const Card = ({ children, style={}, glow }) => (
  <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:22,boxShadow:glow?`0 0 40px ${glow}`:"none",...style }}>{children}</div>
);
const Label = ({ children, style={} }) => (
  <div style={{ fontSize:10,color:T.muted,fontFamily:T.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,...style }}>{children}</div>
);
const Divider = () => <div style={{ height:1,background:T.border,margin:"16px 0" }} />;
const LowConf = () => <span style={{ display:"inline-flex",alignItems:"center",gap:3,background:T.red+"18",color:T.red,border:`1px solid ${T.red}35`,borderRadius:4,padding:"1px 7px",fontSize:10,fontFamily:T.mono,marginLeft:6 }}>⚠ LOW CONFIDENCE</span>;
const fmt = n => n==null?"—":"$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:0});
const fmtPct = n => n==null?"—":(n*100).toFixed(1)+"%";

// ============================================================
// STEP INDICATOR
// ============================================================
const StepBar = ({ step }) => {
  const steps = ["Asset Type","Situation","Documents","Analysis"];
  return (
    <div style={{ display:"flex",alignItems:"center",gap:0,marginBottom:28 }}>
      {steps.map((s,i)=>(
        <div key={s} style={{ display:"flex",alignItems:"center",flex:1 }}>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flex:1 }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:i<step?T.gold:i===step?T.gold+"33":"transparent",border:`2px solid ${i<=step?T.gold:T.border2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:i<step?"#000":i===step?T.gold:T.muted,marginBottom:4,transition:"all 0.3s" }}>
              {i<step?"✓":i+1}
            </div>
            <div style={{ fontSize:10,color:i===step?T.gold:T.muted,fontFamily:T.mono,letterSpacing:"0.06em",whiteSpace:"nowrap" }}>{s.toUpperCase()}</div>
          </div>
          {i<steps.length-1&&<div style={{ height:2,flex:1,background:i<step?T.gold:T.border,marginBottom:18,transition:"background 0.3s" }} />}
        </div>
      ))}
    </div>
  );
};

// ============================================================
// STEP 1: ASSET TYPE SELECTOR
// ============================================================
const AssetTypeStep = ({ selected, onSelect, onNext }) => (
  <div>
    <div style={{ marginBottom:22 }}>
      <h2 style={{ fontFamily:T.serif,fontSize:26,fontWeight:700,margin:"0 0 6px" }}>What type of asset is this?</h2>
      <p style={{ color:T.muted,fontSize:13,margin:0 }}>FinSniff applies asset-specific benchmarks, OER ranges, and cap rate expectations based on your selection.</p>
    </div>
    <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:22 }}>
      {ASSET_TYPES.map(a=>(
        <div key={a.id} onClick={()=>onSelect(a.id)}
          style={{ background:selected===a.id?T.gold+"18":T.surface2,border:`2px solid ${selected===a.id?T.gold:T.border}`,borderRadius:10,padding:"14px 10px",textAlign:"center",cursor:"pointer",transition:"all 0.18s" }}>
          <div style={{ fontSize:24,marginBottom:6 }}>{a.icon}</div>
          <div style={{ fontSize:11,fontWeight:600,color:selected===a.id?T.gold:T.text,lineHeight:1.3,marginBottom:4 }}>{a.label}</div>
          <div style={{ fontSize:9,color:T.muted,fontFamily:T.mono,lineHeight:1.4 }}>{a.benchmarks}</div>
        </div>
      ))}
    </div>
    <Btn onClick={onNext} disabled={!selected} variant="gold" size="lg" style={{ width:"100%" }}>Continue →</Btn>
  </div>
);

// ============================================================
// STEP 2: INTERACTIVE INTAKE CHAT
// ============================================================
const IntakeChat = ({ assetType, onComplete, onBack }) => {
  const asset = ASSET_TYPES.find(a=>a.id===assetType);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState("");
  const bottomRef = useRef();

  const scroll = () => setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),50);

  useEffect(()=>{
    const opener = { role:"assistant", text:`I'll be guiding you through a quick intake for this ${asset?.label} deal. Tell me what you know about the property — the asking price, what the owner is claiming for income, and anything that's already caught your attention.` };
    setMessages([opener]);
  },[]);

  useEffect(()=>scroll(),[messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role:"user", text:input };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = history.map(m=>({ role:m.role==="assistant"?"assistant":"user", content:m.text }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:INTAKE_SYSTEM, messages:apiMessages })
      });
      const data = await res.json();
      const raw = data.content.map(i=>i.text||"").join("").trim();

      // Check if AI signals ready
      const jsonMatch = raw.match(/\{"action":"ready".*?\}/s);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          setSummary(parsed.summary);
          setReady(true);
          const visibleText = raw.replace(jsonMatch[0],"").trim() || "Got it — I have everything I need. Upload your documents and I'll sniff this deal.";
          setMessages(prev=>[...prev,{ role:"assistant", text:visibleText }]);
        } catch(e) {
          setMessages(prev=>[...prev,{ role:"assistant", text:raw }]);
        }
      } else {
        setMessages(prev=>[...prev,{ role:"assistant", text:raw }]);
      }
    } catch(e) {
      setMessages(prev=>[...prev,{ role:"assistant", text:"Something went wrong. Please try again." }]);
    }
    setLoading(false);
  };

  const handleKey = e => { if (e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage(); }};

  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <h2 style={{ fontFamily:T.serif,fontSize:26,fontWeight:700,margin:"0 0 4px" }}>Tell me about this deal</h2>
        <p style={{ color:T.muted,fontSize:13,margin:0 }}>Share what you know. The more context you give, the sharper the analysis. Tell FinSniff when you're ready to upload.</p>
      </div>

      {/* Asset badge */}
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
        <Badge color={T.gold}>{asset?.icon} {asset?.label}</Badge>
        <Badge color={T.muted} size={11}>{asset?.benchmarks}</Badge>
      </div>

      {/* Chat window */}
      <div style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,height:340,overflowY:"auto",padding:16,marginBottom:12,display:"flex",flexDirection:"column",gap:12 }}>
        {messages.map((m,i)=>(
          <div key={i} style={{ display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            {m.role==="assistant"&&<div style={{ width:28,height:28,borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginRight:10,marginTop:2 }}>🐾</div>}
            <div style={{ maxWidth:"75%",background:m.role==="user"?T.accent+"22":T.surface3,border:`1px solid ${m.role==="user"?T.accent+"40":T.border}`,borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"10px 14px",fontSize:13,color:T.text,lineHeight:1.6 }}>
              {m.text}
            </div>
            {m.role==="user"&&<div style={{ width:28,height:28,borderRadius:"50%",background:T.surface3,border:`1px solid ${T.border2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginLeft:10,marginTop:2 }}>👤</div>}
          </div>
        ))}
        {loading&&(
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>🐾</div>
            <div style={{ background:T.surface3,border:`1px solid ${T.border}`,borderRadius:"12px 12px 12px 4px",padding:"10px 14px" }}>
              <style>{`@keyframes blink{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
              <div style={{ display:"flex",gap:4 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:T.muted,animation:`blink 1.2s ease ${i*0.2}s infinite` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Ready banner */}
      {ready && (
        <div style={{ background:"#051a10",border:`1px solid ${T.green}40`,borderRadius:8,padding:"12px 16px",marginBottom:12 }}>
          <div style={{ fontSize:12,fontWeight:600,color:T.green,marginBottom:4 }}>✅ Intake complete — context locked in</div>
          <div style={{ fontSize:12,color:T.muted,lineHeight:1.6 }}>{summary}</div>
        </div>
      )}

      {/* Input */}
      <div style={{ display:"flex",gap:10 }}>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} placeholder={ready?"Add anything else, or click Continue to upload documents...":"Type your response... (Enter to send)"}
          disabled={loading}
          style={{ flex:1,background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:8,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:T.sans,outline:"none",resize:"none",height:52,boxSizing:"border-box" }} />
        <Btn onClick={sendMessage} disabled={!input.trim()||loading} variant="gold" size="sm" style={{ alignSelf:"flex-end",height:52,padding:"0 16px" }}>Send</Btn>
      </div>

      <div style={{ display:"flex",justifyContent:"space-between",marginTop:14 }}>
        <Btn onClick={onBack} variant="ghost" size="sm">← Back</Btn>
        <Btn onClick={()=>onComplete(summary||messages.filter(m=>m.role==="user").map(m=>m.text).join(" | "))} variant="gold" size="sm" style={{ opacity:messages.length>1?1:0.4 }}>
          {ready?"Continue to Upload →":"Skip & Upload Documents →"}
        </Btn>
      </div>
    </div>
  );
};

// ============================================================
// STEP 3: DOCUMENT UPLOAD
// ============================================================
const UploadZone = ({ label, accept, files, onFiles, icon, hint }) => {
  const [drag,setDrag]=useState(false);
  const ref=useRef();
  const handleDrop = e => { e.preventDefault(); setDrag(false); onFiles(p=>[...p,...Array.from(e.dataTransfer.files)].slice(0,10)); };
  return (
    <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={handleDrop}
      style={{ border:`2px dashed ${drag?T.accent:T.border2}`,borderRadius:9,padding:"14px 12px",textAlign:"center",cursor:"pointer",transition:"all 0.2s",background:drag?T.accentGlow:T.surface2 }}
      onClick={()=>ref.current.click()}>
      <input ref={ref} type="file" multiple accept={accept.join(",")} style={{ display:"none" }} onChange={e=>onFiles(p=>[...p,...Array.from(e.target.files)].slice(0,10))} />
      <div style={{ fontSize:22,marginBottom:5 }}>{icon}</div>
      <div style={{ fontSize:12,fontWeight:500,color:T.text,marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:10,color:T.muted,fontFamily:T.mono,marginBottom:hint?4:0 }}>{accept.join(" · ")}</div>
      {hint&&<div style={{ fontSize:10,color:T.muted2,fontFamily:T.mono }}>{hint}</div>}
      {files.length>0&&(
        <div style={{ marginTop:8,display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center" }}>
          {files.map((f,i)=>(
            <span key={i} onClick={e=>{e.stopPropagation();onFiles(p=>p.filter((_,j)=>j!==i));}}
              style={{ display:"inline-flex",alignItems:"center",gap:4,background:T.green+"20",color:T.green,border:`1px solid ${T.green}40`,borderRadius:4,padding:"2px 8px",fontSize:10,fontFamily:T.mono,cursor:"pointer" }}>
              ✓ {f.name} ✕
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const DocumentStep = ({ assetType, intakeSummary, onAnalyze, onBack, loading, progress, error }) => {
  const [t12Files,setT12Files]=useState([]);
  const [bankFiles,setBankFiles]=useState([]);
  const [otherFiles,setOtherFiles]=useState([]);
  const asset = ASSET_TYPES.find(a=>a.id===assetType);
  const totalFiles = t12Files.length+bankFiles.length+otherFiles.length;

  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <h2 style={{ fontFamily:T.serif,fontSize:26,fontWeight:700,margin:"0 0 4px" }}>Upload Your Documents</h2>
        <p style={{ color:T.muted,fontSize:13,margin:0 }}>Upload up to 10 files total. Mix and match across categories — FinSniff figures out what each one is.</p>
      </div>

      <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
        <Badge color={T.gold}>{asset?.icon} {asset?.label}</Badge>
        {intakeSummary&&<Badge color={T.green} size={10}>✓ Intake context loaded</Badge>}
        <Badge color={totalFiles>0?T.accent:T.muted} size={10}>{totalFiles}/10 files</Badge>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14 }}>
        <UploadZone label="T12 / P&L Statements" icon="📊" hint="Annual or monthly P&L" accept={[".xlsx",".xls",".csv",".pdf",".txt"]} files={t12Files} onFiles={setT12Files} />
        <UploadZone label="Bank Statements" icon="🏦" hint="12 months preferred" accept={[".pdf",".xlsx",".csv",".txt"]} files={bankFiles} onFiles={setBankFiles} />
        <UploadZone label="Rent Roll / Other" icon="📋" hint="Rent roll, leases, tax returns, notes" accept={[".xlsx",".xls",".csv",".pdf",".txt"]} files={otherFiles} onFiles={setOtherFiles} />
      </div>

      <Card style={{ marginBottom:14, background:"#0a0e05",border:`1px solid ${T.gold}25` }}>
        <div style={{ fontSize:11,color:T.gold,fontFamily:T.mono,marginBottom:4 }}>🎯 ACCURACY TIP</div>
        <div style={{ fontSize:12,color:T.muted,lineHeight:1.6 }}>
          Bank statements + T12 + rent roll = maximum confidence score. The more documents you upload now, the fewer additions you'll need later. You still have <strong style={{ color:T.gold }}>free document additions</strong> after the report is generated if something was missed.
        </div>
      </Card>

      {error&&<div style={{ background:"#1a0505",border:`1px solid ${T.red}40`,borderRadius:8,padding:"11px 14px",color:T.red,fontSize:13,marginBottom:14 }}>{error}</div>}

      {loading&&(
        <div style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"22px",textAlign:"center",marginBottom:14 }}>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
          <div style={{ fontSize:30,marginBottom:10,animation:"pulse 1.5s ease infinite" }}>🐾</div>
          <div style={{ fontFamily:T.mono,fontSize:12,color:T.muted }}>{progress}</div>
        </div>
      )}

      <div style={{ display:"flex",justifyContent:"space-between",gap:10 }}>
        <Btn onClick={onBack} variant="ghost" size="sm">← Back</Btn>
        <Btn onClick={()=>onAnalyze(t12Files,bankFiles,otherFiles)} disabled={totalFiles===0||loading} variant="gold" size="lg" style={{ flex:1 }}>
          🐾 Run FinSniff Analysis →
        </Btn>
      </div>
      <p style={{ textAlign:"center",marginTop:8,fontSize:10,color:T.muted2,fontFamily:T.mono }}>Excel · CSV · PDF · Text · Up to 10 files · 20–60 seconds · Not investment advice</p>
    </div>
  );
};

// ============================================================
// REPORT COMPONENTS
// ============================================================
const RiskMeter = ({ score }) => {
  const color = score<=3?T.green:score<=6?T.gold:T.red;
  const label = score<=3?"Low Risk":score<=6?"Moderate Risk":score<=8?"High Risk":"Critical Risk";
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
        <Label>DEAL RISK SCORE</Label><Badge color={color}>{score}/10 — {label}</Badge>
      </div>
      <div style={{ height:6,background:T.surface3,borderRadius:99,overflow:"hidden" }}>
        <div style={{ width:`${score*10}%`,height:"100%",background:`linear-gradient(90deg,${T.green},${color})`,borderRadius:99,transition:"width 1.4s ease" }} />
      </div>
    </div>
  );
};

const VerdictBanner = ({ verdict, rationale }) => {
  const cfg = { "STRONG DEAL":{color:T.green,icon:"✅",bg:"#051a10"},"PROCEED WITH CAUTION":{color:T.gold,icon:"⚠️",bg:"#1a1000"},"WALK AWAY":{color:T.red,icon:"🚫",bg:"#1a0505"},"NEEDS MORE INFO":{color:T.accent,icon:"🔍",bg:"#05101a"} };
  const c = cfg[verdict]||cfg["NEEDS MORE INFO"];
  return (
    <div style={{ background:c.bg,border:`1px solid ${c.color}40`,borderLeft:`4px solid ${c.color}`,borderRadius:10,padding:"16px 20px",marginBottom:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:5 }}><span style={{ fontSize:18 }}>{c.icon}</span><span style={{ fontFamily:T.serif,fontSize:20,fontWeight:700,color:c.color }}>{verdict}</span></div>
      <p style={{ color:T.text,fontSize:13,lineHeight:1.7,margin:0 }}>{rationale}</p>
    </div>
  );
};

const DataQuality = ({ score, note, missing }) => {
  const color = score>=8?T.green:score>=5?T.gold:T.red;
  return (
    <div style={{ background:color+"10",border:`1px solid ${color}40`,borderRadius:10,padding:"14px 18px",marginBottom:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap" }}>
        <span style={{ fontSize:16 }}>{score>=8?"🎯":score>=5?"⚠️":"🔴"}</span>
        <Badge color={color}>Data Quality: {score}/10</Badge>
        <span style={{ fontSize:13,fontWeight:600,color }}>{score>=8?"High Confidence":score>=5?"Moderate Confidence":"Low Confidence"}</span>
      </div>
      <p style={{ color:T.muted,fontSize:12,lineHeight:1.6,margin:0 }}>{note}</p>
      {missing?.length>0&&<div style={{ marginTop:8,display:"flex",flexWrap:"wrap",gap:5 }}>{missing.map((m,i)=><Badge key={i} color={T.orange} size={10}>+ {m}</Badge>)}</div>}
    </div>
  );
};

const MetricGrid = ({ metrics }) => {
  const fc = { green:T.green,yellow:T.gold,red:T.red,neutral:T.muted };
  return (
    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14 }}>
      {metrics?.map((m,i)=>(
        <div key={i} style={{ background:T.surface2,border:`1px solid ${m.low_confidence?T.red+"40":T.border}`,borderRadius:8,padding:"11px 13px" }}>
          <Label>{m.label}{m.low_confidence&&<LowConf />}</Label>
          <div style={{ fontFamily:T.mono,fontSize:15,fontWeight:500,color:fc[m.flag]||T.text }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
};

const IncomeSection = ({ data }) => {
  if (!data) return null;
  const gapColor = !data.revenueGapPct?T.muted:Math.abs(data.revenueGapPct)<0.05?T.green:Math.abs(data.revenueGapPct)<0.15?T.gold:T.red;
  const oerColor = data.oerVsBenchmark==="WITHIN RANGE"?T.green:data.oerVsBenchmark==="ABOVE BENCHMARK"?T.red:T.gold;
  return (
    <Card style={{ marginBottom:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
        <Label style={{ margin:0 }}>💰 TRUE NOI — OWNER CLAIMED VS. BANK VERIFIED</Label>
        {data.low_confidence&&<LowConf />}
        {data.oerVsBenchmark&&data.oerVsBenchmark!=="INSUFFICIENT DATA"&&<Badge color={oerColor} size={10}>OER: {data.oerVsBenchmark}</Badge>}
      </div>
      {data.confidenceNote&&<div style={{ background:T.red+"12",border:`1px solid ${T.red}30`,borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12,color:T.red,fontFamily:T.mono }}>{data.confidenceNote}</div>}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14 }}>
        {[
          {label:"Owner Claimed Revenue",value:fmt(data.ownerClaimedRevenue),color:T.muted,lc:false},
          {label:"Bank Verified Revenue",value:fmt(data.bankVerifiedRevenue),color:T.text,lc:false},
          {label:"Revenue Gap",value:`${fmt(data.revenueGap)} (${fmtPct(data.revenueGapPct)})`,color:gapColor,lc:data.low_confidence},
          {label:"Owner Claimed NOI",value:fmt(data.ownerClaimedNOI),color:T.muted,lc:false},
          {label:"True NOI (Verified)",value:fmt(data.trueNOI),color:T.green,lc:data.low_confidence},
          {label:"Normalized EBITDA",value:fmt(data.normalizedEBITDA),color:T.accent,lc:data.low_confidence},
        ].map((item,i)=>(
          <div key={i} style={{ background:T.surface2,border:`1px solid ${item.lc?T.red+"40":T.border}`,borderRadius:8,padding:"11px 13px" }}>
            <Label>{item.label}{item.lc&&<LowConf />}</Label>
            <div style={{ fontFamily:T.mono,fontSize:14,fontWeight:500,color:item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
      {data.revenueSources?.length>0&&(
        <>
          <Label>REVENUE BY SOURCE</Label>
          {data.revenueSources.map((s,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<data.revenueSources.length-1?`1px solid ${T.border}`:"none" }}>
              <div style={{ flex:1,fontSize:12,color:T.text }}>{s.source}{s.low_confidence&&<LowConf />}</div>
              <div style={{ fontFamily:T.mono,fontSize:12,color:T.text,width:85,textAlign:"right" }}>{fmt(s.amount)}</div>
              <div style={{ width:60 }}><div style={{ height:3,background:T.surface3,borderRadius:99,overflow:"hidden" }}><div style={{ width:`${((s.pct||0)*100).toFixed(0)}%`,height:"100%",background:s.verified?T.green:T.gold,borderRadius:99 }} /></div></div>
              <Badge color={s.verified?T.green:T.gold} size={10}>{s.verified?"VERIFIED":"UNVERIFIED"}</Badge>
            </div>
          ))}
        </>
      )}
    </Card>
  );
};

const RedFlags = ({ flags }) => {
  const sc = { CRITICAL:T.red,HIGH:T.orange,MEDIUM:T.gold,LOW:T.muted };
  const sb = { CRITICAL:"#1a0505",HIGH:"#140a00",MEDIUM:"#1a1000",LOW:T.surface2 };
  return (
    <Card style={{ marginBottom:14,background:"#0d0a0a",border:`1px solid ${T.red}20` }}>
      <Label>🚩 RED FLAGS ({flags?.length||0})</Label>
      <div style={{ marginTop:10,display:"flex",flexDirection:"column",gap:8 }}>
        {flags?.map((f,i)=>(
          <div key={i} style={{ background:sb[f.severity],border:`1px solid ${sc[f.severity]}30`,borderLeft:`3px solid ${sc[f.severity]}`,borderRadius:8,padding:"10px 14px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,gap:8,flexWrap:"wrap" }}>
              <span style={{ fontWeight:600,color:T.text,fontSize:12 }}>{f.title}{f.low_confidence&&<LowConf />}</span>
              <div style={{ display:"flex",gap:5 }}><Badge color={sc[f.severity]} size={10}>{f.severity}</Badge><Badge color={T.muted} size={10}>{f.category}</Badge></div>
            </div>
            <div style={{ color:"#b0b8cc",fontSize:12,lineHeight:1.6 }}>{f.detail}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const NegotiationPoints = ({ points }) => {
  if (!points?.length) return null;
  const lc = { STRONG:T.green,MODERATE:T.gold,MINOR:T.muted };
  return (
    <Card style={{ marginBottom:14,background:"#050d05",border:`1px solid ${T.green}20` }}>
      <Label>🤝 NEGOTIATION TALKING POINTS</Label>
      <div style={{ marginTop:10,display:"flex",flexDirection:"column",gap:8 }}>
        {points.map((p,i)=>(
          <div key={i} style={{ background:T.surface2,border:`1px solid ${lc[p.leverage]}30`,borderLeft:`3px solid ${lc[p.leverage]}`,borderRadius:8,padding:"10px 14px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4,flexWrap:"wrap",gap:8 }}>
              <span style={{ fontWeight:600,color:T.text,fontSize:12 }}>{p.point}</span>
              <Badge color={lc[p.leverage]} size={10}>{p.leverage} LEVERAGE</Badge>
            </div>
            <div style={{ fontSize:12,color:"#7dd3a8",marginBottom:3 }}>💬 {p.suggestedAction}</div>
            <div style={{ fontSize:10,color:T.muted,fontFamily:T.mono }}>Based on: {p.basedOnFlag}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const SBAFlag = ({ data }) => {
  if (!data) return null;
  const color = data.score==="LIKELY ELIGIBLE"?T.green:data.score==="POSSIBLE"?T.gold:data.score==="UNLIKELY"?T.red:T.muted;
  return (
    <Card style={{ marginBottom:14,background:"#050d1a",border:`1px solid ${color}30` }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
        <span style={{ fontSize:18 }}>🏛️</span><Label style={{ margin:0 }}>SBA LOAN FEASIBILITY</Label><Badge color={color}>{data.score}</Badge>{data.low_confidence&&<LowConf />}
      </div>
      <p style={{ color:T.text,fontSize:13,lineHeight:1.6,marginBottom:8 }}>{data.rationale}</p>
      {data.keyIssues?.map((issue,i)=><div key={i} style={{ display:"flex",gap:8,marginBottom:4 }}><span style={{ color:T.orange,fontSize:11,flexShrink:0 }}>→</span><span style={{ fontSize:12,color:"#b0bcd4",lineHeight:1.5 }}>{issue}</span></div>)}
    </Card>
  );
};

const DDChecklist = ({ items }) => {
  const [checked,setChecked]=useState({});
  const pc = { CRITICAL:T.red,HIGH:T.orange,MEDIUM:T.gold };
  const done = Object.values(checked).filter(Boolean).length;
  return (
    <Card style={{ marginBottom:14 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <Label style={{ margin:0 }}>✅ DUE DILIGENCE CHECKLIST</Label>
        <span style={{ fontSize:10,fontFamily:T.mono,color:T.muted }}>{done}/{items?.length||0} done</span>
      </div>
      {items?.map((item,i)=>(
        <div key={i} onClick={()=>setChecked(p=>({...p,[i]:!p[i]}))}
          style={{ display:"flex",gap:10,alignItems:"flex-start",padding:"9px 10px",background:checked[i]?T.surface2:T.surface3,border:`1px solid ${checked[i]?T.border:pc[item.priority]+"30"}`,borderRadius:7,cursor:"pointer",opacity:checked[i]?0.5:1,transition:"all 0.15s",marginBottom:5 }}>
          <div style={{ width:15,height:15,borderRadius:3,border:`2px solid ${checked[i]?T.green:pc[item.priority]}`,background:checked[i]?T.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1 }}>
            {checked[i]&&<span style={{ color:"#000",fontSize:9,fontWeight:700 }}>✓</span>}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex",gap:5,alignItems:"center",marginBottom:2,flexWrap:"wrap" }}>
              <Badge color={pc[item.priority]} size={9}>{item.priority}</Badge>
              <span style={{ fontSize:12,fontWeight:500,color:T.text,textDecoration:checked[i]?"line-through":"none" }}>{item.item}</span>
            </div>
            <div style={{ fontSize:11,color:T.muted,lineHeight:1.5 }}>{item.finding}</div>
          </div>
        </div>
      ))}
    </Card>
  );
};

const MonthlyTrend = ({ data }) => {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d=>Math.max(d.ownerClaimed||0,d.bankVerified||0)),1);
  return (
    <Card style={{ marginBottom:14 }}>
      <Label>📊 MONTHLY TREND — CLAIMED VS. VERIFIED</Label>
      <div style={{ display:"flex",gap:3,alignItems:"flex-end",height:90,marginTop:14,paddingBottom:6,borderBottom:`1px solid ${T.border}` }}>
        {data.map((d,i)=>(
          <div key={i} style={{ flex:1,display:"flex",gap:2,alignItems:"flex-end" }}>
            <div style={{ flex:1,background:T.muted2,borderRadius:"3px 3px 0 0",height:`${((d.ownerClaimed||0)/max)*100}%`,minHeight:2 }} />
            <div style={{ flex:1,background:T.accent,borderRadius:"3px 3px 0 0",height:`${((d.bankVerified||0)/max)*100}%`,minHeight:2 }} />
          </div>
        ))}
      </div>
      <div style={{ display:"flex",gap:3,marginTop:5 }}>{data.map((d,i)=><div key={i} style={{ flex:1,fontSize:9,color:T.muted,textAlign:"center",fontFamily:T.mono }}>{d.month?.slice(0,3)}</div>)}</div>
      <div style={{ display:"flex",gap:12,marginTop:8 }}>
        <div style={{ display:"flex",alignItems:"center",gap:5 }}><div style={{ width:8,height:8,background:T.muted2,borderRadius:2 }} /><span style={{ fontSize:10,color:T.muted,fontFamily:T.mono }}>Owner Claimed</span></div>
        <div style={{ display:"flex",alignItems:"center",gap:5 }}><div style={{ width:8,height:8,background:T.accent,borderRadius:2 }} /><span style={{ fontSize:10,color:T.muted,fontFamily:T.mono }}>Bank Verified</span></div>
      </div>
    </Card>
  );
};

// ============================================================
// SHARE MODAL
// ============================================================
const ShareModal = ({ onClose }) => {
  const link = `https://finsniff.app/r/${Math.random().toString(36).slice(2,10)}`;
  const [copied,setCopied]=useState(false);
  const copy = () => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:24 }}>
      <Card style={{ maxWidth:440,width:"100%",boxShadow:`0 0 60px ${T.goldGlow}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:14 }}>
          <div style={{ fontFamily:T.serif,fontSize:18,fontWeight:700 }}>Share Report</div>
          <Btn variant="ghost" size="sm" onClick={onClose}>✕</Btn>
        </div>
        <p style={{ color:T.muted,fontSize:13,marginBottom:14 }}>Share this report with your lender, partner, or broker. No FinSniff account required to view.</p>
        <div style={{ background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:7,padding:"9px 13px",fontFamily:T.mono,fontSize:11,color:T.text,marginBottom:12,wordBreak:"break-all" }}>{link}</div>
        <div style={{ display:"flex",gap:10 }}>
          <Btn onClick={copy} variant="gold" style={{ flex:1 }}>{copied?"✓ Copied!":"Copy Link"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
        <p style={{ fontSize:10,color:T.muted2,fontFamily:T.mono,marginTop:10 }}>Link expires in 30 days. Read-only for viewers.</p>
      </Card>
    </div>
  );
};

// ============================================================
// ADD DOCUMENTS PANEL
// ============================================================
const AddDocPanel = ({ onSubmit, onCancel, additionsLeft }) => {
  const [files,setFiles]=useState([]);
  const [notes,setNotes]=useState("");
  return (
    <Card style={{ marginBottom:14,border:`1px solid ${T.gold}40`,boxShadow:`0 0 30px ${T.goldGlow}` }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
        <div style={{ fontFamily:T.serif,fontSize:17,fontWeight:700 }}>Add More Documents</div>
        <Badge color={T.gold}>{typeof additionsLeft==="number"?`${additionsLeft} free left`:"Unlimited"}</Badge>
      </div>
      <p style={{ color:T.muted,fontSize:12,marginBottom:12 }}>Upload additional statements or corrections. Your report updates with new findings merged in.</p>
      <UploadZone label="Additional documents" icon="📎" accept={[".xlsx",".xls",".csv",".pdf",".txt"]} files={files} onFiles={setFiles} />
      <div style={{ marginTop:10 }}>
        <Label>CONTEXT FOR THIS UPDATE (OPTIONAL)</Label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. 'Owner confirmed second account — statements attached'"
          style={{ width:"100%",minHeight:60,background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:6,padding:"9px 12px",color:T.text,fontSize:12,fontFamily:T.sans,outline:"none",resize:"none",boxSizing:"border-box",marginTop:4 }} />
      </div>
      <div style={{ display:"flex",gap:10,marginTop:12 }}>
        <Btn onClick={()=>onSubmit(files,notes)} disabled={!files.length} variant="gold">🔄 Update Report →</Btn>
        <Btn onClick={onCancel} variant="ghost">Cancel</Btn>
      </div>
    </Card>
  );
};

// ============================================================
// DEAL COMPARISON
// ============================================================
const DealComparison = ({ deals, onClose }) => {
  if (!deals||deals.length<2) return null;
  const [a,b] = deals;
  const compare = (va, vb, higherIsBetter=true) => {
    if (va==null||vb==null) return { a:"neutral",b:"neutral" };
    if (va===vb) return { a:"neutral",b:"neutral" };
    const aWins = higherIsBetter?va>vb:va<vb;
    return aWins?{ a:"green",b:"red" }:{ a:"red",b:"green" };
  };
  const rows = [
    { label:"Deal Risk Score",     va:a.dealRiskScore,             vb:b.dealRiskScore,             fmt:v=>v+"/10",    higherBetter:false },
    { label:"True NOI",            va:a.incomeAnalysis?.trueNOI,   vb:b.incomeAnalysis?.trueNOI,   fmt:fmt,           higherBetter:true  },
    { label:"Revenue Gap %",       va:a.incomeAnalysis?.revenueGapPct, vb:b.incomeAnalysis?.revenueGapPct, fmt:fmtPct, higherBetter:false },
    { label:"Data Quality Score",  va:a.dataQualityScore,          vb:b.dataQualityScore,          fmt:v=>v+"/10",    higherBetter:true  },
    { label:"Red Flags",           va:a.redFlags?.length,          vb:b.redFlags?.length,          fmt:v=>v+" flags", higherBetter:false },
    { label:"Implied Value (True NOI)", va:a.valuation?.impliedValueAtTrueNOI, vb:b.valuation?.impliedValueAtTrueNOI, fmt:fmt, higherBetter:true },
  ];
  const fc = { green:T.green, red:T.red, neutral:T.muted };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:24,overflowY:"auto" }}>
      <div style={{ width:"100%",maxWidth:700 }}>
        <Card style={{ boxShadow:`0 0 60px ${T.accentGlow}` }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
            <div style={{ fontFamily:T.serif,fontSize:20,fontWeight:700 }}>Deal Comparison</div>
            <Btn variant="ghost" size="sm" onClick={onClose}>✕ Close</Btn>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14 }}>
            <div />
            {[a,b].map((d,i)=>(
              <div key={i} style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",textAlign:"center" }}>
                <div style={{ fontFamily:T.serif,fontSize:14,fontWeight:700,marginBottom:4 }}>{d.propertyName}</div>
                <Badge color={T.accent} size={10}>{d.propertyType}</Badge>
              </div>
            ))}
          </div>
          {rows.map((row,i)=>{
            const c = compare(row.va,row.vb,row.higherBetter);
            return (
              <div key={i} style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:6 }}>
                <div style={{ display:"flex",alignItems:"center",fontSize:12,color:T.muted,fontFamily:T.mono }}>{row.label}</div>
                {[{v:row.va,c:c.a},{v:row.vb,c:c.b}].map((item,j)=>(
                  <div key={j} style={{ background:item.c==="green"?T.green+"12":item.c==="red"?T.red+"12":T.surface2,border:`1px solid ${item.c==="green"?T.green+"40":item.c==="red"?T.red+"40":T.border}`,borderRadius:7,padding:"8px 12px",textAlign:"center" }}>
                    <span style={{ fontFamily:T.mono,fontSize:13,fontWeight:600,color:fc[item.c] }}>{item.v!=null?row.fmt(item.v):"—"}</span>
                  </div>
                ))}
              </div>
            );
          })}
          <Divider />
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
            <div style={{ fontSize:12,color:T.muted,fontFamily:T.mono,display:"flex",alignItems:"center" }}>Overall Verdict</div>
            {[a,b].map((d,i)=>{
              const vc = { "STRONG DEAL":T.green,"PROCEED WITH CAUTION":T.gold,"WALK AWAY":T.red,"NEEDS MORE INFO":T.muted };
              return <div key={i} style={{ background:T.surface2,border:`1px solid ${(vc[d.verdict]||T.muted)+"40"}`,borderRadius:7,padding:"8px 12px",textAlign:"center" }}><Badge color={vc[d.verdict]||T.muted} size={10}>{d.verdict}</Badge></div>;
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// FULL REPORT VIEW
// ============================================================
const ReportView = ({ result, planId, onAddDocs, additionsUsed, onShare, onNewDeal, savedDeals, onCompare }) => {
  const plan = PLANS[planId]||PLANS.single;
  const addLeft = plan.unlimitedAdditions?"∞":Math.max(0,plan.freeAdditions-additionsUsed);
  const canAdd = plan.unlimitedAdditions||additionsUsed<plan.freeAdditions;
  const canCompare = plan.dealComparison && savedDeals?.length>0;

  return (
    <div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10 }}>
        <div>
          <Label>FINSNIFF REPORT v{additionsUsed+1}.0</Label>
          <h2 style={{ fontFamily:T.serif,fontSize:24,fontWeight:700,margin:"0 0 8px" }}>{result.propertyName}</h2>
          <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
            <Badge color={T.accent}>{result.propertyType}</Badge>
            {result.intakeContextApplied&&<Badge color={T.green} size={10}>✓ Intake context applied</Badge>}
          </div>
        </div>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {canCompare&&<Btn onClick={onCompare} variant="outline" size="sm">⚖️ Compare Deals</Btn>}
          <Btn onClick={onShare} variant="ghost" size="sm">🔗 Share</Btn>
          <Btn onClick={()=>window.print()} variant="ghost" size="sm">🖨️ PDF</Btn>
          {canAdd&&<Btn onClick={onAddDocs} variant="gold" size="sm">➕ Add Docs ({typeof addLeft==="number"?`${addLeft} left`:"∞"})</Btn>}
        </div>
      </div>

      <DataQuality score={result.dataQualityScore} note={result.dataQualityNote} missing={result.missingDocuments} />

      <Card style={{ marginBottom:14,animation:"fadeUp 0.3s ease" }}>
        <RiskMeter score={result.dealRiskScore} />
        <p style={{ color:"#8a94a8",fontSize:13,lineHeight:1.6,margin:"10px 0 12px" }}>{result.dealRiskRationale}</p>
        <Divider />
        <p style={{ color:T.text,fontSize:14,lineHeight:1.7,margin:0 }}>{result.executiveSummary}</p>
        {result.intakeContextApplied&&(
          <div style={{ marginTop:12,background:T.surface2,border:`1px solid ${T.green}25`,borderRadius:8,padding:"10px 14px" }}>
            <Label style={{ marginBottom:3 }}>HOW YOUR INTAKE CONTEXT WAS APPLIED</Label>
            <p style={{ color:"#9ee6c0",fontSize:12,lineHeight:1.6,margin:0 }}>{result.intakeContextApplied}</p>
          </div>
        )}
      </Card>

      <VerdictBanner verdict={result.verdict} rationale={result.verdictRationale} />
      <SBAFlag data={result.sbaFeasibility} />
      {result.keyMetrics?.length>0&&<MetricGrid metrics={result.keyMetrics} />}
      <IncomeSection data={result.incomeAnalysis} />
      {result.redFlags?.length>0&&<RedFlags flags={result.redFlags} />}
      <NegotiationPoints points={result.negotiationPoints} />

      {result.valuation&&(
        <Card style={{ marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
            <Label style={{ margin:0 }}>🏷️ VALUATION</Label>{result.valuation.low_confidence&&<LowConf />}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12 }}>
            {[
              {label:"Assumed Cap Rate",value:result.valuation.assumedCapRate?(result.valuation.assumedCapRate*100).toFixed(1)+"%":"—",color:T.text},
              {label:"Value @ True NOI",value:fmt(result.valuation.impliedValueAtTrueNOI),color:T.green},
              {label:"Value @ Claimed NOI",value:fmt(result.valuation.impliedValueAtClaimedNOI),color:T.muted},
            ].map((m,i)=>(
              <div key={i} style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"11px 13px" }}>
                <Label>{m.label}</Label><div style={{ fontFamily:T.mono,fontSize:14,fontWeight:500,color:m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:7,padding:"10px 14px" }}>
            <Label>CAP RATE RANGE: {result.valuation.capRateRange||"—"}</Label>
            <div style={{ fontSize:12,color:T.muted,lineHeight:1.6 }}>{result.valuation.valuationNote}</div>
          </div>
        </Card>
      )}

      <MonthlyTrend data={result.monthlyTrend} />

      {result.expenseAddBacks?.length>0&&(
        <Card style={{ marginBottom:14 }}>
          <Label>➕ EXPENSE ADD-BACKS</Label>
          {result.expenseAddBacks.map((item,i)=>(
            <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:i<result.expenseAddBacks.length-1?`1px solid ${T.border}`:"none",gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12,fontWeight:500,color:T.text }}>{item.item}{item.low_confidence&&<LowConf />}</div>
                <div style={{ fontSize:11,color:T.muted,marginTop:1 }}>{item.reason}</div>
              </div>
              <div style={{ fontFamily:T.mono,fontSize:12,color:T.green,fontWeight:500 }}>+{fmt(item.amount)}</div>
            </div>
          ))}
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border2}` }}>
            <span style={{ fontWeight:600,fontSize:12 }}>Total Add-backs</span>
            <span style={{ fontFamily:T.mono,color:T.green,fontWeight:600 }}>{fmt(result.expenseAddBacks.reduce((a,b)=>a+(b.amount||0),0))}</span>
          </div>
        </Card>
      )}

      {result.debtAnalysis&&(
        <Card style={{ marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
            <Label style={{ margin:0 }}>🏦 DEBT SERVICE</Label>{result.debtAnalysis.low_confidence&&<LowConf />}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10 }}>
            {[
              {label:"Est. Annual Debt Service",value:fmt(result.debtAnalysis.estimatedDebtService)},
              {label:"DSCR",value:result.debtAnalysis.dscr?result.debtAnalysis.dscr.toFixed(2)+"x":"—"},
              {label:"DSCR Note",value:result.debtAnalysis.dscrNote},
            ].map((m,i)=>(
              <div key={i} style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 13px" }}>
                <Label>{m.label}</Label><div style={{ fontFamily:T.mono,fontSize:12,color:T.text }}>{m.value}</div>
              </div>
            ))}
          </div>
          <p style={{ color:T.muted,fontSize:12,lineHeight:1.6,margin:0 }}>{result.debtAnalysis.summary}</p>
        </Card>
      )}

      {result.strengthsFound?.length>0&&(
        <Card style={{ marginBottom:14,background:"#05140a",border:`1px solid ${T.green}20` }}>
          <Label>💪 STRENGTHS</Label>
          {result.strengthsFound.map((s,i)=>(
            <div key={i} style={{ display:"flex",gap:8,alignItems:"flex-start",marginBottom:6 }}>
              <span style={{ color:T.green,fontSize:12,flexShrink:0 }}>✓</span>
              <span style={{ fontSize:12,color:"#9ee6c0",lineHeight:1.5 }}>{s}</span>
            </div>
          ))}
        </Card>
      )}

      <DDChecklist items={result.ddChecklist} />

      <div style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:"11px 16px",textAlign:"center",marginBottom:14 }}>
        <p style={{ color:T.muted2,fontSize:10,fontFamily:T.mono,margin:0,lineHeight:1.7 }}>⚠️ FinSniff is a financial analysis and due diligence tool. Not investment advice. Always verify all figures independently with a CPA before making investment decisions.</p>
      </div>
    </div>
  );
};

// ============================================================
// MAIN ANALYZER (orchestrates all steps)
// ============================================================
const Analyzer = ({ planId }) => {
  const [step, setStep] = useState(0); // 0=asset, 1=intake, 2=upload, 3=result
  const [assetType, setAssetType] = useState(null);
  const [intakeSummary, setIntakeSummary] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [additionsUsed, setAdditionsUsed] = useState(0);
  const [showAddDocs, setShowAddDocs] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [savedDeals, setSavedDeals] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const plan = PLANS[planId]||PLANS.single;

  const readFile = file => new Promise((res,rej)=>{
    const reader = new FileReader();
    reader.onload = e=>res(e.target.result);
    reader.onerror = rej;
    if (file.type.includes("image")||file.name.endsWith(".pdf")) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });

  const runAnalysis = async (allFiles, addContext="", existing=null) => {
    setLoading(true); setError(null);
    try {
      setProgress("Reading documents...");
      const contents = await Promise.all(allFiles.map(async ({file,type})=>{
        const content = await readFile(file);
        return {type,name:file.name,content,isBase64:content.startsWith("data:")};
      }));

      const msgContent = [];
      const textContent = contents.filter(c=>!c.isBase64).map(c=>`=== ${c.type}: ${c.name} ===\n${c.content}`).join("\n\n");
      msgContent.push({ type:"text", text:`${textContent}\n\nAdditional context: ${addContext||"none"}` });

      for (const c of contents.filter(c=>c.isBase64)) {
        const mt = c.content.split(";")[0].split(":")[1];
        if (mt==="application/pdf") msgContent.push({ type:"document",source:{type:"base64",media_type:"application/pdf",data:c.content.split(",")[1]} });
        else if (mt?.startsWith("image/")) msgContent.push({ type:"image",source:{type:"base64",media_type:mt,data:c.content.split(",")[1]} });
      }

      setProgress("Analyzing financials — 20–40 seconds...");
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514",max_tokens:1000,system:buildAnalysisPrompt(assetType,intakeSummary,existing),messages:[{role:"user",content:msgContent}] })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const raw = data.content.map(i=>i.text||"").join("");
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setResult(parsed);
      setSavedDeals(prev=>[...prev.filter(d=>d.propertyName!==parsed.propertyName),parsed].slice(-2));
      setStep(3);
    } catch(e) {
      setError("Analysis failed: "+(e.message||"Check your files and try again."));
    }
    setLoading(false); setProgress("");
  };

  const handleUpload = (t12,bank,other) => {
    const all = [...t12.map(f=>({file:f,type:"T12/P&L"})),...bank.map(f=>({file:f,type:"Bank Statement"})),...other.map(f=>({file:f,type:"Supplemental"}))];
    runAnalysis(all);
  };

  const handleAddDocs = (files, notes) => {
    setShowAddDocs(false);
    setAdditionsUsed(n=>n+1);
    runAnalysis(files.map(f=>({file:f,type:"Supplemental"})), notes, result);
  };

  const addLeft = plan.unlimitedAdditions?"∞":Math.max(0,plan.freeAdditions-additionsUsed);

  return (
    <div>
      {showShare&&<ShareModal onClose={()=>setShowShare(false)} />}
      {showComparison&&savedDeals.length>=2&&<DealComparison deals={savedDeals} onClose={()=>setShowComparison(false)} />}

      <StepBar step={step} />

      {step===0&&<AssetTypeStep selected={assetType} onSelect={setAssetType} onNext={()=>setStep(1)} />}
      {step===1&&<IntakeChat assetType={assetType} onComplete={s=>{setIntakeSummary(s);setStep(2);}} onBack={()=>setStep(0)} />}
      {step===2&&<DocumentStep assetType={assetType} intakeSummary={intakeSummary} onAnalyze={handleUpload} onBack={()=>setStep(1)} loading={loading} progress={progress} error={error} />}
      {step===3&&result&&(
        <>
          {showAddDocs&&<AddDocPanel onSubmit={handleAddDocs} onCancel={()=>setShowAddDocs(false)} additionsLeft={addLeft} />}
          {loading&&(
            <div style={{ background:T.surface2,border:`1px solid ${T.border}`,borderRadius:9,padding:"22px",textAlign:"center",marginBottom:14 }}>
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
              <div style={{ fontSize:30,marginBottom:8,animation:"pulse 1.5s ease infinite" }}>🐾</div>
              <div style={{ fontFamily:T.mono,fontSize:12,color:T.muted }}>{progress}</div>
            </div>
          )}
          {!loading&&<ReportView result={result} planId={planId} onAddDocs={()=>setShowAddDocs(true)} additionsUsed={additionsUsed} onShare={()=>setShowShare(true)} onNewDeal={()=>{setStep(0);setResult(null);setAdditionsUsed(0);}} savedDeals={savedDeals} onCompare={()=>setShowComparison(true)} />}
          <Btn variant="ghost" onClick={()=>{setStep(0);setResult(null);setAdditionsUsed(0);setError(null);}} style={{ width:"100%",marginTop:8 }}>← New Analysis</Btn>
        </>
      )}
    </div>
  );
};

// ============================================================
// LANDING
// ============================================================
const Landing = ({ setPage }) => {
  const features = [
    {icon:"🐾",title:"Interactive Intake Chat",desc:"FinSniff asks smart questions about the deal before analysis. Your suspicions become targeted red flags."},
    {icon:"🏦",title:"Bank Statement Verification",desc:"Cross-references every deposit against the P&L to expose inflated or fabricated revenue."},
    {icon:"⚠️",title:"Low-Confidence Flagging",desc:"Every number that can't be directly verified is flagged in red. No invented figures — ever."},
    {icon:"🤝",title:"Negotiation Talking Points",desc:"Turns red flags into specific leverage with suggested negotiation actions."},
    {icon:"🏛️",title:"SBA Loan Feasibility",desc:"Flags eligibility based on verified NOI and DSCR — asset-type specific."},
    {icon:"➕",title:"Living Deal File",desc:"Add documents after the report. Each addition refines the analysis. 2 free additions on every single report."},
  ];

  return (
    <div style={{ background:T.bg,minHeight:"100vh",color:T.text,fontFamily:T.sans }}>
      <div style={{ maxWidth:800,margin:"0 auto",textAlign:"center",padding:"120px 32px 72px" }}>
        <Badge color={T.gold}>🐾 AI Due Diligence for Messy Books</Badge>
        <h1 style={{ fontFamily:T.serif,fontSize:58,fontWeight:700,lineHeight:1.0,letterSpacing:"-0.025em",margin:"20px 0 16px" }}>
          When the books are a mess —<br /><em style={{ color:T.gold }}>FinSniff finds the truth.</em>
        </h1>
        <p style={{ color:T.muted,fontSize:16,lineHeight:1.7,maxWidth:540,margin:"0 auto 28px" }}>
          Purpose-built for mom & pop RV parks, MHPs, self storage, and small commercial deals. Upload the seller's financials. FinSniff cross-references everything and tells you what the deal actually makes.
        </p>
        <div style={{ display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap" }}>
          <Btn onClick={()=>setPage("auth")} variant="gold" size="lg">Sniff Your First Deal →</Btn>
          <Btn onClick={()=>setPage("pricing")} variant="ghost" size="lg">Pricing — from $9</Btn>
        </div>
        <div style={{ display:"flex",gap:18,justifyContent:"center",marginTop:22,flexWrap:"wrap" }}>
          {["Interactive intake chat","Low-confidence flags in red","2 free doc additions per report"].map(t=>(
            <span key={t} style={{ fontSize:11,color:T.muted2,fontFamily:T.mono,display:"flex",alignItems:"center",gap:5 }}><span style={{ color:T.gold }}>✓</span>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,padding:"12px 0",overflow:"hidden",marginBottom:64 }}>
        <style>{`@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        <div style={{ display:"flex",gap:48,whiteSpace:"nowrap",animation:"ticker 18s linear infinite" }}>
          {["RV Parks","Campgrounds","Mobile Home Parks","Self Storage","Multifamily","Small Commercial","Mixed Use","Hybrid Assets","RV Parks","Campgrounds","Mobile Home Parks","Self Storage","Multifamily","Small Commercial","Mixed Use","Hybrid Assets"].map((t,i)=>(
            <span key={i} style={{ fontSize:11,color:T.muted2,fontFamily:T.mono,letterSpacing:"0.06em" }}>◆ {t}</span>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:940,margin:"0 auto",padding:"0 32px 80px" }}>
        <div style={{ textAlign:"center",marginBottom:44 }}>
          <h2 style={{ fontFamily:T.serif,fontSize:40,fontWeight:700,letterSpacing:"-0.02em",margin:"0 0 10px" }}>Built for deals where<br /><em style={{ color:T.gold }}>nothing adds up.</em></h2>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12 }}>
          {features.map(f=>(
            <Card key={f.title} style={{ padding:18 }}>
              <div style={{ fontSize:22,marginBottom:8 }}>{f.icon}</div>
              <div style={{ fontWeight:600,fontSize:13,marginBottom:4 }}>{f.title}</div>
              <div style={{ color:T.muted,fontSize:12,lineHeight:1.6 }}>{f.desc}</div>
            </Card>
          ))}
        </div>
      </div>

      <div style={{ borderTop:`1px solid ${T.border}`,textAlign:"center",padding:"64px 32px" }}>
        <h2 style={{ fontFamily:T.serif,fontSize:44,fontWeight:700,letterSpacing:"-0.02em",marginBottom:12 }}>The seller built those numbers<br /><em style={{ color:T.gold }}>to sell you something.</em></h2>
        <p style={{ color:T.muted,marginBottom:24,fontSize:14 }}>The bank statements don't lie. FinSniff reads them so you don't have to guess.</p>
        <Btn onClick={()=>setPage("auth")} variant="gold" size="lg">Start Sniffing — From $9 →</Btn>
      </div>

      <div style={{ borderTop:`1px solid ${T.border}`,padding:"20px 40px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontFamily:T.serif,fontSize:15,color:T.muted }}>FinSniff 🐾</span>
        <span style={{ fontSize:10,color:T.muted2,fontFamily:T.mono }}>Built for messy books. Not investment advice. © 2026</span>
        <div style={{ display:"flex",gap:16 }}>{["Privacy","Terms","Contact"].map(l=><span key={l} style={{ fontSize:11,color:T.muted2,cursor:"pointer" }}>{l}</span>)}</div>
      </div>
    </div>
  );
};

// ============================================================
// AUTH
// ============================================================
const Auth = ({ mode, setMode, onAuth, setPage }) => {
  const [email,setEmail]=useState(""); const [pass,setPass]=useState(""); const [name,setName]=useState(""); const [loading,setLoading]=useState(false);
  const handle = async () => { setLoading(true); await new Promise(r=>setTimeout(r,700)); onAuth({email,name:name||email.split("@")[0]}); setLoading(false); };
  const inp = { width:"100%",background:T.surface2,border:`1px solid ${T.border2}`,borderRadius:6,padding:"9px 12px",color:T.text,fontSize:13,fontFamily:T.sans,outline:"none",boxSizing:"border-box" };
  return (
    <div style={{ minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans }}>
      <div style={{ width:"100%",maxWidth:390 }}>
        <div onClick={()=>setPage("landing")} style={{ fontFamily:T.serif,fontSize:20,fontWeight:700,marginBottom:28,textAlign:"center",cursor:"pointer" }}>FinSniff 🐾</div>
        <Card glow={T.goldGlow}>
          <h2 style={{ fontFamily:T.serif,fontSize:24,fontWeight:700,margin:"0 0 4px",textAlign:"center" }}>{mode==="login"?"Welcome back":"Create account"}</h2>
          <p style={{ color:T.muted,fontSize:13,textAlign:"center",marginBottom:20 }}>{mode==="login"?"Sign in to FinSniff":"Start sniffing deals today"}</p>
          {mode==="signup"&&<div style={{ marginBottom:11 }}><Label>FULL NAME</Label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Smith" style={inp} /></div>}
          <div style={{ marginBottom:11 }}><Label>EMAIL</Label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={inp} /></div>
          <div style={{ marginBottom:18 }}><Label>PASSWORD</Label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" style={inp} /></div>
          <Btn onClick={handle} disabled={loading||!email||!pass} variant="gold" style={{ width:"100%",fontSize:14,padding:"12px" }}>{loading?"...":mode==="login"?"Sign In →":"Create Account →"}</Btn>
          <div style={{ textAlign:"center",marginTop:12,fontSize:12,color:T.muted }}>
            {mode==="login"?"New here? ":"Have an account? "}
            <span onClick={()=>setMode(mode==="login"?"signup":"login")} style={{ color:T.gold,cursor:"pointer",fontWeight:600 }}>{mode==="login"?"Sign up":"Sign in"}</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ============================================================
// PRICING
// ============================================================
const Pricing = ({ onSelect, user, setPage }) => {
  const plans = [
    { id:"single",      name:"Single Sniff",  price:"$9",  period:"per report", color:T.accent,  desc:"One deal, fully sniffed.",
      features:["1 complete DD report","Interactive intake chat","Asset-type benchmarks","True NOI analysis","Low-confidence flagging","Red flag detection","Negotiation talking points","SBA feasibility flag","Valuation range","DD checklist","Shareable report link","PDF / print","🎁 +2 free document additions"] },
    { id:"underwriter", name:"Underwriter",   price:"$25", period:"/ month",    color:T.gold,    featured:true, desc:"For active buyers on multiple deals.",
      features:["5 reports per month","Everything in Single Sniff","🎁 +5 free additions per report","Deal comparison (side by side)","Red flag email alerts","Report history","Priority processing"] },
    { id:"team",        name:"Team / Firm",   price:"$59", period:"/ month",    color:T.purple,  desc:"For firms, lenders & broker teams.",
      features:["Unlimited reports","Everything in Underwriter","🎁 Unlimited document additions","5 team member seats","White-label reports","API access","Dedicated support"] },
  ];
  return (
    <div style={{ minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.sans,padding:"96px 32px 64px" }}>
      <div style={{ maxWidth:880,margin:"0 auto" }}>
        <div style={{ textAlign:"center",marginBottom:44 }}>
          <Badge color={T.gold}>Pricing</Badge>
          <h1 style={{ fontFamily:T.serif,fontSize:44,fontWeight:700,letterSpacing:"-0.02em",margin:"14px 0 8px" }}>Ridiculously affordable.<br /><em style={{ color:T.gold }}>Brutally honest.</em></h1>
          <p style={{ color:T.muted,fontSize:14 }}>Every plan gives you more than you pay for. Cancel anytime.</p>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14 }}>
          {plans.map(p=>(
            <div key={p.id} style={{ background:p.featured?"#0c0e00":T.surface,border:`1px solid ${p.featured?T.gold+"55":T.border}`,borderRadius:12,padding:24,position:"relative",boxShadow:p.featured?`0 0 40px ${T.goldGlow}`:"none" }}>
              {p.featured&&<div style={{ position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:T.gold,color:"#000",fontSize:10,fontWeight:700,padding:"3px 12px",borderRadius:99,fontFamily:T.mono,whiteSpace:"nowrap" }}>⭐ MOST POPULAR</div>}
              <div style={{ fontFamily:T.mono,fontSize:10,color:T.muted,letterSpacing:"0.12em",marginBottom:4 }}>{p.name.toUpperCase()}</div>
              <div style={{ fontFamily:T.serif,fontSize:40,fontWeight:700,lineHeight:1,marginBottom:2 }}>{p.price} <span style={{ fontSize:13,color:T.muted,fontFamily:T.sans }}>{p.period}</span></div>
              <p style={{ color:T.muted,fontSize:12,margin:"6px 0 16px" }}>{p.desc}</p>
              <ul style={{ listStyle:"none",padding:0,margin:"0 0 20px",display:"flex",flexDirection:"column",gap:6 }}>
                {p.features.map(f=>(
                  <li key={f} style={{ fontSize:12,color:f.startsWith("🎁")?p.color:"#b0bcd4",display:"flex",gap:7,alignItems:"flex-start",fontWeight:f.startsWith("🎁")?"600":"400" }}>
                    <span style={{ color:f.startsWith("🎁")?p.color:T.gold,flexShrink:0 }}>{f.startsWith("🎁")?"":"✓"}</span>{f}
                  </li>
                ))}
              </ul>
              <Btn onClick={()=>{ if(!user) setPage("auth"); else onSelect(p.id); }} variant={p.featured?"gold":p.id==="team"?"purple":"outline"} style={{ width:"100%",textAlign:"center" }}>
                {p.id==="single"?"Buy Single Report →":`Start ${p.name} →`}
              </Btn>
            </div>
          ))}
        </div>
        <p style={{ textAlign:"center",marginTop:20,fontSize:10,color:T.muted2,fontFamily:T.mono }}>FinSniff is a financial analysis tool. Not investment advice. Always verify with a CPA before closing.</p>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const Dashboard = ({ user, planId, logout, setPage }) => {
  const [tab,setTab]=useState("analyze");
  const plan = PLANS[planId]||PLANS.single;
  return (
    <div style={{ minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.sans }}>
      <div style={{ display:"flex",minHeight:"100vh" }}>
        <div style={{ width:205,background:T.surface,borderRight:`1px solid ${T.border}`,padding:"20px 13px",flexShrink:0,position:"fixed",top:0,bottom:0,display:"flex",flexDirection:"column" }}>
          <div style={{ fontFamily:T.serif,fontSize:16,fontWeight:700,marginBottom:24 }}>FinSniff 🐾</div>
          <div style={{ background:T.surface2,border:`1px solid ${plan.color}40`,borderRadius:7,padding:"10px 12px",marginBottom:18 }}>
            <div style={{ fontSize:9,color:T.muted,fontFamily:T.mono,marginBottom:2 }}>YOUR PLAN</div>
            <div style={{ color:plan.color,fontWeight:600,fontSize:12 }}>{plan.name}</div>
            <div style={{ color:T.muted,fontSize:10,marginTop:1 }}>{plan.unlimitedAdditions?"Unlimited everything":`+${plan.freeAdditions} additions/report`}</div>
          </div>
          {[{id:"analyze",icon:"🔍",label:"New Analysis"},{id:"history",icon:"📂",label:"History"},{id:"account",icon:"⚙️",label:"Account"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,border:"none",cursor:"pointer",marginBottom:2,background:tab===t.id?plan.color+"18":"transparent",color:tab===t.id?plan.color:T.muted,fontSize:12,fontFamily:T.sans,textAlign:"left",fontWeight:tab===t.id?600:400 }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
          <div style={{ flex:1 }} />
          <button onClick={()=>setPage("pricing")} style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,border:"none",cursor:"pointer",background:"transparent",color:T.green,fontSize:11,fontFamily:T.sans,textAlign:"left",marginBottom:5 }}>⬆️ Upgrade</button>
          <button onClick={logout} style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,border:"none",cursor:"pointer",background:"transparent",color:T.muted2,fontSize:11,fontFamily:T.sans,textAlign:"left" }}>← Sign out</button>
        </div>
        <div style={{ flex:1,marginLeft:205,padding:"30px 38px",maxWidth:1000 }}>
          {tab==="analyze"&&<Analyzer planId={planId} />}
          {tab==="history"&&(
            <div>
              <h2 style={{ fontFamily:T.serif,fontSize:26,fontWeight:700,marginBottom:6 }}>History</h2>
              <p style={{ color:T.muted,fontSize:13,marginBottom:22 }}>Your completed deal analyses.</p>
              <Card style={{ textAlign:"center",padding:"44px 24px" }}>
                <div style={{ fontSize:32,marginBottom:10 }}>📂</div>
                <div style={{ fontFamily:T.serif,fontSize:17,marginBottom:5 }}>No analyses yet</div>
                <div style={{ color:T.muted,fontSize:12,marginBottom:16 }}>Reports will appear here after your first sniff.</div>
                <Btn onClick={()=>setTab("analyze")} variant="gold" size="sm">Run your first analysis →</Btn>
              </Card>
            </div>
          )}
          {tab==="account"&&(
            <div>
              <h2 style={{ fontFamily:T.serif,fontSize:26,fontWeight:700,marginBottom:20 }}>Account</h2>
              <Card style={{ marginBottom:10 }}><Label>PROFILE</Label><div style={{ marginTop:6 }}><div style={{ fontSize:14,fontWeight:600 }}>{user.name}</div><div style={{ color:T.muted,fontSize:12 }}>{user.email}</div></div></Card>
              <Card style={{ marginBottom:10 }}>
                <Label>SUBSCRIPTION</Label>
                <div style={{ marginTop:6,marginBottom:12 }}><span style={{ color:plan.color,fontWeight:600,fontSize:13 }}>{plan.name}</span><span style={{ color:T.muted,fontSize:12,marginLeft:8 }}>{plan.price} {plan.period}</span></div>
                <div style={{ display:"flex",gap:8 }}><Btn onClick={()=>setPage("pricing")} variant="gold" size="sm">Change Plan</Btn><Btn variant="danger" size="sm">Cancel</Btn></div>
              </Card>
              <Card><Label>DISCLAIMER</Label><p style={{ color:T.muted,fontSize:12,lineHeight:1.7,margin:"6px 0 0" }}>FinSniff is a financial analysis and due diligence tool. Not investment advice. Always verify all figures independently with a CPA and qualified advisors before making investment decisions.</p></Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const [page,setPage]=useState("landing");
  const [authMode,setAuthMode]=useState("signup");
  const [user,setUser]=useState(null);
  const [planId,setPlanId]=useState(null);
  const handleAuth = u => { setUser(u); setPage(planId?"dashboard":"pricing"); };
  const handlePlan = p => { setPlanId(p); setPage("dashboard"); };
  const logout = () => { setUser(null); setPlanId(null); setPage("landing"); };
  return (
    <>
      <style>{fonts}</style>
      {page!=="dashboard"&&(
        <nav style={{ position:"fixed",top:0,left:0,right:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 32px",background:"rgba(8,10,15,0.93)",backdropFilter:"blur(20px)",borderBottom:`1px solid ${T.border}` }}>
          <div onClick={()=>setPage("landing")} style={{ cursor:"pointer",fontFamily:T.serif,fontSize:16,fontWeight:700 }}>FinSniff 🐾</div>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            {user?(<><Btn onClick={()=>setPage("dashboard")} variant="ghost" size="sm">Dashboard</Btn><Btn onClick={logout} variant="ghost" size="sm">Sign out</Btn></>):(<><Btn onClick={()=>{setAuthMode("login");setPage("auth");}} variant="ghost" size="sm">Sign in</Btn><Btn onClick={()=>{setAuthMode("signup");setPage("auth");}} variant="gold" size="sm">Start Sniffing →</Btn></>)}
          </div>
        </nav>
      )}
      {page==="landing"  &&<Landing setPage={setPage} />}
      {page==="auth"     &&<Auth mode={authMode} setMode={setAuthMode} onAuth={handleAuth} setPage={setPage} />}
      {page==="pricing"  &&<Pricing onSelect={handlePlan} user={user} setPage={setPage} />}
      {page==="dashboard"&&user&&<Dashboard user={user} planId={planId} logout={logout} setPage={setPage} />}
    </>
  );
}
