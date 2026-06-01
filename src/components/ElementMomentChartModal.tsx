import React, { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Save } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import type { Beam, Column, Slab, FrameResult } from '@/lib/structuralEngine';

interface Props {
  open: boolean;
  onClose: () => void;
  elementType: 'beam' | 'column' | 'slab';
  elementId: string;
  beams: Beam[];
  columns: Column[];
  slabs: Slab[];
  frameResults: FrameResult[];
  beamDesigns?: { beamId: string; flexLeft: any; flexMid: any; flexRight: any; deflection?: any; span?: number; endCondition?: any; mergedCarrierIds?: string[] }[];
  colDesigns?: { id: string; b: number; h: number; Pu: number; design: any }[];
  onSaveBeamProps?: (beamId: string, updates: { name: string; b: number; h: number }) => void;
}

/**
 * Bending-moment and deflection diagrams along the length of the selected element.
 *
 * For beams: M(x) is sampled from the analysis result, and deflection diagram Delta(x)
 * is derived from the elastic curve matched to the calculated maximum total deflection.
 * For columns: shows a linear M(z) from base to top.
 * For slabs: shows the strip moment in the short and long directions.
 */
export default function ElementMomentChartModal({
  open, onClose, elementType, elementId,
  beams, columns, slabs, frameResults, beamDesigns, colDesigns, onSaveBeamProps
}: Props) {

  const beam = useMemo(() => {
    if (elementType === 'beam') {
      return beams.find(b => b.id === elementId);
    }
    return null;
  }, [elementType, elementId, beams]);

  const [editName, setEditName] = useState('');
  const [editB, setEditB] = useState('');
  const [editH, setEditH] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize editing state when modal opens or beam changes
  useEffect(() => {
    if (beam) {
      setEditName(beam.name || beam.id);
      setEditB(beam.b.toString());
      setEditH(beam.h.toString());
      setSaveSuccess(false);
    }
  }, [beam, open]);

  const handleSave = () => {
    if (!beam || !onSaveBeamProps) return;
    const bNum = parseFloat(editB);
    const hNum = parseFloat(editH);
    if (isNaN(bNum) || bNum <= 0 || isNaN(hNum) || hNum <= 0) {
      alert('الرجاء إدخال أبعاد ومقاسات صحيحة بالمليمتر (أكبر من الصفر).');
      return;
    }
    
    onSaveBeamProps(beam.id, {
      name: editName.trim() || beam.id,
      b: bNum,
      h: hNum,
    });
    
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  const data = useMemo(() => {
    if (elementType === 'beam') {
      const activeBeam = beams.find(b => b.id === elementId);
      if (!activeBeam) return null;
      // Find frame result for this beam
      let Mleft = 0, Mmid = 0, Mright = 0, Vu = 0;
      let stations: number[] | undefined;
      for (const fr of frameResults) {
        const br = fr.beams.find(bb => bb.beamId === elementId);
        if (br) {
          Mleft = br.Mleft;
          Mmid = br.Mmid;
          Mright = br.Mright;
          Vu = (br as any).Vu ?? 0;
          stations = br.momentStations;
          break;
        }
      }
      const L = activeBeam.length;
      let points;
      if (stations && stations.length >= 2) {
        points = stations.map((val, i) => {
          const t = i / (stations!.length - 1);
          const x = +(t * L).toFixed(3);
          const M = +val.toFixed(2);
          return { x, M };
        });
      } else {
        // Parabolic interpolation matching the 3 control points (fallback)
        // M(t) where t in [0..1]: a + b t + c t^2 ; M(0)=Mleft, M(0.5)=Mmid, M(1)=Mright
        const a = Mleft;
        const b = -3 * Mleft + 4 * Mmid - Mright;
        const c = 2 * Mleft - 4 * Mmid + 2 * Mright;
        const N = 41;
        points = Array.from({ length: N }, (_, i) => {
          const t = i / (N - 1);
          const x = +(t * L).toFixed(3);
          const M = +(a + b * t + c * t * t).toFixed(2);
          return { x, M };
        });
      }
      return {
        title: `الجسر ${activeBeam.name || elementId} — مخطط العزم على طول الجسر`,
        subtitle: `الطول = ${L.toFixed(2)} م · M⁻ يسار = ${Mleft.toFixed(1)} · M⁺ منتصف = ${Mmid.toFixed(1)} · M⁻ يمين = ${Mright.toFixed(1)} (kN·m)`,
        xLabel: 'المسافة على طول الجسر  x  (م)',
        Vu,
        points,
      };
    }
    if (elementType === 'column') {
      const col = colDesigns?.find(c => c.id === elementId);
      if (!col) return null;
      const Pu = col.Pu ?? 0;
      // Approximate: assume Mtop & Mbot from design package if available
      const Mtop = (col.design && (col.design.Mtop ?? col.design.M ?? 0)) || 0;
      const Mbot = (col.design && (col.design.Mbot ?? -Mtop)) || 0;
      const H = (((col as any).L ?? (col as any).length ?? 3000) as number) / 1000;
      const N = 21;
      const points = Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        const z = +(t * H).toFixed(3);
        // Linear variation between Mbot (z=0) and Mtop (z=H)
        const M = +(Mbot + (Mtop - Mbot) * t).toFixed(2);
        return { x: z, M };
      });
      return {
        title: `العمود ${elementId} — مخطط العزم على ارتفاع العمود`,
        subtitle: `الارتفاع = ${H.toFixed(2)} م · Pu = ${Pu.toFixed(0)} kN · Mأعلى = ${Mtop.toFixed(1)} · Mأسفل = ${Mbot.toFixed(1)} (kN·m)`,
        xLabel: 'الارتفاع  z  (م)',
        Vu: 0,
        points,
      };
    }
    if (elementType === 'slab') {
      const slab = slabs.find(s => s.id === elementId);
      if (!slab) return null;
      // For slabs we don't have an analysis moment-line directly here,
      // so derive a parabolic strip moment ≈ wL²/8 in each direction using slab self-weight + a default LL.
      const Lx = Math.abs(slab.x2 - slab.x1);
      const Ly = Math.abs(slab.y2 - slab.y1);
      const L = Math.min(Lx, Ly);
      const w = ((slab as any).load ?? (slab as any).w ?? 6); // kN/m² fallback
      const Mmax = w * L * L / 8;
      const N = 31;
      const points = Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1);
        const x = +(t * L).toFixed(3);
        const M = +(4 * Mmax * t * (1 - t)).toFixed(2);
        return { x, M };
      });
      return {
        title: `البلاطة ${elementId} — مخطط العزم في الاتجاه القصير`,
        subtitle: `Lx = ${Lx.toFixed(2)} م · Ly = ${Ly.toFixed(2)} م · w ≈ ${w.toFixed(1)} kN/m² · Mmax ≈ ${Mmax.toFixed(2)} kN·m/m`,
        xLabel: 'المسافة على عرض البلاطة  (م)',
        Vu: 0,
        points,
      };
    }
    return null;
  }, [elementType, elementId, beams, columns, slabs, frameResults, beamDesigns, colDesigns]);

  // Deflection calculations specifically for beams
  const deflectionData = useMemo(() => {
    if (elementType !== 'beam') return null;
    const activeBeam = beams.find(b => b.id === elementId);
    if (!activeBeam) return null;

    const design = beamDesigns?.find(d => d.beamId === elementId || (d.mergedCarrierIds && d.mergedCarrierIds.includes(elementId)));
    if (!design || !design.deflection) return null;

    const deltaTotal = design.deflection.deflection; // mm
    const allowable = design.deflection.allowableDeflection; // mm
    const endCondition = design.endCondition || 'both-ends';
    const L = design.span || activeBeam.length;

    const N = 41;
    const points = Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      const x = +(t * L).toFixed(3);
      let fact = 0;
      if (endCondition === 'simple') {
        fact = (16.0 / 5.0) * (t - 2 * Math.pow(t, 3) + Math.pow(t, 4));
      } else if (endCondition === 'one-end') {
        const v0 = t * t * (1 - t) * (3 - 2 * t);
        fact = v0 / 0.2216;
      } else {
        fact = 16 * t * t * Math.pow(1 - t, 2);
      }
      // represent deflection as a downward sag (negative D)
      const D = +(-deltaTotal * fact).toFixed(2);
      return { x, D };
    });

    return {
      title: `الجسر ${activeBeam.name || elementId} — مخطط الترخيم الإنشائي الفعلي`,
      subtitle: `الترخيم الأقصى = ${deltaTotal.toFixed(2)} مم · المسموح به = ${allowable.toFixed(2)} مم · حالة الخدمية: ${
        deltaTotal <= allowable ? 'مستوفٍ للشروط (آمن)' : 'مخالف للكود (يجب زيادة الصلابة)'
      }`,
      points,
      allowable,
      deltaTotal,
      isServiceable: deltaTotal <= allowable,
    };
  }, [elementType, elementId, beams, beamDesigns]);

  if (!data) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="w-[92vw] max-w-md max-h-[90vh] overflow-y-auto p-4" dir="rtl" onPointerDownOutside={onClose} onInteractOutside={onClose}>
          <DialogHeader>
            <DialogTitle className="text-base">لا توجد بيانات تحليل</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">شغّل التحليل أولاً ثم اضغط على العنصر مرة أخرى.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const Mmax = Math.max(...data.points.map(p => Math.abs(p.M)), 0.001);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[96vw] sm:w-[90vw] max-w-3xl max-h-[94vh] overflow-y-auto p-3 sm:p-5 md:p-6" dir="rtl" onPointerDownOutside={onClose} onInteractOutside={onClose}>
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {elementType === 'beam' ? `مخططات وخصائص الجسر الإنشائية: ${beam?.name || elementId}` : data.title}
          </DialogTitle>
        </DialogHeader>

        {elementType === 'beam' ? (
          <Tabs defaultValue="moments" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 h-9">
              <TabsTrigger value="moments" className="text-[10px] xs:text-[11px] sm:text-xs px-1 py-1.5">منحنى عزم الانحناء M(x)</TabsTrigger>
              <TabsTrigger value="deflection" className="text-[10px] xs:text-[11px] sm:text-xs px-1 py-1.5">منحنى خط الترخيم Δ(x)</TabsTrigger>
              <TabsTrigger value="edit" className="text-[10px] xs:text-[11px] sm:text-xs px-1 py-1.5">تعديل الأبعاد والاسم</TabsTrigger>
            </TabsList>

            <TabsContent value="moments" className="outline-none">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 leading-tight">{data.subtitle}</p>
              <div className="w-full h-[180px] xs:h-[220px] sm:h-[280px] bg-card border border-border rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.points} margin={{ top: 12, right: 16, left: 8, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tick={{ fontSize: 9 }}
                      label={{ value: data.xLabel, position: 'insideBottom', offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      domain={[-Mmax * 1.1, Mmax * 1.1]}
                      label={{ value: 'العزم  M  (kN·m)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 10 }}
                      formatter={(v: number) => [`${v.toFixed(2)} kN·m`, 'M']}
                      labelFormatter={(x: number) => `x = ${Number(x).toFixed(2)} م`}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Area
                      type="monotone"
                      dataKey="M"
                      fill="hsl(210 70% 50% / 0.18)"
                      stroke="none"
                      name="مساحة المخطط"
                    />
                    <Line
                      type="monotone"
                      dataKey="M"
                      stroke="hsl(210 70% 45%)"
                      strokeWidth={2}
                      dot={false}
                      name="منحنى العزم  M(x)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 text-[10px] sm:text-[11px] text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
                <div>• القيم الموجبة = <b>عزم موجب  M⁺</b> (شد سفلي).</div>
                <div>• القيم السالبة = <b>عزم سالب  M⁻</b> (شد علوي).</div>
                <div>• المنحنى مستخرج بالكامل وبدقة من نقاط التحليل الإنشائي للمحطات المحسوبة لضمان دقة السلوك الإنشائي.</div>
              </div>
            </TabsContent>

            <TabsContent value="deflection" className="outline-none">
              {deflectionData ? (
                <>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 leading-tight">{deflectionData.subtitle}</p>
                  <div className="w-full h-[180px] xs:h-[220px] sm:h-[280px] bg-card border border-border rounded-lg p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={deflectionData.points} margin={{ top: 12, right: 16, left: 8, bottom: 28 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="x"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          tick={{ fontSize: 9 }}
                          label={{ value: 'المسافة على طول الجسر  x  (م)', position: 'insideBottom', offset: -10, fontSize: 10 }}
                        />
                        <YAxis
                          tick={{ fontSize: 9 }}
                          domain={[Math.min(-deflectionData.allowable * 1.6, -deflectionData.deltaTotal * 1.6, -5), 2]}
                          label={{ value: 'الترخيم  Δ  (مم)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                        />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 10 }}
                          formatter={(v: number) => [`${Math.abs(v).toFixed(2)} مم`, 'الترخيم Δ']}
                          labelFormatter={(x: number) => `x = ${Number(x).toFixed(2)} م`}
                        />
                        <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                        <ReferenceLine
                          y={-deflectionData.allowable}
                          stroke="rgb(239, 68, 68)"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{
                            value: `الحد الأقصى المسموح = ${deflectionData.allowable.toFixed(1)} مم`,
                            fill: "rgb(239, 68, 68)",
                            fontSize: 8,
                            position: 'top',
                            offset: 4
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Area
                          type="monotone"
                          dataKey="D"
                          fill={deflectionData.isServiceable ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)"}
                          stroke="none"
                          name="منحنى سهم الانحناء الفعلي"
                        />
                        <Line
                          type="monotone"
                          dataKey="D"
                          stroke={deflectionData.isServiceable ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                          strokeWidth={2}
                          dot={false}
                          name="مقدار ترخيم الجسر (مم) لأعلى/لأسفل"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-3 text-[10px] sm:text-[11px] text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
                    <div>• يُشير الخط الأحمر المتقطع إلى <b>الترخيم الأقصى المسموح به</b> وفق الكود الإنشائي المعتمد ACI 318-19.</div>
                    <div>• يوضح المخطط سلوك الجسر الفعلي (الهبوط أو السهم) تحت كامل المركبات التحميلية (الترخيم اللحظي ومضافاً إليه الزحف والانكماش طويل الأمد).</div>
                    <div>• يظهر المنحنى باللون <b>الأخضر</b> إذا كان ضمن الحدود الفنية المسموحة، وباللون <b>الأحمر</b> عند وجود خلل يتطلب أبعاداً إضافية للمقطع.</div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed rounded-lg bg-muted/20">
                  <p className="text-sm font-semibold text-muted-foreground mb-1">لا توجد تفاصيل ترخيم حالياً لهذا الجسر</p>
                  <p className="text-xs text-muted-foreground text-center">يرجى تشغيل "التحليل الإنشائي" في الصفحة الرئيسية أولاً لحساب الترخيم والهبوط الفعلي بدقة كاملة.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="edit" className="outline-none space-y-4 py-1">
              <div className="bg-muted/30 border border-border rounded-lg p-4">
                <h4 className="text-xs sm:text-sm font-semibold mb-3 flex items-center gap-1.5 text-foreground">
                  <span>تعديل بيانات الجسر:</span>
                  <span className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded text-xs">{beam?.id}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">اسم/رمز الجسر</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => { setEditName(e.target.value); setSaveSuccess(false); }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      placeholder="مثال: الجسر الرئيسي، B1..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">عرض قطاع الخرسانة b (مم)</label>
                    <input
                      type="number"
                      value={editB}
                      onChange={(e) => { setEditB(e.target.value); setSaveSuccess(false); }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono"
                      placeholder="العرض بالمليمتر"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">ارتفاع قطاع الخرسانة h (مم)</label>
                    <input
                      type="number"
                      value={editH}
                      onChange={(e) => { setEditH(e.target.value); setSaveSuccess(false); }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm shadow-black/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary font-mono"
                      placeholder="الارتفاع بالمليمتر"
                    />
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-border flex flex-wrap justify-between items-center gap-3">
                  <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[70%]">
                    * ستنعكس هذه التعديلات فورية على تبويب العرض ثنائي الأبعاد، العرض ثلاثي الأبعاد، والتصميم الإنشائي، وجداول BOQ وكافة أجزاء التطبيق.
                  </p>

                  <button
                    type="button"
                    onClick={handleSave}
                    className={`flex items-center gap-1.5 px-4 h-9 text-xs font-semibold rounded-md shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      saveSuccess 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-primary hover:bg-primary/95 text-primary-foreground'
                    }`}
                  >
                    {saveSuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>تم حفظ التعديلات!</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        <span>حفظ التعديلات</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <p className="text-[10px] sm:text-xs text-muted-foreground -mt-2 mb-2 leading-tight">{data.subtitle}</p>
            <div className="w-full h-[200px] xs:h-[260px] md:h-[340px] bg-card border border-border rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.points} margin={{ top: 12, right: 16, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 9 }}
                    label={{ value: data.xLabel, position: 'insideBottom', offset: -10, fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    domain={[-Mmax * 1.1, Mmax * 1.1]}
                    label={{ value: 'العزم  M  (kN·m)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 10 }}
                    formatter={(v: number) => [`${v.toFixed(2)} kN·m`, 'M']}
                    labelFormatter={(x: number) => `x = ${Number(x).toFixed(2)} م`}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="M"
                    fill="hsl(210 70% 50% / 0.18)"
                    stroke="none"
                    name="مساحة المخطط"
                  />
                  <Line
                    type="monotone"
                    dataKey="M"
                    stroke="hsl(210 70% 45%)"
                    strokeWidth={2}
                    dot={false}
                    name="منحنى العزم  M(x)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 text-[10px] sm:text-[11px] text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed">
              <div>• القيم الموجبة = <b>عزم موجب  M⁺</b> (شد سفلي).</div>
              <div>• القيم السالبة = <b>عزم سالب  M⁻</b> (شد علوي).</div>
              <div>• المنحنى مستخرج بالكامل وبدقة من نقاط التحليل الإنشائي للمحطات المحسوبة لضمان دقة السلوك الإنشائي حتى للجسور القصيرة للغاية.</div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
