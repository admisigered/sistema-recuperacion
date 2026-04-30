'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, X, CheckSquare, Square, Calendar, Phone, BookOpen, MessageSquare, TrendingUp
} from 'lucide-react';

const USUARIOS = [
  { user: 'Administrador', pass: 'admin123' },
  { user: 'Yanina', pass: '123456' },
  { user: 'Cesar', pass: '123456' },
  { user: 'Xina', pass: '123456' },
  { user: 'Fernando', pass: '123456' }
];

export default function SistemaSIGERED() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('dashboard');
  const [editingDoc, setEditingDoc] = useState(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  const [activeTab, setActiveTab] = useState(1);
  const [seguimientos, setSeguimientos] = useState([]);
  const [filters, setFilters] = useState({ search: '', sede: '', origen: '', estado: '' });

  const ITEMS_PER_PAGE = 100;

  // --- LÓGICA DE ETAPA / ESTADO (ANÁLISIS DE NEGOCIO) ---
  const getEtapaEstado = (doc) => {
    if (doc.cargado_sisged) return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    if (doc.estado_visualizacion === 'SI SE VISUALIZA') return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    if (doc.estado_visualizacion === 'NO SE VISUALIZA') {
      if (doc.origen === 'Interno') return { etapa: '4°CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
      if (!doc.numero_documento) return { etapa: '2°REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
      if (doc.ultimo_seguimiento) return { etapa: '3°SEGUIMIENTO', estado: 'EN SEGUIMIENTO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
      return { etapa: '3°SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
    }
    return { etapa: '1°VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });
    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data); setTotalDocs(count); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // CALCULO DE DATOS PARA EL GRAFICO DE LINEAS
  const chartData = useMemo(() => {
    const counts = {
      'VERIFICACION': docs.filter(d => getEtapaEstado(d).etapa.includes('1°')).length,
      'REQUERIMIENTO': docs.filter(d => getEtapaEstado(d).etapa.includes('2°')).length,
      'SEGUIMIENTO': docs.filter(d => getEtapaEstado(d).etapa.includes('3°')).length,
      'CIERRE': docs.filter(d => getEtapaEstado(d).etapa.includes('4°')).length,
    };
    const max = Math.max(...Object.values(counts), 1);
    return { counts, max };
  }, [docs]);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-[#2563EB] p-12 text-center text-white">
             <h1 className="text-4xl font-black mb-2">SIGERED</h1>
             <p className="text-xs uppercase tracking-widest opacity-80 font-sans">Recuperación de Documentos</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-5">
            <input type="text" placeholder="Usuario" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, user: e.target.value})} required />
            <input type="password" placeholder="Contraseña" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, pass: e.target.value})} required />
            <button type="submit" className="w-full bg-[#2563EB] text-white py-4 rounded-2xl font-bold">Iniciar Sesión</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20">
        <div className="p-8">
            <h1 className="text-white font-black text-2xl tracking-tighter">SIGERED</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all ${view === 'dashboard' ? 'bg-[#2563EB] text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard size={18}/> Dashboard
          </button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all ${view === 'list' ? 'bg-[#2563EB] text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <FileText size={18}/> Gestión
          </button>
          <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all ${view === 'reports' ? 'bg-[#2563EB] text-white shadow-lg' : 'hover:bg-slate-800'}`}>
            <Download size={18}/> Reportes
          </button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs">{session.user[0]}</div>
          <p className="text-xs font-bold text-white truncate flex-1">{session.user}</p>
          <button onClick={() => setSession(null)}><LogOut size={16}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER */}
        <header className="bg-white border-b p-4 flex items-center gap-4 sticky top-0 z-10 px-8 shadow-sm h-20">
          <button onClick={() => setIsNewModalOpen(true)} className="bg-[#2563EB] text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2"><Plus size={14}/> Nuevo</button>
          <label className="bg-white border border-slate-200 px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-all"><Upload size={14}/> Importar Excel <input type="file" className="hidden" onChange={handleImport}/></label>
          <div className="flex items-center gap-3 ml-auto">
            <Search size={14} className="text-slate-400"/><input type="text" placeholder="CUT / Doc..." className="bg-slate-50 border-none rounded-xl px-4 py-2 text-xs w-64 outline-none" onChange={e => setFilters({...filters, search: e.target.value})}/>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none" onChange={e => setFilters({...filters, sede: e.target.value})}><option value="">Sedes</option><option value="SC">SC</option><option value="OD">OD</option></select>
          </div>
        </header>

        <div className="p-12 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-12">
              {/* KPI CARDS */}
              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: 'TOTAL REGISTROS', val: totalDocs, color: 'text-slate-800', border: 'border-b-blue-500' },
                  { label: 'PENDIENTES', val: docs.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length, color: 'text-red-600', border: 'border-b-red-500' },
                  { label: 'EN SEGUIMIENTO', val: docs.filter(d => getEtapaEstado(d).estado === 'EN SEGUIMIENTO').length, color: 'text-orange-500', border: 'border-b-orange-500' },
                  { label: 'RECUPERADOS', val: docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length, color: 'text-green-600', border: 'border-b-green-500' }
                ].map((kpi, i) => (
                  <div key={i} className={`bg-white p-8 rounded-[20px] shadow-sm border ${kpi.border} border-b-[6px] flex flex-col gap-2`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                    <h3 className={`text-5xl font-black ${kpi.color}`}>{kpi.val}</h3>
                  </div>
                ))}
              </div>

              {/* GRÁFICO DE LÍNEAS DE AVANCE POR ETAPAS */}
              <div className="bg-white p-10 rounded-[30px] border border-slate-100 shadow-sm space-y-8">
                 <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={18} className="text-blue-600"/> Avance por Etapas</h4>
                        <p className="text-xs text-slate-400 mt-1">Tendencia de volumen de documentos en el flujo actual</p>
                    </div>
                 </div>
                 
                 <div className="relative h-64 w-full flex items-end justify-between px-4 pb-10 border-b border-slate-100">
                    {/* Líneas de cuadrícula horizontales */}
                    <div className="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none">
                       {[1,2,3,4].map(i => <div key={i} className="w-full border-t border-slate-900"></div>)}
                    </div>

                    {/* Generador de la línea SVG */}
                    <svg className="absolute inset-0 h-64 w-full" preserveAspectRatio="none">
                        <path 
                            d={`M ${0} ${256 - (chartData.counts['VERIFICACION'] / chartData.max * 180)} 
                               L ${1/3 * 100}% ${256 - (chartData.counts['REQUERIMIENTO'] / chartData.max * 180)} 
                               L ${2/3 * 100}% ${256 - (chartData.counts['SEGUIMIENTO'] / chartData.max * 180)} 
                               L ${100}% ${256 - (chartData.counts['CIERRE'] / chartData.max * 180)}`}
                            fill="none" 
                            stroke="#2563EB" 
                            strokeWidth="4"
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                        />
                    </svg>

                    {/* Puntos y Etiquetas */}
                    {['VERIFICACION', 'REQUERIMIENTO', 'SEGUIMIENTO', 'CIERRE'].map((label, idx) => (
                        <div key={label} className="relative flex flex-col items-center z-10" style={{width: '25%'}}>
                            <div 
                                className="group relative w-5 h-5 rounded-full bg-white border-4 border-blue-600 shadow-md hover:scale-150 transition-all cursor-pointer"
                                style={{ marginBottom: `${(chartData.counts[label] / chartData.max * 180)}px` }}
                            >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-bold shadow-xl">
                                    {chartData.counts[label]} docs
                                </div>
                            </div>
                            <p className="absolute bottom-0 text-[10px] font-black text-slate-400 uppercase tracking-tighter">{label}</p>
                        </div>
                    ))}
                 </div>
              </div>

              {/* RESUMEN USUARIOS */}
              <div className="grid grid-cols-3 gap-6">
                {USUARIOS.map(u => {
                  const asig = docs.filter(d => d.responsable_verificacion === u.user).length;
                  const recu = docs.filter(d => d.responsable_verificacion === u.user && getEtapaEstado(d).estado === 'RECUPERADO').length;
                  const pct = asig > 0 ? Math.round((recu / asig) * 100) : 0;
                  return (
                    <div key={u.user} className="bg-white border p-8 rounded-[24px] shadow-sm space-y-4">
                      <div className="flex justify-between font-black text-slate-700 uppercase text-xs"><span>{u.user}</span><span>{pct}%</span></div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${pct}%` }}></div></div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400"><span>ASIGNADOS: {asig}</span><span>RECUPERADOS: {recu}</span></div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
               <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-5 pl-10">CUT / Documento</th>
                    <th className="p-5 text-center">Etapa / Estado</th>
                    <th className="p-5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="p-5 pl-10"><p className="font-black text-slate-700">{doc.cut}</p><p className="text-[10px] font-bold text-slate-400 uppercase">{doc.documento}</p></td>
                        <td className="p-5"><div className="flex flex-col items-center gap-1"><span className="text-[9px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase">{status.etapa}</span><span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span></div></td>
                        <td className="p-5 text-center"><button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl">DETALLES</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DETALLES (CON LÓGICA DE SEGUIMIENTO MANTENIDA) */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-10 font-sans">
          <div className="bg-white rounded-[40px] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-white">
            <div className="p-8 bg-[#1E293B] text-white flex justify-between items-center">
              <h3 className="text-xl font-black tracking-tight">{editingDoc.cut} • {editingDoc.documento}</h3>
              <button onClick={() => setEditingDoc(null)} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20">✕</button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-72 bg-slate-50 border-r p-8 space-y-4 shrink-0">
                <button onClick={() => setActiveTab(1)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs transition-all ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>1. VERIFICACIÓN</button>
                {editingDoc.origen === 'Externo' && (
                  <>
                    <button onClick={() => setActiveTab(2)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs transition-all ${activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>2. REQUERIMIENTO</button>
                    <button onClick={() => setActiveTab(3)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs transition-all ${activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>3. SEGUIMIENTO ({seguimientos.length})</button>
                  </>
                )}
                <button onClick={() => setActiveTab(4)} className={`w-full text-left p-5 rounded-[24px] font-black text-xs transition-all ${activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>4. CIERRE</button>
              </div>
              <div className="flex-1 p-12 overflow-y-auto">
                {activeTab === 3 && (
                    <div className="space-y-8 animate-in fade-in">
                        <div className="bg-slate-50 p-8 rounded-[32px] space-y-4">
                            <textarea id="seg_obs" className="w-full p-5 rounded-[24px] border bg-white text-sm outline-none" rows="3" placeholder="Anotar nuevo seguimiento..."></textarea>
                            <button onClick={async () => {
                                const obs = document.getElementById('seg_obs').value;
                                if (!obs) return alert("Escriba una observación");
                                const { error } = await supabase.from('seguimientos').insert([{ documento_id: editingDoc.id, responsable: session.user, observaciones: obs, fecha: new Date().toISOString() }]);
                                if (!error) { 
                                    await supabase.from('documentos').update({ ultimo_seguimiento: new Date().toISOString() }).eq('id', editingDoc.id);
                                    alert("Guardado"); fetchDocs();
                                }
                            }} className="bg-blue-600 text-white font-black py-4 px-10 rounded-2xl text-xs uppercase">Grabar Registro</button>
                        </div>
                        {seguimientos.map(s => (
                            <div key={s.id} className="p-6 border rounded-[28px] flex items-start gap-4 bg-white shadow-sm">
                                <div className="bg-blue-100 p-3 rounded-xl text-blue-600"><MessageSquare size={18}/></div>
                                <div><p className="text-xs font-black">{s.responsable} <span className="text-slate-400 font-normal ml-2">{new Date(s.fecha).toLocaleDateString()}</span></p><p className="text-sm text-slate-600 mt-1">{s.observaciones}</p></div>
                            </div>
                        ))}
                    </div>
                )}
                {/* Las demás pestañas mantienen la lógica ya establecida anteriormente */}
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t flex justify-end gap-5">
              <button onClick={async () => {
                await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                alert('Guardado'); setEditingDoc(null); fetchDocs();
              }} className="bg-[#2563EB] text-white px-16 py-5 rounded-[24px] font-black text-xs uppercase shadow-2xl">Sincronizar Cambios</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
