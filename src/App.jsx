import { useState, useCallback } from "react";

// ─── Utilities ────────────────────────────────────────────────────────────────

function isFeasible(x, A, b) {
  for (let i = 0; i < A.length; i++) {
    let sum = 0;
    for (let j = 0; j < x.length; j++) sum += A[i][j] * x[j];
    if (sum > b[i] + 1e-9) return false;
  }
  return true;
}

function addObj(x, weights) {
  return x.reduce((s, v, j) => s + v * weights[j], 0);
}

function maxminObj(x, d) {
  let mn = Infinity, any = false;
  for (let j = 0; j < x.length; j++) {
    if (x[j] === 1) { mn = Math.min(mn, d[j]); any = true; }
  }
  return any ? mn : 0;
}

function combined(x, c, d, lambda) {
  return lambda * addObj(x, c) + (1 - lambda) * maxminObj(x, d);
}

function solveKnapsackAdditive(n, A, b, weights) {
  if (n === 0) return [];
  let bestVal = -Infinity, bestX = new Array(n).fill(0);
  if (n <= 20) {
    for (let mask = 0; mask < (1 << n); mask++) {
      const x = Array.from({ length: n }, (_, j) => (mask >> j) & 1);
      if (!isFeasible(x, A, b)) continue;
      const val = addObj(x, weights);
      if (val > bestVal) { bestVal = val; bestX = [...x]; }
    }
  } else {
    const items = Array.from({ length: n }, (_, j) => ({ j, w: weights[j] }))
      .filter(it => it.w > 0).sort((a, b) => b.w - a.w);
    const x = new Array(n).fill(0);
    for (const { j } of items) { x[j] = 1; if (!isFeasible(x, A, b)) x[j] = 0; }
    bestX = x;
  }
  return bestX;
}

// ─── Main Algorithm ───────────────────────────────────────────────────────────

function runAlgorithm(c, d, A, b, lambda) {
  const n = c.length;
  const steps = [];

  const x0 = solveKnapsackAdditive(n, A, b, c);
  const V = [x0];
  steps.push({
    s: 0, label: "Полная задача (критерий F\u2081)",
    x: [...x0], size: `${A.length}\u00d7${n}`,
    F1: addObj(x0, c), F2: maxminObj(x0, d), F: combined(x0, c, d, lambda),
  });

  if (lambda === 1) return { best: x0, V, steps, bestF: combined(x0, c, d, lambda), bestIdx: 0 };

  let j0 = -1;
  for (let j = n - 1; j >= 0; j--) { if (x0[j] === 1) { j0 = j; break; } }
  if (j0 <= 0) return { best: x0, V, steps, bestF: combined(x0, c, d, lambda), bestIdx: 0 };

  for (let s = 1; s <= j0; s++) {
    const sz = j0 + 1 - s;
    const As = A.map(row => row.slice(0, sz));
    const ws = c.slice(0, sz).map((cv, j) =>
      j < sz - 1 ? lambda * cv : lambda * cv + (1 - lambda) * d[sz - 1]
    );
    const xsSmall = solveKnapsackAdditive(sz, As, b, ws);
    const xs = [...xsSmall, ...new Array(n - sz).fill(0)];
    V.push(xs);
    steps.push({
      s, label: `s=${s}, \u0440\u0430\u0441\u0441\u043c\u0430\u0442\u0440\u0438\u0432\u0430\u0435\u043c \u043f\u0435\u0440\u0432\u044b\u0435 ${sz} \u0421\u0417\u0418`,
      x: [...xs], size: `${A.length}\u00d7${sz}`,
      F1: addObj(xs, c), F2: maxminObj(xs, d), F: combined(xs, c, d, lambda),
    });
  }

  let bestIdx = 0, bestF = -Infinity;
  V.forEach((xv, i) => { const fv = combined(xv, c, d, lambda); if (fv > bestF) { bestF = fv; bestIdx = i; } });
  return { best: V[bestIdx], V, steps, bestF, bestIdx };
}

const parseRow = (s) => s.trim().split(/[\s,;]+/).map(Number).filter(v => !isNaN(v));

const EXAMPLE = {
  m: 3, n: 5, lambda: "0.5",
  c: ["90", "76", "30", "35", "30"],
  d: ["40", "20", "14", "12", "10"],
  A: ["15 10 5 4 3", "27 18 12 6 6", "40 25 12 11 8"],
  b: "20 39 48",
};

