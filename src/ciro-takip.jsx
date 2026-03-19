import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://pklkiwoktjljamwrkwtb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbGtpd29rdGpsamFtd3Jrd3RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODg2MjksImV4cCI6MjA4OTI2NDYyOX0.cP6mGfAEfE6i_GAm9cW94Wj2RvslP969YLHk8fBalZk";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Sabitler ────────────────────────────────────────────────────────────────
const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const TODAY = new Date().toISOString().slice(0, 10);

const BOREK_URUNLER = [
  { id: "buyuk",   ad: "Büyük Tepsi",        maliyet: 1350, birim: "adet" },
  { id: "kiyma",   ad: "Kıymalı Kol Böreği", maliyet: 340,  birim: "kg"   },
  { id: "kucuk",   ad: "Küçük Tepsi",        maliyet: 600,  birim: "adet" },
  { id: "baklava", ad: "Baklava",            maliyet: 630,  birim: "adet" },
];

const SABIT_KATEGORILER = [
  { id: "kira",       ad: "Kira"       },
  { id: "boss",       ad: "Boss"       },
  { id: "sgk",        ad: "SGK"        },
  { id: "eleman_sgk", ad: "Eleman SGK" },
  { id: "muhasebe",   ad: "Muhasebe"   },
  { id: "vergi",      ad: "Vergi"      },
];

// ─── Yardımcı ────────────────────────────────────────────────────────────────
const num = (v) => parseFloat(v) || 0;
const fmt = (n) => Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

const emptyDay = () => ({
  ciro: { nakit: "", kart: "", trendyol: "", yemeksepeti: "", getir: "", migros: "", yemek: "" },
  gunlukEleman: [],
  masraflar: [],
  borek: { urunler: {} },
  stok: { buyuk: "", kiyma: "", kucuk: "", baklava: "" },
});

const defaultSabitler = () => SABIT_KATEGORILER.map(k => ({ id: k.id, ad: k.ad, tutar: "", sabit: true }));

const mergeMonth = (data) => {
  if (!data) return { sabitMasraflar: defaultSabitler() };
  const sabitIds = SABIT_KATEGORILER.map(k => k.id);
  const tutarMap = {};
  (data.sabitMasraflar || []).forEach(x => { if (sabitIds.includes(x.id)) tutarMap[x.id] = x.tutar; });
  return { ...data, sabitMasraflar: SABIT_KATEGORILER.map(k => ({ id: k.id, ad: k.ad, tutar: tutarMap[k.id] || "", sabit: true })) };
};

