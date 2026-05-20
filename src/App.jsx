import { useState, useEffect, useCallback } from "react";

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwW16_g-saDbv0vduttSRt8k_N3zNB0y-bZmVAOhAepjipaTaJ_jGAqtct-XC1lq_lCRg/exec";

// API
async function fetchDia(dia) {
  const res = await fetch(`${SCRIPT_URL}?accion=getDia&dia=${dia}`);
  return res.json();
}
async function postEvento(p) {
  try { await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(p) }); } catch(e) {}
}

// Utils
const fmt = (d) => d ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "--:--";
const fmtStr = (h, m) => `${String(h||0).padStart(2,"0")}:${String(m||0).padStart(2,"0")}`;
function buildDate(h, m) { const d = new Date(); d.setHours(h||0, m||0, 0, 0); return d; }
function getEndEst(s) { const st = s.startActual || buildDate(s.horaH, s.horaM); return new Date(st.getTime() + (s.duracionMin||60) * 60000); }
function minsSince(d) { return Math.round((Date.now() - d.getTime()) / 60000); }

function getRS(nombre, surgeries) {
  const active = surgeries.find(s => s.residente === nombre && s.status === "active");
  if (active) {
    const e = getEndEst(active);
    const del = e < new Date();
    return { state: "active", surgery: active, endEst: e, delayed: del, delayMins: del ? Math.round((Date.now()-e.getTime())/60000) : 0 };
  }
  const up = surgeries.filter(s => s.residente === nombre && s.status === "scheduled")
    .sort((a,b) => (a.horaH*60+(a.horaM||0)) - (b.horaH*60+(b.horaM||0)))[0];
  if (up) return { state: "upcoming", surgery: up };
  return { state: "free" };
}

function canCover(nombre, nx, surgeries) {
  const ns = buildDate(nx.horaH, nx.horaM);
  const ne = new Date(ns.getTime() + (nx.duracionMin||60) * 60000);
  const rs = getRS(nombre, surgeries);
  if (rs.state === "active") {
    if (rs.endEst > ns) return { can: false };
    const nxt = surgeries.filter(s => s.residente===nombre && s.status==="scheduled")
      .sort((a,b) => (a.horaH*60+(a.horaM||0))-(b.horaH*60+(b.horaM||0)))[0];
    if (nxt && ne > buildDate(nxt.horaH, nxt.horaM)) return { can: false };
    return { can: true };
  }
  if (rs.state === "upcoming") {
    if (ne > buildDate(rs.surgery.horaH, rs.surgery.horaM)) return { can: false };
  }
  return { can: true };
}

// Badge
function Badge({ status, delayed }) {
  const map = {
    active: { l: delayed ? "Retrasado" : "En cirugía", c: delayed ? "#ef4444" : "#22c55e" },
    done: { l: "Terminó", c: "#6366f1" },
    scheduled: { l: "Programado", c: "#f59e0b" },
    unassigned: { l: "Sin cubrir", c: "#ef4444" },
    free: { l: "Disponible", c: "#22c55e" },
    upcoming: { l: "Próximo", c: "#f59e0b" },
  };
  const s = map[delayed ? "active" : status] || map.scheduled;
  return <span style={{ display:"inline-block", padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700, background:s.c+"22", color:s.c, border:`1px solid ${s.c}55` }}>{s.l}</span>;
}

// Resident Card
function ResidentCard({ nombre, nivel, surgeries }) {
  const rs = getRS(nombre, surgeries);
  return (
    <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"14px 18px", border: rs.state==="free" ? "1px solid #22c55e33" : rs.delayed ? "1px solid #ef444455" : "1px solid rgba(255,255,255,0.08)", display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:"#f1f5f9" }}>{nombre}</div>
          <div style={{ fontSize:11, color:"#64748b" }}>{nivel}</div>
        </div>
        <Badge status={rs.state} delayed={rs.delayed} />
      </div>
      {rs.surgery && (
        <div style={{ fontSize:12, color:"#94a3b8" }}>
          <span style={{ fontWeight:600, color:"#cbd5e1" }}>{rs.surgery.nombre}</span>
          {" · "}{rs.surgery.sala}
          {rs.state==="active" && <> · Sale ~{fmt(rs.endEst)}{rs.delayed && <span style={{color:"#ef4444"}}> (+{rs.delayMins}min)</span>}</>}
          {rs.state==="upcoming" && <> · Entra {fmtStr(rs.surgery.horaH, rs.surgery.horaM)}</>}
        </div>
      )}
      {rs.state==="free" && <div style={{ fontSize:12, color:"#22c55e" }}>Libre ahora</div>}
    </div>
  );
}