export default function App() {
  const [m, setM] = useState(EXAMPLE.m);
  const [n, setN] = useState(EXAMPLE.n);
  const [lambda, setLambda] = useState(EXAMPLE.lambda);
  const [cVals, setCVals] = useState(EXAMPLE.c);
  const [dVals, setDVals] = useState(EXAMPLE.d);
  const [Arows, setArows] = useState(EXAMPLE.A);
  const [bVec, setBVec] = useState(EXAMPLE.b);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("params");

  const updateDimensions = (newM, newN) => {
    setCVals(prev => { const a=[...prev]; while(a.length<newN) a.push("0"); return a.slice(0,newN); });
    setDVals(prev => { const a=[...prev]; while(a.length<newN) a.push("0"); return a.slice(0,newN); });
    setArows(prev => { const a=[...prev]; while(a.length<newM) a.push(""); return a.slice(0,newM); });
  };

  const handleRun = useCallback(() => {
    try {
      setError("");
      const lam = parseFloat(lambda);
      if (isNaN(lam) || lam < 0 || lam > 1) throw new Error("λ должно быть в [0,1]");
      const c = cVals.slice(0,n).map((v,j)=>{ const x=parseFloat(v); if(isNaN(x)) throw new Error(`c: некорректное значение для СЗИ ${j+1}`); return x; });
      const d = dVals.slice(0,n).map((v,j)=>{ const x=parseFloat(v); if(isNaN(x)) throw new Error(`d: некорректное значение для СЗИ ${j+1}`); return x; });
      const idx = Array.from({length:n},(_,i)=>i).sort((a,b)=>d[b]-d[a]);
      const cs = idx.map(i=>c[i]);
      const ds = idx.map(i=>d[i]);
      const A = Arows.slice(0,m).map((row,i)=>{ const vals=parseRow(row); if(vals.length<n) throw new Error(`Строка ${i+1} матрицы A должна содержать ${n} значений`); return idx.map(i=>vals[i]); });
      const b = parseRow(bVec);
      if(b.length<m) throw new Error(`Вектор b должен содержать ${m} значений`);
      const res = runAlgorithm(cs, ds, A, b, lam);
      res.c = cs; res.d = ds;
      setResult(res);
      setActiveTab("result");
    } catch(e) { setError(e.message); }
  }, [m, n, lambda, cVals, dVals, Arows, bVec]);

  const fmt = v => isFinite(v) ? v.toFixed(3) : "—";

  return (
    <div style={{ minHeight:"100vh", background:"#020b18", color:"#e2e8f0", fontFamily:"'IBM Plex Mono','Courier New',monospace", padding:"24px" }}>

      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0, color:"#f0f9ff" }}>Задача внедрения СЗИ</h1>
        <div style={{ marginTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
          {["params","result"].map(tab=>(
            <button key={tab} onClick={()=>setActiveTab(tab)} style={{
              background:activeTab===tab?"#0ea5e9":"transparent",
              color:activeTab===tab?"#fff":"#64748b",
              border:`1px solid ${activeTab===tab?"#0ea5e9":"#1e3a5f"}`,
              padding:"5px 14px", borderRadius:4, cursor:"pointer",
              fontSize:12, letterSpacing:1, fontFamily:"monospace",
            }}>
              {tab==="params" ? "⚙ ПАРАМЕТРЫ" : "◉ РЕЗУЛЬТАТ"}
            </button>
          ))}
        </div>
      </div>

      {activeTab==="params" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          <Section title="Размерность задачи">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
              <Field label="m — групп ГИА" value={m} onChange={v=>{const x=parseInt(v)||1;setM(x);updateDimensions(x,n);}} type="number" min={1}/>
              <Field label="n — видов СЗИ"  value={n} onChange={v=>{const x=parseInt(v)||1;setN(x);updateDimensions(m,x);}} type="number" min={1}/>
              <Field label="λ ∈ [0,1]" value={lambda} onChange={setLambda} placeholder="0.5"/>
            </div>
          </Section>

          <Section title="Параметры СЗИ">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8, letterSpacing:1 }}>cⱼ — время взлома j-го СЗИ</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {Array.from({length:n},(_,j)=>(
                    <Field key={j} label={`СЗИ ${j+1}`} value={cVals[j]||""} onChange={v=>{const a=[...cVals];a[j]=v;setCVals(a);}} placeholder="число"/>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8, letterSpacing:1 }}>dⱼ — время реагирования отдела безопасности</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {Array.from({length:n},(_,j)=>(
                    <Field key={j} label={`СЗИ ${j+1}`} value={dVals[j]||""} onChange={v=>{const a=[...dVals];a[j]=v;setDVals(a);}} placeholder="число"/>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Матрица стоимостей A (m×n) и бюджет b">
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <MatrixInput label="Матрица A — строки (ГИА × СЗИ)" value={Arows} onChange={setArows}/>
              <Field label="Вектор b — бюджет по каждой ГИА (через пробел)" value={bVec} onChange={setBVec}/>
            </div>
          </Section>

          {error && <div style={{ background:"#1c0a0a", border:"1px solid #7f1d1d", padding:"10px 14px", borderRadius:4, color:"#fca5a5", fontSize:12 }}>⚠ {error}</div>}

          <button onClick={handleRun} style={{
            background:"linear-gradient(135deg,#0369a1,#0ea5e9)", color:"#fff", border:"none",
            padding:"12px 28px", borderRadius:6, cursor:"pointer", fontSize:14,
            fontFamily:"monospace", letterSpacing:2, fontWeight:700,
            boxShadow:"0 0 20px rgba(14,165,233,0.3)", alignSelf:"flex-start",
          }}>▶ ЗАПУСТИТЬ АЛГОРИТМ</button>
        </div>
      )}

      {activeTab==="result" && result && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          <Section title="Таблица работы алгоритма">
            <div style={{ overflowX:"auto" }}>
              <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
                <thead><tr>
                  {["s","Шаг","Матрица","Вектор x","F₁(x)","F₂(x)","F(x)"].map((h,i)=>(
                    <th key={i} style={{ padding:"6px 12px", textAlign:"center", color:"#7dd3fc", borderBottom:"1px solid #1e3a5f", background:"#0c1a2e", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {result.steps.map((step,i)=>{
                    const isBest = result.bestIdx===i;
                    return (
                      <tr key={i} style={{ background:isBest?"rgba(14,165,233,0.12)":"transparent" }}>
                        <td style={tdStyle}>{step.s}</td>
                        <td style={{...tdStyle, color:"#94a3b8", textAlign:"left"}}>{step.label}</td>
                        <td style={tdStyle}>{step.size}</td>
                        <td style={{...tdStyle, fontFamily:"monospace", color:isBest?"#38bdf8":"#e2e8f0"}}>({step.x.join(",")})</td>
                        <td style={tdStyle}>{fmt(step.F1)}</td>
                        <td style={tdStyle}>{fmt(step.F2)}</td>
                        <td style={{...tdStyle, color:isBest?"#38bdf8":"#e2e8f0", fontWeight:isBest?700:400}}>
                          {fmt(step.F)}{isBest?" ★":""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Оптимальное решение">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:16 }}>
              <Metric label="Вектор x*" value={`(${result.best.join(", ")})`} accent/>
              <Metric label="F(x*) = λF₁ + (1-λ)F₂" value={fmt(result.bestF)} accent/>
              <Metric label="F₁(x*) — сумм. время взлома" value={fmt(addObj(result.best, result.c))}/>
              <Metric label="F₂(x*) — мин. время реаг." value={fmt(maxminObj(result.best, result.d))}/>
            </div>
            <div style={{ marginTop:16, display:"flex", flexWrap:"wrap", gap:10 }}>
              {result.best.map((v,j)=>(
                <div key={j} style={{
                  background:v===1?"rgba(14,165,233,0.2)":"#0c1a2e",
                  border:`1px solid ${v===1?"#0ea5e9":"#1e3a5f"}`,
                  borderRadius:6, padding:"10px 16px", textAlign:"center",
                }}>
                  <div style={{ fontSize:11, color:"#64748b" }}>СЗИ {j+1}</div>
                  <div style={{ fontSize:20, fontWeight:700, color:v===1?"#38bdf8":"#334155" }}>{v}</div>
                  <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{v===1?"✓ принято":"✗ откл."}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {activeTab==="result" && !result && (
        <div style={{ color:"#475569", textAlign:"center", padding:"60px 20px", fontSize:14 }}>
          Перейдите на вкладку «Параметры» и нажмите «Запустить алгоритм»
        </div>
      )}
    </div>
  );
}

const tdStyle = { padding:"7px 12px", textAlign:"center", borderBottom:"1px solid #0f2233", color:"#cbd5e1" };

function Section({ title, children }) {
  return (
    <div style={{ background:"#060f1c", border:"1px solid #1e3a5f", borderRadius:8, padding:"18px 20px" }}>
      <div style={{ fontSize:11, letterSpacing:2, color:"#38bdf8", textTransform:"uppercase", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #0f2233" }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type="text", min, placeholder }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <label style={{ fontSize:11, color:"#7dd3fc", fontFamily:"monospace", letterSpacing:1 }}>{label}</label>
      <input type={type} min={min} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ background:"#0f172a", border:"1px solid #1e3a5f", color:"#e2e8f0", padding:"7px 10px", borderRadius:4, fontFamily:"monospace", fontSize:13 }}/>
    </div>
  );
}

function MatrixInput({ label, value, onChange }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <label style={{ fontSize:11, color:"#7dd3fc", fontFamily:"monospace", letterSpacing:1 }}>{label}</label>
      {value.map((row,i)=>(
        <input key={i} value={row} onChange={e=>{const next=[...value];next[i]=e.target.value;onChange(next);}}
          placeholder={`Строка ${i+1} (через пробел)`}
          style={{ background:"#0f172a", border:"1px solid #1e3a5f", color:"#e2e8f0", padding:"5px 8px", borderRadius:4, fontFamily:"monospace", fontSize:13 }}/>
      ))}
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div style={{ background:accent?"rgba(14,165,233,0.08)":"#0a1525", border:`1px solid ${accent?"#0369a1":"#1e3a5f"}`, borderRadius:6, padding:"12px 14px" }}>
      <div style={{ fontSize:10, color:"#64748b", marginBottom:4, letterSpacing:1 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:700, color:accent?"#38bdf8":"#e2e8f0", wordBreak:"break-all" }}>{value}</div>
    </div>
  );
}