// ─── Supabase CRUD ────────────────────────────────────────────────────────────
const fetchDay = async (date) => {
  const { data } = await supabase.from("gunluk_kayitlar").select("veri").eq("tarih", date).single();
  return data?.veri || emptyDay();
};
const upsertDay = async (date, veri) => {
  await supabase.from("gunluk_kayitlar").upsert({ tarih: date, veri, guncelleme: new Date().toISOString() }, { onConflict: "tarih" });
};
const fetchMonth = async (y, m) => {
  const { data } = await supabase.from("aylik_kayitlar").select("veri").eq("yil", y).eq("ay", m).single();
  return mergeMonth(data?.veri || null);
};
const upsertMonth = async (y, m, veri) => {
  await supabase.from("aylik_kayitlar").upsert({ yil: y, ay: m, veri, guncelleme: new Date().toISOString() }, { onConflict: "yil,ay" });
};
const fetchMonthDays = async (y, m) => {
  const days = getDaysInMonth(y, m);
  const dates = [];
  for (let d = 1; d <= days; d++) {
    dates.push(`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
  }
  const { data } = await supabase.from("gunluk_kayitlar").select("tarih,veri").in("tarih", dates);
  const map = {};
  (data || []).forEach(r => { map[r.tarih] = r.veri; });
  return dates.map(date => map[date] || emptyDay());
};

// ─── Hesaplar ────────────────────────────────────────────────────────────────
const calcOto = (ciro) => {
  const paketTop = num(ciro.trendyol) + num(ciro.yemeksepeti) + num(ciro.getir) + num(ciro.migros);
  return {
    kart:  num(ciro.kart) * 0.02,
    paket: paketTop * 0.10,
    yemek: num(ciro.yemek) * 0.10,
    paketTop,
  };
};

const calcDay = (d) => {
  const paketTop = num(d.ciro.trendyol) + num(d.ciro.yemeksepeti) + num(d.ciro.getir) + num(d.ciro.migros);
  const ciro     = num(d.ciro.nakit) + num(d.ciro.kart) + paketTop + num(d.ciro.yemek);
  const oto      = calcOto(d.ciro);
  const otoTotal = oto.kart + oto.paket + oto.yemek;
  const eleman   = (d.gunlukEleman || []).reduce((s, x) => s + num(x.tutar), 0);
  const diger    = (d.masraflar    || []).reduce((s, x) => s + num(x.tutar), 0);
  const masraf   = otoTotal + eleman + diger;
  const urunler  = d.borek?.urunler || {};
  const borek    = BOREK_URUNLER.reduce((s, u) => s + num(urunler[u.id]) * u.maliyet, 0);
  return { ciro, masraf, otoTotal, borek, net: ciro - masraf - borek };
};

const calcStats = (dayVeriList, monthVeri) => {
  let totalCiro = 0, totalMasraf = 0, totalBorek = 0, activeDays = 0;
  const borekTotals = {};
  const dailyCiro = [];
  BOREK_URUNLER.forEach(u => { borekTotals[u.id] = 0; });

  dayVeriList.forEach((d, i) => {
    const c = calcDay(d);
    dailyCiro.push({ day: i + 1, ciro: c.ciro });
    totalCiro += c.ciro; totalMasraf += c.masraf; totalBorek += c.borek;
    const ur = d.borek?.urunler || {};
    BOREK_URUNLER.forEach(u => { borekTotals[u.id] += num(ur[u.id]); });
    if (c.ciro > 0) activeDays++;
  });

  const sabitTotal = (monthVeri.sabitMasraflar || []).reduce((s, x) => s + num(x.tutar), 0);
  const netKar = totalCiro - totalMasraf - totalBorek - sabitTotal;
  return {
    totalCiro, totalMasraf, totalBorek, sabitTotal, netKar,
    avgCiro:  activeDays > 0 ? totalCiro / activeDays : 0,
    avgBorek: activeDays > 0 ? Object.values(borekTotals).reduce((a, b) => a + b, 0) / activeDays : 0,
    dailyCiro, activeDays, borekTotals,
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// ANA UYGULAMA
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view, setView]       = useState("dashboard");
  const [date, setDate]       = useState(TODAY);
  const [dayData, setDayData] = useState(emptyDay());
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(false);
  const now = new Date();
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());

  useEffect(() => {
    setLoading(true);
    fetchDay(date).then(d => { setDayData(d); setLoading(false); });
  }, [date]);

  // Otomatik kaydet (debounce)
  useEffect(() => {
    const t = setTimeout(() => { upsertDay(date, dayData); }, 800);
    return () => clearTimeout(t);
  }, [date, dayData]);

  const updateCiro  = (f, v) => setDayData(p => ({ ...p, ciro: { ...p.ciro, [f]: v } }));
  const updateBorek = (f, v) => setDayData(p => ({ ...p, borek: { urunler: { ...(p.borek?.urunler || {}), [f]: v } } }));
  const addEleman    = () => setDayData(p => ({ ...p, gunlukEleman: [...(p.gunlukEleman||[]), { id: Date.now(), ad: "", tutar: "" }] }));
  const updateEleman = (id, f, v) => setDayData(p => ({ ...p, gunlukEleman: p.gunlukEleman.map(x => x.id === id ? { ...x, [f]: v } : x) }));
  const delEleman    = (id) => setDayData(p => ({ ...p, gunlukEleman: p.gunlukEleman.filter(x => x.id !== id) }));
  const addMasraf    = () => setDayData(p => ({ ...p, masraflar: [...(p.masraflar||[]), { id: Date.now(), ad: "", tutar: "" }] }));
  const updateMasraf = (id, f, v) => setDayData(p => ({ ...p, masraflar: p.masraflar.map(x => x.id === id ? { ...x, [f]: v } : x) }));
  const delMasraf    = (id) => setDayData(p => ({ ...p, masraflar: p.masraflar.filter(x => x.id !== id) }));

  const updateStok = (f, v) => setDayData(p => ({ ...p, stok: { ...(p.stok||{}), [f]: v } }));

  const handleSave = async () => {
    setSaving(true);
    await upsertDay(date, dayData);
    setSaving(false);
  };

  const calc = calcDay(dayData);

  return (
    <div style={S.root}>
      <nav style={S.nav}>
        <div style={S.navLeft}>
          <div style={S.navLogo}><span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>H</span></div>
          <div>
            <div style={S.navTitle}>Revenue Tracker</div>
            <div style={S.navSub}>{view === "entry" ? "Daily Logs" : "Dashboard"}</div>
          </div>
        </div>
        <div style={S.navRight}>
          <button onClick={() => setView("entry")} style={{ ...S.navBtn, ...(view === "entry" ? S.navBtnActive : {}) }} title="Günlük Giriş">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <button onClick={() => setView("dashboard")} style={{ ...S.navBtn, ...(view === "dashboard" ? S.navBtnActive : {}) }} title="Dashboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
        </div>
      </nav>
      {view === "entry"
        ? <EntryView date={date} setDate={setDate} dayData={dayData} calc={calc} loading={loading}
            updateCiro={updateCiro} updateBorek={updateBorek}
            addEleman={addEleman} updateEleman={updateEleman} delEleman={delEleman}
            addMasraf={addMasraf} updateMasraf={updateMasraf} delMasraf={delMasraf}
            updateStok={updateStok} onSave={handleSave} saving={saving} />
        : <DashboardView y={selYear} m={selMonth} setY={setSelYear} setM={setSelMonth} />
      }
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ENTRY VIEW
// ═════════════════════════════════════════════════════════════════════════════
function EntryView({ date, setDate, dayData, calc, loading, updateCiro, updateBorek, addEleman, updateEleman, delEleman, addMasraf, updateMasraf, delMasraf, updateStok, onSave, saving }) {
  const oto = calcOto(dayData.ciro);
  const urunler = dayData.borek?.urunler || {};

  if (loading) return <div style={S.loadWrap}><div style={S.spinner} /><div style={{ color:"#6b7280", marginTop:12 }}>Yükleniyor...</div></div>;

  return (
    <div style={S.entryWrap}>
      <div style={S.entryInner}>
        <div style={S.entryHeader}>
          <div>
            <h1 style={S.entryTitle}>New Entry</h1>
            <p style={S.entrySub}>Enter today's financial data below</p>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.dateInput} />
        </div>

        <Section icon="💳" color="#2563eb" title="Ciro (Revenue)">
          <div style={S.grid2}>
            <Field label="NAKİT">
              <input type="number" placeholder="0.00" value={dayData.ciro.nakit} onChange={e => updateCiro("nakit", e.target.value)} style={S.input} />
            </Field>
            <Field label="KREDİ KARTI">
              <input type="number" placeholder="0.00" value={dayData.ciro.kart} onChange={e => updateCiro("kart", e.target.value)} style={S.input} />
              {num(dayData.ciro.kart) > 0 && <div style={S.otoHint}>Komisyon: ₺{fmt(oto.kart)}</div>}
            </Field>
            <Field label="YEMEK KARTI">
              <input type="number" placeholder="0.00" value={dayData.ciro.yemek} onChange={e => updateCiro("yemek", e.target.value)} style={S.input} />
              {num(dayData.ciro.yemek) > 0 && <div style={S.otoHint}>Komisyon: ₺{fmt(oto.yemek)}</div>}
            </Field>
          </div>
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>PAKET SİPARİŞ</div>
            <div style={S.grid2}>
              <Field label="TRENDYOL YEMEK">
                <input type="number" placeholder="0.00" value={dayData.ciro.trendyol} onChange={e => updateCiro("trendyol", e.target.value)} style={S.input} />
              </Field>
              <Field label="YEMEK SEPETİ">
                <input type="number" placeholder="0.00" value={dayData.ciro.yemeksepeti} onChange={e => updateCiro("yemeksepeti", e.target.value)} style={S.input} />
              </Field>
              <Field label="GETİR YEMEK">
                <input type="number" placeholder="0.00" value={dayData.ciro.getir} onChange={e => updateCiro("getir", e.target.value)} style={S.input} />
              </Field>
              <Field label="MİGROS YEMEK">
                <input type="number" placeholder="0.00" value={dayData.ciro.migros} onChange={e => updateCiro("migros", e.target.value)} style={S.input} />
              </Field>
            </div>
            {oto.paketTop > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, padding:"8px 12px", background:"#eff6ff", borderRadius:8, fontSize:13 }}>
                <span style={{ color:"#1d4ed8", fontWeight:600 }}>Paket Toplam</span>
                <span style={{ color:"#1d4ed8", fontWeight:700 }}>₺{fmt(oto.paketTop)}</span>
              </div>
            )}
          </div>
          <div style={S.sectionTotal}>
            <span style={S.sectionTotalLabel}>Toplam Ciro</span>
            <span style={{ ...S.sectionTotalVal, color: "#2563eb" }}>₺{fmt(calc.ciro)}</span>
          </div>
        </Section>

        <Section icon="🧾" color="#dc2626" title="Günlük Masraflar">
          <div style={S.subSection}>
            <div style={S.subHeader}>
              <span style={S.subTitle}>Günlük Eleman</span>
              <button onClick={addEleman} style={S.addBtn}><span style={{ color:"#2563eb", fontSize:16, marginRight:4 }}>⊕</span>Add</button>
            </div>
            {(dayData.gunlukEleman||[]).length === 0
              ? <div style={S.emptyRow}>Henüz eleman eklenmedi</div>
              : (dayData.gunlukEleman||[]).map(x => (
                <div key={x.id} style={S.masrafRow}>
                  <input placeholder="Name" value={x.ad} onChange={e => updateEleman(x.id,"ad",e.target.value)} style={{ ...S.input, flex:2 }} />
                  <input placeholder="Fee" type="number" value={x.tutar} onChange={e => updateEleman(x.id,"tutar",e.target.value)} style={{ ...S.input, flex:1 }} />
                  <button onClick={() => delEleman(x.id)} style={S.delBtn}>🗑</button>
                </div>
              ))
            }
          </div>
          {calc.otoTotal > 0 && (
            <div style={S.subSection}>
              <div style={S.subHeader}><span style={S.subTitle}>Otomatik Komisyonlar</span></div>
              {oto.kart  > 0 && <OtoRow label="Kredi Kartı %2"  val={oto.kart}  />}
              {oto.paket > 0 && <OtoRow label="Paket %10"       val={oto.paket} />}
              {oto.yemek > 0 && <OtoRow label="Yemek Kartı %10" val={oto.yemek} />}
            </div>
          )}
          <div style={S.subSection}>
            <div style={S.subHeader}>
              <span style={S.subTitle}>Diğer Masraflar</span>
              <button onClick={addMasraf} style={S.addBtn}><span style={{ color:"#2563eb", fontSize:16, marginRight:4 }}>⊕</span>Add</button>
            </div>
            {(dayData.masraflar||[]).length === 0
              ? <div style={S.emptyRow}>Henüz masraf eklenmedi</div>
              : (dayData.masraflar||[]).map(x => (
                <div key={x.id} style={S.masrafRow}>
                  <input placeholder="Description" value={x.ad} onChange={e => updateMasraf(x.id,"ad",e.target.value)} style={{ ...S.input, flex:2 }} />
                  <input placeholder="Amount" type="number" value={x.tutar} onChange={e => updateMasraf(x.id,"tutar",e.target.value)} style={{ ...S.input, flex:1 }} />
                  <button onClick={() => delMasraf(x.id)} style={S.delBtn}>🗑</button>
                </div>
              ))
            }
          </div>
          <div style={S.sectionTotal}>
            <span style={S.sectionTotalLabel}>Toplam Masraf</span>
            <span style={{ ...S.sectionTotalVal, color:"#dc2626" }}>₺{fmt(calc.masraf)}</span>
          </div>
        </Section>

        <Section icon="🥐" color="#d97706" title="Börek Maliyeti">
          <div style={S.grid2}>
            {BOREK_URUNLER.map(u => (
              <Field key={u.id} label={u.ad.toUpperCase()}>
                <input type="number" placeholder="Quantity/Amount" value={urunler[u.id]||""} onChange={e => updateBorek(u.id, e.target.value)} style={S.input} />
                {num(urunler[u.id]) > 0 && <div style={S.otoHint}>{num(urunler[u.id])} × ₺{u.maliyet.toLocaleString("tr-TR")} = ₺{fmt(num(urunler[u.id]) * u.maliyet)}</div>}
              </Field>
            ))}
          </div>
          <div style={S.sectionTotal}>
            <span style={S.sectionTotalLabel}>Toplam Börek Maliyeti</span>
            <span style={{ ...S.sectionTotalVal, color:"#d97706" }}>₺{fmt(calc.borek)}</span>
          </div>
        </Section>

        <Section icon="📦" color="#0891b2" title="Stok Yönetimi">
          <div style={{ fontSize:12, color:"#6b7280", marginBottom:12 }}>Mevcut stok miktarını girin — börek satışları otomatik düşülür</div>
          <div style={S.grid2}>
            {BOREK_URUNLER.map(u => {
              const stok = dayData.stok || {};
              const satis = num((dayData.borek?.urunler||{})[u.id]);
              const girilen = num(stok[u.id]);
              const kalan = girilen - satis;
              const pct = girilen > 0 ? Math.max(0, (kalan / girilen) * 100) : 0;
              const renk = kalan < 0 ? "#dc2626" : pct < 20 ? "#f59e0b" : "#16a34a";
              return (
                <div key={u.id} style={{ background:"#f9fafb", borderRadius:10, padding:"12px" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#6b7280", marginBottom:6 }}>{u.ad.toUpperCase()}</div>
                  <input
                    type="number" placeholder="Stok miktarı"
                    value={stok[u.id] || ""}
                    onChange={e => updateStok(u.id, e.target.value)}
                    style={{ ...S.input, marginBottom:8 }}
                  />
                  <div style={{ height:6, background:"#e5e7eb", borderRadius:3, marginBottom:6 }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:renk, borderRadius:3, transition:"width 0.3s" }} />
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                    <span style={{ color:"#6b7280" }}>Satış: {satis} {u.birim}</span>
                    <span style={{ color:renk, fontWeight:700 }}>Kalan: {kalan} {u.birim}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section icon="💰" color="#16a34a" title="Net Kar (Net Profit)">
          <div style={{ ...S.profitBox, borderColor: calc.net >= 0 ? "#bfdbfe":"#fecaca", background: calc.net >= 0 ? "#eff6ff":"#fff1f2" }}>
            <div style={S.profitLabel}>TOTAL DAILY PROFIT</div>
            <div style={{ ...S.profitVal, color: calc.net >= 0 ? "#1d4ed8":"#dc2626" }}>₺{fmt(calc.net)}</div>
          </div>
          <div style={{ marginTop:12 }}>
            <MiniRow label="Ciro"          val={`₺${fmt(calc.ciro)}`}    color="#2563eb" />
            <MiniRow label="Masraflar"     val={`-₺${fmt(calc.masraf)}`} color="#dc2626" />
            <MiniRow label="Börek Maliyet" val={`-₺${fmt(calc.borek)}`}  color="#d97706" />
          </div>
        </Section>

        <button onClick={onSave} style={{ ...S.saveBtn, opacity: saving ? 0.7 : 1 }} disabled={saving}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:8 }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          {saving ? "Kaydediliyor..." : "Save Daily Entry"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEW
// ═════════════════════════════════════════════════════════════════════════════
function DashboardView({ y, m, setY, setM }) {
  const [monthData, setMonthData] = useState(() => mergeMonth(null));
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [dayList, md] = await Promise.all([fetchMonthDays(y, m), fetchMonth(y, m)]);
    setMonthData(md);
    setStats(calcStats(dayList, md));
    setLoading(false);
  }, [y, m]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const updSabit = async (id, f, v) => {
    const updated = { ...monthData, sabitMasraflar: monthData.sabitMasraflar.map(x => x.id === id ? { ...x, [f]: v } : x) };
    setMonthData(updated);
    await upsertMonth(y, m, updated);
    const dayList = await fetchMonthDays(y, m);
    setStats(calcStats(dayList, updated));
  };
  const updStok = async (id, v) => {
    const updated = { ...monthData, sabitMasraflar: monthData.sabitMasraflar.map(x => x.id === id ? { ...x, tutar: v } : x) };
    setMonthData(updated);
    await upsertMonth(y, m, updated);
  };
  const addSabit = async () => {
    const updated = { ...monthData, sabitMasraflar: [...monthData.sabitMasraflar, { id: Date.now().toString(), ad: "", tutar: "", sabit: false }] };
    setMonthData(updated);
    await upsertMonth(y, m, updated);
  };
  const delSabit = async (id) => {
    const updated = { ...monthData, sabitMasraflar: monthData.sabitMasraflar.filter(x => x.id !== id) };
    setMonthData(updated);
    await upsertMonth(y, m, updated);
    const dayList = await fetchMonthDays(y, m);
    setStats(calcStats(dayList, updated));
  };

  const prevMonth = () => { if (m === 0) { setY(y-1); setM(11); } else setM(m-1); };
  const nextMonth = () => { if (m === 11) { setY(y+1); setM(0); } else setM(m+1); };

  if (loading || !stats) return <div style={S.loadWrap}><div style={S.spinner} /><div style={{ color:"#6b7280", marginTop:12 }}>Veriler yükleniyor...</div></div>;

  const maxCiro  = Math.max(...stats.dailyCiro.map(d => d.ciro), 1);
  const maxBorek = Math.max(...Object.values(stats.borekTotals), 1);

  return (
    <div style={SD.landing}>
      <div style={SD.leftPanel}>
        <div style={SD.leftInner}>
          <div style={SD.landingHeader}>
            <h1 style={SD.landingTitle}>Aylık Özet</h1>
            <div style={SD.monthNavRow}>
              <button onClick={prevMonth} style={SD.monthBtn}>‹</button>
              <span style={SD.monthLabel}>{MONTHS[m]} {y}</span>
              <button onClick={nextMonth} style={SD.monthBtn}>›</button>
            </div>
          </div>

          <div style={SD.metricsGrid}>
            <MiniMetric label="Aylık Ciro"  value={`₺${fmt(stats.totalCiro)}`}  color="#2563eb" bg="#eff6ff" />
            <MiniMetric label="Net Kar"     value={`₺${fmt(stats.netKar)}`}     color={stats.netKar >= 0 ? "#16a34a":"#dc2626"} bg={stats.netKar >= 0 ? "#f0fdf4":"#fff1f2"} />
            <MiniMetric label="Ort. Günlük" value={`₺${fmt(stats.avgCiro)}`}    color="#7c3aed" bg="#f5f3ff" />
            <MiniMetric label="Aktif Gün"   value={`${stats.activeDays} gün`}   color="#d97706" bg="#fffbeb" />
          </div>

          <div style={SD.card}>
            <div style={SD.cardTitle}>Günlük Ciro Grafiği</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:"2px", height:"100px", marginTop:"12px", borderBottom:"1px solid #f3f4f6", paddingBottom:"4px" }}>
              {stats.dailyCiro.map(({ day, ciro }) => (
                <div key={day} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", height:"100%", justifyContent:"flex-end" }}>
                  <div style={{ width:"100%", background: ciro > 0 ? "#93c5fd":"#f3f4f6", borderRadius:"2px 2px 0 0", height:`${(ciro/maxCiro)*100}%`, minHeight: ciro > 0 ? "3px":"2px" }} />
                  <div style={{ fontSize:"7px", color:"#9ca3af", marginTop:"2px" }}>{day}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={SD.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <div style={SD.cardTitle}>Sabit Giderler</div>
                <button onClick={addSabit} style={{ display:"flex", alignItems:"center", fontSize:12, color:"#2563eb", background:"none", border:"none", cursor:"pointer", fontWeight:600, padding:0 }}>
                  <span style={{ fontSize:15, marginRight:3 }}>⊕</span> Ekle
                </button>
              </div>
              {(monthData.sabitMasraflar||[]).map(x => (
                <div key={x.id} style={SD.sabitRow}>
                  {x.sabit
                    ? <span style={SD.sabitLabel}>{x.ad}</span>
                    : <input placeholder="Gider adı" value={x.ad} onChange={e => updSabit(x.id, "ad", e.target.value)} style={{ ...SD.sabitInput, width:90, textAlign:"left", border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 8px" }} />
                  }
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={SD.sabitInputWrap}>
                      <span style={SD.sabitCur}>₺</span>
                      <input type="number" placeholder="0" value={x.tutar} onChange={e => updSabit(x.id, "tutar", e.target.value)} style={SD.sabitInput} />
                    </div>
                    {!x.sabit && <button onClick={() => delSabit(x.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:14, padding:"2px 4px" }}>✕</button>}
                  </div>
                </div>
              ))}
              <div style={SD.sabitToplam}>
                <span style={{ fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:"0.05em" }}>TOPLAM</span>
                <span style={{ fontSize:15, fontWeight:800, color:"#1d4ed8" }}>₺{fmt(stats.sabitTotal)}</span>
              </div>
            </div>

            <div style={SD.card}>
              <div style={SD.cardTitle}>Aylık Kırılım</div>
              <div style={{ marginTop:8 }}>
                <KirilimRow label="Ciro"          val={`₺${fmt(stats.totalCiro)}`}    color="#2563eb" />
                <KirilimRow label="Günlük Masraf" val={`-₺${fmt(stats.totalMasraf)}`} color="#dc2626" />
                <KirilimRow label="Börek Maliyet" val={`-₺${fmt(stats.totalBorek)}`}  color="#d97706" />
                <KirilimRow label="Sabit Masraf"  val={`-₺${fmt(stats.sabitTotal)}`}  color="#7c3aed" />
                <div style={{ borderTop:"1.5px solid #e5e7eb", marginTop:6, paddingTop:6 }}>
                  <KirilimRow label="Net Kar" val={`₺${fmt(stats.netKar)}`} color={stats.netKar >= 0 ? "#16a34a":"#dc2626"} bold />
                </div>
              </div>
            </div>
          </div>

          <div style={SD.card}>
            <div style={SD.cardTitle}>Börek Performansı — Aylık Toplam Adet</div>
            <div style={{ marginTop:12 }}>
              {BOREK_URUNLER.map((u, i) => {
                const colors = ["#f59e0b","#2563eb","#8b5cf6","#16a34a"];
                const total = stats.borekTotals[u.id] || 0;
                return (
                  <div key={u.id} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:5 }}>
                      <span style={{ color:"#374151", fontWeight:500 }}>{u.ad}</span>
                      <span style={{ color:colors[i], fontWeight:700 }}>{total} {u.birim} / <span style={{ fontWeight:400, fontSize:12 }}>{stats.activeDays > 0 ? (total / stats.activeDays).toFixed(1) : 0} ort.</span></span>
                    </div>
                    <div style={{ height:6, background:"#f3f4f6", borderRadius:3 }}>
                      <div style={{ height:"100%", width:`${maxBorek > 0 ? (total/maxBorek)*100 : 0}%`, background:colors[i], borderRadius:3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stok Yönetimi */}
          <StokPanel />
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// KÜÇÜK BİLEŞENLER
// ═════════════════════════════════════════════════════════════════════════════
function StokPanel() {
  const [stoklar, setStoklar] = useState({});
  const [satislar, setSatislar] = useState({});

  useEffect(() => {
    fetchDay(TODAY).then(d => {
      setStoklar(d.stok || {});
      setSatislar(d.borek?.urunler || {});
    });
  }, []);

  const colors = ["#f59e0b","#2563eb","#8b5cf6","#16a34a"];
  return (
    <div style={SD.card}>
      <div style={SD.cardTitle}>📦 Stok Yönetimi</div>
      <div style={{ fontSize:11, color:"#9ca3af", marginBottom:12 }}>Bugünün stok girişlerine göre kalan</div>
      {BOREK_URUNLER.map((u, i) => {
        const girilen = num(stoklar[u.id]);
        const satis = num(satislar[u.id]);
        const kalan = girilen > 0 ? girilen - satis : null;
        const pct = girilen > 0 ? Math.max(0, (kalan / girilen) * 100) : 0;
        const renk = kalan === null ? "#9ca3af" : kalan < 0 ? "#dc2626" : pct < 20 ? "#f59e0b" : "#16a34a";
        return (
          <div key={u.id} style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:5 }}>
              <span style={{ color:"#374151", fontWeight:500 }}>{u.ad}</span>
              <span style={{ color:renk, fontWeight:700 }}>
                {kalan === null ? "Stok girilmedi" : `${kalan} ${u.birim} kalan`}
              </span>
            </div>
            <div style={{ height:6, background:"#f3f4f6", borderRadius:3 }}>
              <div style={{ height:"100%", width:`${pct}%`, background:renk, borderRadius:3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniMetric({ label, value, color, bg }) {
  return (
    <div style={{ background:bg, borderRadius:10, padding:"12px 14px" }}>
      <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:17, fontWeight:700, color }}>{value}</div>
    </div>
  );
}
function KirilimRow({ label, val, color, bold }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f9fafb" }}>
      <span style={{ fontSize:12, color:"#6b7280", fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize:13, color, fontWeight: bold ? 700 : 500 }}>{val}</span>
    </div>
  );
}
function Section({ icon, color, title, children }) {
  return (
    <div style={S.section}>
      <div style={S.sectionHeader}>
        <span style={{ marginRight:8, fontSize:20 }}>{icon}</span>
        <h2 style={{ ...S.sectionTitle, color }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={S.field}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
function OtoRow({ label, val }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"7px 12px", background:"#fff7ed", borderRadius:6, marginBottom:6, fontSize:13 }}>
      <span style={{ color:"#92400e" }}>{label}</span>
      <span style={{ color:"#c2410c", fontWeight:600 }}>-₺{fmt(val)}</span>
    </div>
  );
}
function MiniRow({ label, val, color }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
      <span style={{ color:"#6b7280" }}>{label}</span>
      <span style={{ color, fontWeight:600 }}>{val}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const S = {
  root:    { minHeight:"100vh", background:"#f3f4f6", fontFamily:"'Inter', system-ui, sans-serif" },
  nav:           { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 24px", height:56, background:"#fff", borderBottom:"1px solid #e5e7eb", position:"sticky", top:0, zIndex:100 },
  navLeft:       { display:"flex", alignItems:"center", gap:12 },
  navLogo:       { width:36, height:36, borderRadius:8, background:"#1d4ed8", display:"flex", alignItems:"center", justifyContent:"center" },
  navTitle:      { fontSize:15, fontWeight:700, color:"#111827" },
  navSub:        { fontSize:11, color:"#6b7280" },
  navRight:      { display:"flex", gap:8 },
  navBtn:        { padding:"8px 10px", border:"1px solid #e5e7eb", borderRadius:8, background:"#fff", cursor:"pointer", color:"#6b7280", display:"flex", alignItems:"center" },
  navBtnActive:  { background:"#eff6ff", borderColor:"#bfdbfe", color:"#1d4ed8" },
  loadWrap:      { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"calc(100vh - 56px)" },
  spinner:       { width:32, height:32, border:"3px solid #e5e7eb", borderTop:"3px solid #1d4ed8", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  entryWrap:     { background:"#f3f4f6", minHeight:"calc(100vh - 56px)", padding:"32px 16px 60px" },
  entryInner:    { maxWidth:560, margin:"0 auto" },
  entryHeader:   { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 },
  entryTitle:    { fontSize:28, fontWeight:700, color:"#111827", margin:0 },
  entrySub:      { fontSize:14, color:"#6b7280", marginTop:4 },
  dateInput:     { padding:"8px 12px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, background:"#fff", color:"#374151" },
  section:       { background:"#fff", borderRadius:12, padding:"20px 20px 16px", marginBottom:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" },
  sectionHeader: { display:"flex", alignItems:"center", marginBottom:16 },
  sectionTitle:  { fontSize:18, fontWeight:700, margin:0 },
  sectionTotal:  { display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, paddingTop:12, borderTop:"1px solid #f3f4f6" },
  sectionTotalLabel: { fontSize:13, color:"#6b7280", fontWeight:600 },
  sectionTotalVal:   { fontSize:20, fontWeight:700 },
  grid2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  field:    { display:"flex", flexDirection:"column", gap:6 },
  fieldLabel: { fontSize:11, fontWeight:600, color:"#6b7280", letterSpacing:"0.06em" },
  input:    { padding:"10px 12px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:14, color:"#111827", background:"#fff", width:"100%", boxSizing:"border-box" },
  otoHint:  { fontSize:11, color:"#9ca3af", marginTop:2 },
  subSection: { marginBottom:14 },
  subHeader:  { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 },
  subTitle:   { fontSize:13, fontWeight:600, color:"#374151" },
  addBtn:     { display:"flex", alignItems:"center", fontSize:13, color:"#2563eb", background:"none", border:"none", cursor:"pointer", fontWeight:600, padding:0 },
  masrafRow:  { display:"flex", gap:8, alignItems:"center", marginBottom:8 },
  delBtn:     { background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px 6px", borderRadius:6, color:"#9ca3af" },
  emptyRow:   { fontSize:13, color:"#9ca3af", fontStyle:"italic", padding:"8px 0" },
  profitBox:  { borderRadius:12, border:"1.5px solid", padding:"20px", textAlign:"center" },
  profitLabel:{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", color:"#6b7280", marginBottom:8 },
  profitVal:  { fontSize:36, fontWeight:800, letterSpacing:"-1px" },
  saveBtn: { width:"100%", padding:"16px", background:"#1d4ed8", color:"#fff", border:"none", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", marginTop:8 },
};

const SD = {
  landing:   { minHeight:"calc(100vh - 56px)", background:"#f3f4f6" },
  leftPanel: { background:"#f3f4f6", overflowY:"auto" },
  leftInner: { padding:"28px 32px 60px", maxWidth:900, margin:"0 auto" },
  landingHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  landingTitle:  { fontSize:26, fontWeight:800, color:"#111827", margin:0 },
  monthNavRow:   { display:"flex", alignItems:"center", gap:8 },
  monthBtn:      { background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:18, color:"#374151", lineHeight:1 },
  monthLabel:    { fontSize:16, fontWeight:700, color:"#374151", minWidth:120, textAlign:"center" },
  metricsGrid:   { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 },
  card:          { background:"#fff", borderRadius:12, padding:"16px", marginBottom:12, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" },
  cardTitle:     { fontSize:13, fontWeight:700, color:"#374151", marginBottom:4 },
  sabitRow:      { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #f9fafb" },
  sabitLabel:    { fontSize:13, color:"#374151" },
  sabitInputWrap:{ display:"flex", alignItems:"center", border:"1px solid #e5e7eb", borderRadius:6, overflow:"hidden" },
  sabitCur:      { padding:"5px 7px", fontSize:12, color:"#6b7280", background:"#f9fafb", borderRight:"1px solid #e5e7eb" },
  sabitInput:    { border:"none", outline:"none", padding:"5px 8px", fontSize:12, width:75, textAlign:"right", color:"#111827" },
  sabitToplam:   { display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10, paddingTop:8, borderTop:"2px solid #f3f4f6" },
};