// Surgery Row
function SurgeryRow({ surgery: s, allResidents, surgeries, onAssign, onUpdate }) {
  const needsCoverage = !s.residente;
  const eligible = needsCoverage ? allResidents.filter(r => canCover(r.nombre, s, surgeries).can) : [];
  const endEst = getEndEst(s);
  return (
    <div style={{ background: needsCoverage ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.04)", border: needsCoverage ? "1px solid #ef444433" : "1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"12px 16px", display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontWeight:700, color:"#f1f5f9", fontSize:13 }}>{s.nombre}</span>
            <Badge status={needsCoverage ? "unassigned" : s.status} />
          </div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:3 }}>
            {s.sala} · {s.horaStr} – ~{fmt(endEst)} · {s.duracionMin}min
            {s.cirujano && <span> · {s.cirujano}</span>}
          </div>
          {s.paciente && <div style={{ fontSize:11, color:"#475569" }}>{s.paciente}</div>}
        </div>
        <div style={{ textAlign:"right", minWidth:110 }}>
          {s.residente ? (
            <div style={{ fontSize:12 }}>
              <div style={{ fontWeight:600, color:"#cbd5e1" }}>{s.residente}</div>
              <div style={{ color:"#64748b" }}>{s.residenteNivel}</div>
            </div>
          ) : s.esNR ? (
            <div style={{ fontSize:11, color:"#64748b" }}>NR</div>
          ) : (
            <div style={{ fontSize:12, color:"#ef4444", fontWeight:600 }}>Sin asignar</div>
          )}
        </div>
      </div>
      {s.residente && (
        <div style={{ display:"flex", gap:6 }}>
          {s.status==="scheduled" && <button onClick={()=>onUpdate(s.id,"active")} style={{ padding:"5px 12px", borderRadius:6, border:"none", background:"#22c55e", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:11 }}>✓ Entró</button>}
          {s.status==="active" && <button onClick={()=>onUpdate(s.id,"done")} style={{ padding:"5px 12px", borderRadius:6, border:"none", background:"#6366f1", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:11 }}>✓ Salió</button>}
          {s.status==="done" && <span style={{ color:"#6366f1", fontSize:11, fontWeight:700 }}>✓ Completada</span>}
        </div>
      )}
      {needsCoverage && (
        <div>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>
            {eligible.length > 0 ? `${eligible.length} disponible(s):` : "⚠ Nadie disponible para este horario"}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
            {eligible.map(r => (
              <button key={r.nombre} onClick={()=>onAssign(s.id, r)} style={{ background:"#22c55e18", border:"1px solid #22c55e44", color:"#22c55e", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                {r.nombre.split(" ")[0]} ({r.nivel})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Add Surgery Modal
function AddModal({ allResidents, surgeries, dia, onAdd, onClose }) {
  const [f, setF] = useState({ nombre:"", sala:"Sala 1", horaH:"10", horaM:"00", duracion:"60", residente:"" });
  const set = (k,v) => setF(p => ({...p, [k]:v}));
  const mock = { horaH:parseInt(f.horaH)||10, horaM:parseInt(f.horaM)||0, duracionMin:parseInt(f.duracion)||60 };
  const eligible = allResidents.filter(r => canCover(r.nombre, mock, surgeries).can);
  const salas = ["Sala 1","Sala 2","Sala 3","Sala 4","Sala 5","Sala 6","Sala 7","Sala 8","Hemodinamia 1","Hemodinamia 2","Endoscopias 1","Endoscopias 2","Obstetricia QX 1","Obstetricia QX 2","Obstetricia Labor","Radiología","Cardio DX","Urgencias","CAM"];
  const inp = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:7, padding:"8px 12px", color:"#f1f5f9", fontSize:13, width:"100%", boxSizing:"border-box" };
  const submit = () => {
    if (!f.nombre) return;
    const selR = allResidents.find(r => r.nombre===f.residente);
    const nueva = { id:"nueva-"+Date.now(), nombre:f.nombre, sala:f.sala, horaH:parseInt(f.horaH)||10, horaM:parseInt(f.horaM)||0, horaStr:`${f.horaH}:${f.horaM}`, duracionMin:parseInt(f.duracion)||60, residente:selR?selR.nombre:null, residenteNivel:selR?selR.nivel:null, esNR:!selR, status:selR?"scheduled":"unassigned", cirujano:"", paciente:"" };
    onAdd(nueva);
    postEvento({ dia, cirugiaId:nueva.id, sala:nueva.sala, nombre:nueva.nombre, residente:nueva.residente||"", accion:"nueva", horaReal:nueva.horaStr });
    onClose();
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 }}>
      <div style={{ background:"#0f172a", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:28, width:"100%", maxWidth:460 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:"#f1f5f9", marginBottom:20 }}>+ Nueva Cirugía</div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input placeholder="Procedimiento" value={f.nombre} onChange={e=>set("nombre",e.target.value)} style={inp} />
          <select value={f.sala} onChange={e=>set("sala",e.target.value)} style={inp}>{salas.map(s=><option key={s}>{s}</option>)}</select>
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>Hora inicio</div>
              <div style={{ display:"flex", gap:4 }}>
                <input type="number" min={0} max={23} value={f.horaH} onChange={e=>set("horaH",e.target.value)} style={{...inp, width:"50%"}} placeholder="HH" />
                <input type="number" min={0} max={59} value={f.horaM} onChange={e=>set("horaM",e.target.value)} style={{...inp, width:"50%"}} placeholder="MM" />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>Duración (min)</div>
              <input type="number" value={f.duracion} onChange={e=>set("duracion",e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>{eligible.length} disponible(s) para este horario</div>
            <select value={f.residente} onChange={e=>set("residente",e.target.value)} style={inp}>
              <option value="">— Sin asignar —</option>
              {allResidents.map(r => { const ok=canCover(r.nombre,mock,surgeries).can; return <option key={r.nombre} value={r.nombre}>{ok?"✓ ":"✗ "}{r.nombre} ({r.nivel})</option>; })}
            </select>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, marginTop:22 }}>
          <button onClick={onClose} style={{ flex:1, padding:10, borderRadius:8, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"#64748b", cursor:"pointer" }}>Cancelar</button>
          <button onClick={submit} style={{ flex:2, padding:10, borderRadius:8, border:"none", background:"#6366f1", color:"#fff", cursor:"pointer", fontWeight:700 }}>Agregar</button>
        </div>
      </div>
    </div>
  );
}

// Timeline
function Timeline({ surgeries, allResidents }) {
  const SH=6, EH=24, TM=(EH-SH)*60;
  const base = new Date(); base.setHours(SH,0,0,0);
  const nowM = (new Date()-base)/60000;
  const toL = (h,m) => Math.max(0,Math.min(100,(((h-SH)*60+(m||0))/TM)*100));
  const toW = (mins) => Math.min(100,(mins/TM)*100);
  const colors = { done:"#6366f1", active:"#22c55e", scheduled:"#f59e0b", unassigned:"#ef4444" };
  const hours = Array.from({length:EH-SH+1},(_,i)=>SH+i);
  return (
    <div style={{ overflowX:"auto", paddingBottom:8 }}>
      <div style={{ position:"relative", height:20, marginLeft:140, marginBottom:4, minWidth:600 }}>
        {hours.map(h=><div key={h} style={{ position:"absolute", left:`${((h-SH)/(EH-SH))*100}%`, fontSize:10, color:"#475569", transform:"translateX(-50%)" }}>{h}:00</div>)}
      </div>
      {allResidents.map(r => {
        const rS = surgeries.filter(s => s.residente===r.nombre);
        return (
          <div key={r.nombre} style={{ display:"flex", alignItems:"center", marginBottom:5, minWidth:740 }}>
            <div style={{ width:132, minWidth:132, fontSize:11, color:"#94a3b8", paddingRight:8, textAlign:"right", lineHeight:1.3 }}>{r.nombre.split(" ")[0]}<br/><span style={{color:"#475569"}}>{r.nivel}</span></div>
            <div style={{ flex:1, position:"relative", height:26, background:"rgba(255,255,255,0.03)", borderRadius:4 }}>
              {nowM>=0&&nowM<=TM&&<div style={{ position:"absolute", left:`${(nowM/TM)*100}%`, top:0, bottom:0, width:1.5, background:"#ef4444", zIndex:2 }} />}
              {rS.map(s=>(
                <div key={s.id} title={s.nombre} style={{ position:"absolute", left:`${toL(s.horaH,s.horaM)}%`, width:`${toW(s.duracionMin)}%`, height:"100%", background:(colors[s.status]||"#f59e0b")+"cc", borderRadius:4, border:`1px solid ${colors[s.status]||"#f59e0b"}`, display:"flex", alignItems:"center", overflow:"hidden", paddingLeft:4 }}>
                  <span style={{ fontSize:9, color:"#fff", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.nombre}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {surgeries.filter(s=>!s.residente).length>0&&<>
        <div style={{ fontSize:10, color:"#ef4444", fontWeight:700, marginLeft:140, marginTop:8, marginBottom:4, letterSpacing:1 }}>SIN CUBRIR</div>
        {surgeries.filter(s=>!s.residente).map(s=>(
          <div key={s.id} style={{ display:"flex", alignItems:"center", marginBottom:5, minWidth:740 }}>
            <div style={{ width:132, minWidth:132, fontSize:11, color:"#ef4444", paddingRight:8, textAlign:"right" }}>⚠ {s.sala}</div>
            <div style={{ flex:1, position:"relative", height:26, background:"rgba(239,68,68,0.05)", borderRadius:4 }}>
              <div style={{ position:"absolute", left:`${toL(s.horaH,s.horaM)}%`, width:`${toW(s.duracionMin)}%`, height:"100%", background:"#ef444433", borderRadius:4, border:"1px dashed #ef4444", display:"flex", alignItems:"center", paddingLeft:4 }}>
                <span style={{ fontSize:9, color:"#ef4444", fontWeight:700 }}>{s.nombre}</span>
              </div>
            </div>
          </div>
        ))}
      </>}
    </div>
  );
}

// Resident View
function ResidentView({ allResidents, surgeries, onUpdate }) {
  const [sel, setSel] = useState("");
  const myS = surgeries.filter(s=>s.residente===sel).sort((a,b)=>(a.horaH*60+(a.horaM||0))-(b.horaH*60+(b.horaM||0)));
  const rs = sel ? getRS(sel, surgeries) : null;
  return (
    <div style={{ paddingBottom:40 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:"#64748b", marginBottom:6, fontWeight:600, letterSpacing:1 }}>SELECCIONA TU NOMBRE</div>
        <select value={sel} onChange={e=>setSel(e.target.value)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"10px 14px", color:sel?"#f1f5f9":"#64748b", fontSize:14, width:"100%" }}>
          <option value="">— Seleccionar —</option>
          {allResidents.map(r=><option key={r.nombre} value={r.nombre}>{r.nombre} ({r.nivel})</option>)}
        </select>
      </div>
      {sel&&rs&&(
        <div style={{ marginBottom:16, padding:"12px 16px", background:"rgba(255,255,255,0.04)", borderRadius:10, border:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", gap:10 }}>
          <Badge status={rs.state} delayed={rs.delayed} />
          {rs.state==="free"&&<span style={{ color:"#22c55e", fontSize:13 }}>Disponible ahora</span>}
          {rs.state==="active"&&<span style={{ fontSize:13, color:"#94a3b8" }}>{rs.surgery.nombre} · Sale ~{fmt(rs.endEst)}{rs.delayed&&<span style={{color:"#ef4444"}}> (+{rs.delayMins}min)</span>}</span>}
          {rs.state==="upcoming"&&<span style={{ fontSize:13, color:"#94a3b8" }}>Próximo: {rs.surgery.nombre} a las {fmtStr(rs.surgery.horaH, rs.surgery.horaM)}</span>}
        </div>
      )}
      {sel&&myS.length===0&&<div style={{ textAlign:"center", color:"#475569", padding:"40px 0" }}>No tienes cirugías asignadas hoy</div>}
      {myS.map(s => {
        const e = getEndEst(s);
        const late = s.status==="active" && s.startActual && minsSince(s.startActual) > s.duracionMin;
        return (
          <div key={s.id} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${s.status==="active"?(late?"#ef444455":"#22c55e33"):"rgba(255,255,255,0.08)"}`, borderRadius:12, padding:"16px 18px", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <div>
                <div style={{ fontWeight:700, color:"#f1f5f9", fontSize:15 }}>{s.nombre}</div>
                <div style={{ fontSize:12, color:"#64748b" }}>{s.sala} · {s.horaStr} – ~{fmt(e)} · {s.duracionMin}min</div>
                {s.cirujano&&<div style={{ fontSize:11, color:"#475569" }}>{s.cirujano}</div>}
              </div>
              <Badge status={s.status} delayed={late} />
            </div>
            {s.status==="active"&&<div style={{ fontSize:12, color:late?"#ef4444":"#22c55e", marginBottom:10 }}>{late?`⚠ Retrasado ~${minsSince(s.startActual)-s.duracionMin} min`:`En tiempo · Sale ~${fmt(e)}`}</div>}
            <div style={{ display:"flex", gap:8 }}>
              {s.status==="scheduled"&&<button onClick={()=>onUpdate(s.id,"active",sel)} style={{ padding:"7px 14px", borderRadius:7, border:"none", background:"#22c55e", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:12 }}>✓ Entré</button>}
              {s.status==="active"&&<button onClick={()=>onUpdate(s.id,"done",sel)} style={{ padding:"7px 14px", borderRadius:7, border:"none", background:"#6366f1", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:12 }}>✓ Salí</button>}
              {s.status==="done"&&<div style={{ color:"#6366f1", fontSize:12, fontWeight:700, alignSelf:"center" }}>✓ Completada</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// MAIN
export default function App() {
  const [view, setView] = useState("controller");
  const [tab, setTab] = useState("board");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [surgeries, setSurgeries] = useState([]);
  const [allResidents, setAllResidents] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const dia = new Date().getDate();

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchDia(dia);
      if (data.error) { setError(data.error); setLoading(false); return; }
      setDayData(data);
      setSurgeries((data.cirugias||[]).map(c => ({ ...c, status: c.residente ? "scheduled" : "unassigned" })));
      const res = [];
      Object.entries(data.residentes||{}).forEach(([nivel,nombres]) => nombres.forEach(n => { if(n) res.push({ nombre:n, nivel }); }));
      setAllResidents(res);
    } catch(e) { setError("Error de conexión: " + e.message); }
    setLoading(false);
  }, [dia]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { const iv = setInterval(() => {}, 60000); return () => clearInterval(iv); }, []);

  const updateStatus = (id, newStatus, residente) => {
    setSurgeries(prev => prev.map(s => {
      if (s.id !== id) return s;
      const u = { status: newStatus };
      if (newStatus==="active") u.startActual = new Date();
      if (newStatus==="done") u.endActual = new Date();
      return { ...s, ...u };
    }));
    const s = surgeries.find(x => x.id===id);
    if (s) postEvento({ dia, cirugiaId:id, sala:s.sala, nombre:s.nombre, residente:residente||s.residente||"", accion:newStatus, horaReal:new Date().toLocaleTimeString("es-MX") });
  };

  const assignResident = (id, r) => {
    setSurgeries(prev => prev.map(s => s.id===id ? {...s, residente:r.nombre, residenteNivel:r.nivel, status:"scheduled", esNR:false} : s));
    const s = surgeries.find(x => x.id===id);
    if (s) postEvento({ dia, cirugiaId:id, sala:s.sala, nombre:s.nombre, residente:r.nombre, accion:"asigno", horaReal:new Date().toLocaleTimeString("es-MX") });
  };

  const addSurgery = (s) => setSurgeries(prev => [...prev, s]);

  const stats = {
    total: surgeries.length,
    active: surgeries.filter(s=>s.status==="active").length,
    done: surgeries.filter(s=>s.status==="done").length,
    sinCubrir: surgeries.filter(s=>!s.residente).length,
    libres: allResidents.filter(r=>getRS(r.nombre,surgeries).state==="free").length,
  };

  const today = new Date().toLocaleDateString("es-MX", { weekday:"long", day:"numeric", month:"long" });

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ minHeight:"100vh", background:"#080e1a", color:"#f1f5f9", fontFamily:"'DM Sans',sans-serif" }}>
        {/* HEADER */}
        <div style={{ background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:"#f1f5f9", letterSpacing:-0.5 }}>QUIRÓFANO <span style={{color:"#6366f1"}}>·</span> HZH</div>
            <div style={{ fontSize:11, color:"#475569", textTransform:"capitalize" }}>{today}</div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <button onClick={cargar} title="Recargar del Sheet" style={{ padding:"7px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#64748b", cursor:"pointer", fontSize:14 }}>↻</button>
            {["controller","resident"].map(v=>(
              <button key={v} onClick={()=>setView(v)} style={{ padding:"7px 16px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", border:view===v?"none":"1px solid rgba(255,255,255,0.1)", background:view===v?"#6366f1":"transparent", color:view===v?"#fff":"#64748b" }}>
                {v==="controller"?"Controlador":"Residente"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth:980, margin:"0 auto", padding:"20px 16px" }}>
          {loading && (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#475569" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
              Cargando programación del día {dia}...
            </div>
          )}
          {error && (
            <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid #ef444444", borderRadius:12, padding:20, color:"#ef4444", marginBottom:20 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Error al cargar</div>
              <div style={{ fontSize:13 }}>{error}</div>
              <button onClick={cargar} style={{ marginTop:12, padding:"6px 14px", borderRadius:7, border:"1px solid #ef4444", background:"transparent", color:"#ef4444", cursor:"pointer" }}>Reintentar</button>
            </div>
          )}

          {!loading && !error && view==="controller" && <>
            {/* STATS */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))", gap:10, marginBottom:20 }}>
              {[
                {l:"Cirugías", v:stats.total, c:"#6366f1"},
                {l:"En curso", v:stats.active, c:"#22c55e"},
                {l:"Terminadas", v:stats.done, c:"#8b5cf6"},
                {l:"Sin cubrir", v:stats.sinCubrir, c:"#ef4444"},
                {l:"Libres", v:stats.libres, c:"#22c55e"},
              ].map(s=>(
                <div key={s.l} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:s.c, fontFamily:"'Syne',sans-serif" }}>{s.v}</div>
                  <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {dayData && <div style={{ fontSize:11, color:"#475569", marginBottom:16 }}>{dayData.diaSemana} {dayData.fecha} · {dayData.programador}</div>}

            {/* TABS */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {["board","timeline"].map(t=>(
                <button key={t} onClick={()=>setTab(t)} style={{ padding:"7px 18px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", border:tab===t?"none":"1px solid rgba(255,255,255,0.1)", background:tab===t?"rgba(99,102,241,0.2)":"transparent", color:tab===t?"#a5b4fc":"#475569" }}>
                  {t==="board"?"Tablero":"Timeline"}
                </button>
              ))}
              <div style={{flex:1}} />
              <button onClick={()=>setShowAdd(true)} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"#6366f1", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}>+ Cirugía</button>
            </div>

            {tab==="board" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <div>
                  <div style={{ fontSize:11, color:"#475569", fontWeight:700, letterSpacing:1, marginBottom:10 }}>RESIDENTES · {allResidents.length}</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {allResidents.map(r=><ResidentCard key={r.nombre} nombre={r.nombre} nivel={r.nivel} surgeries={surgeries} />)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#475569", fontWeight:700, letterSpacing:1, marginBottom:10 }}>PROGRAMACIÓN · {surgeries.length} CX</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[...surgeries].sort((a,b)=>(a.horaH*60+(a.horaM||0))-(b.horaH*60+(b.horaM||0))).map(s=>(
                      <SurgeryRow key={s.id} surgery={s} allResidents={allResidents} surgeries={surgeries} onAssign={assignResident} onUpdate={updateStatus} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab==="timeline" && (
              <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"16px 12px" }}>
                <div style={{ fontSize:11, color:"#475569", fontWeight:700, letterSpacing:1, marginBottom:14 }}>TIMELINE · 06:00–24:00 · línea roja = ahora</div>
                <Timeline surgeries={surgeries} allResidents={allResidents} />
              </div>
            )}
          </>}

          {!loading && !error && view==="resident" && (
            <ResidentView allResidents={allResidents} surgeries={surgeries} onUpdate={updateStatus} />
          )}
        </div>

        {showAdd && <AddModal allResidents={allResidents} surgeries={surgeries} dia={dia} onAdd={addSurgery} onClose={()=>setShowAdd(false)} />}
      </div>
    </>
  );
}
