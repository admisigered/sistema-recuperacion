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
  const [selectedIds, setSelectedIds] = useState([]);

  // --- FILTROS CONECTADOS (AFECTAN DASHBOARD Y GESTIÓN) ---
  const [filters, setFilters] = useState({ 
    search: '', 
    sede: '', 
    origen: '', 
    estado: '', 
    etapa: '', 
    responsable: '' 
  });

  const ITEMS_PER_PAGE = 100;

  // --- LÓGICA DE ETAPA / ESTADO (ANÁLISIS DE NEGOCIO MANTENIDO) ---
  const getEtapaEstado = useCallback((doc) => {
    if (!doc) return { etapa: '-', estado: '-', color: 'bg-slate-100', border: 'border-slate-300' };
    if (doc.cargado_sisged) return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    if (doc.estado_visualizacion === 'SI SE VISUALIZA') return { etapa: '4°CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };
    if (doc.estado_visualizacion === 'NO SE VISUALIZA') {
      if (doc.origen === 'Interno') return { etapa: '4°CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
      if (!doc.numero_documento) return { etapa: '2°REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
      if (doc.ultimo_seguimiento) return { etapa: '3°SEGUIMIENTO', estado: 'EN SEGUIMIENTO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
      return { etapa: '3°SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
    }
    return { etapa: '1°VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Credenciales incorrectas');
  };

  // --- CONSULTA CON TODOS LOS FILTROS ACTIVO ---
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);
    if (filters.estado) query = query.eq('estado_final', filters.estado);
    if (filters.etapa) query = query.eq('etapa_actual', filters.etapa);
    if (filters.responsable) query = query.eq('responsable_verificacion', filters.responsable);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data || []); setTotalDocs(count || 0); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { if (session) fetchDocs(); }, [session, fetchDocs]);

  // CALCULO SEGURO PARA EL GRAFICO
  const chartData = useMemo(() => {
    const counts = {
      'VERIFICACION': docs.filter(d => getEtapaEstado(d).etapa.includes('1°')).length,
      'REQUERIMIENTO': docs.filter(d => getEtapaEstado(d).etapa.includes('2°')).length,
      'SEGUIMIENTO': docs.filter(d => getEtapaEstado(d).etapa.includes('3°')).length,
      'CIERRE': docs.filter(d => getEtapaEstado(d).etapa.includes('4°')).length,
    };
    const max = Math.max(...Object.values(counts), 1);
    return { counts, max };
  }, [docs, getEtapaEstado]);

  const handleImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]], { header: 1 });
      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: row[4], origen: row[5], procedimiento: row[6], celular: String(row[7] || ''),
        responsable_verificacion: row[8], fecha_verificacion: row[9], estado_visualizacion: row[11],
        numero_documento: String(row[15] || ''), cargado_sisged: String(row[27]).toUpperCase() === 'SI',
        estado_final: row[28], creado_at: new Date().toISOString()
      })).filter(d => d.cut);
      await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      fetchDocs();
    };
    reader.readAsBinaryString(file);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-[#2563EB] p-12 text-center text-white">
             <h1 className="text-4xl font-black mb-2">SIGERED</h1>
             <p className="text-xs uppercase tracking-widest opacity-80">Recuperación de Documentos</p>
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
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs">{session?.user?.[0]}</div>
          <p className="text-xs font-bold text-white truncate flex-1">{session?.user}</p>
          <button onClick={() => setSession(null)}><LogOut size={16}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER CON TODOS LOS FILTROS SOLICITADOS */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 px-8 shadow-sm h-auto min-h-[80px]">
          <button onClick={() => setIsNewModalOpen(true)} className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Plus size={14}/> Nuevo</button>
          <label className="bg-white border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50"><Upload size={14}/> Importar <input type="file" className="hidden" onChange={handleImport}/></label>
          
          {/* BARRA DE FILTROS DINÁMICOS */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
                <input type="text" placeholder="CUT / Doc..." className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2 text-xs w-40 outline-none focus:ring-2 focus:ring-blue-500" onChange={e => setFilters({...filters, search: e.target.value})}/>
            </div>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none cursor-pointer" onChange={e => setFilters({...filters, sede: e.target.value})}>
                <option value="">Sedes</option><option value="SC">SC</option><option value="OD">OD</option>
            </select>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none cursor-pointer" onChange={e => setFilters({...filters, origen: e.target.value})}>
                <option value="">Origen</option><option value="Interno">Interno</option><option value="Externo">Externo</option>
            </select>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none cursor-pointer" onChange={e => setFilters({...filters, estado: e.target.value})}>
                <option value="">Estado</option><option value="PENDIENTE">PENDIENTE</option><option value="RECUPERADO">RECUPERADO</option><option value="RECONSTRUCCION">RECONSTRUCCION</option>
            </select>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none cursor-pointer" onChange={e => setFilters({...filters, etapa: e.target.value})}>
                <option value="">Etapa</option><option value="1°VERIFICACION">1. Verificación</option><option value="2°REQUERIMIENTO">2. Requerimiento</option><option value="3°SEGUIMIENTO">3. Seguimiento</option><option value="4°CIERRE">4. Cierre</option>
            </select>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none cursor-pointer" onChange={e => setFilters({...filters, responsable: e.target.value})}>
                <option value="">Responsable</option>{USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
            </select>
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

              {/* GRÁFICO DE LÍNEAS */}
              <div className="bg-white p-10 rounded-[30px] border border-slate-100 shadow-sm">
                 <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 mb-8"><TrendingUp size={18} className="text-blue-600"/> Avance por Etapas</h4>
                 <div className="relative h-48 w-full border-b border-l border-slate-100 flex items-end">
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                        <path d={`M 50 ${100 - (chartData.counts['VERIFICACION'] / chartData.max * 80)} L 150 ${100 - (chartData.counts['REQUERIMIENTO'] / chartData.max * 80)} L 250 ${100 - (chartData.counts['SEGUIMIENTO'] / chartData.max * 80)} L 350 ${100 - (chartData.counts['CIERRE'] / chartData.max * 80)}`} fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        {[50, 150, 250, 350].map((x, i) => {
                            const labels = ['VERIFICACION', 'REQUERIMIENTO', 'SEGUIMIENTO', 'CIERRE'];
                            const y = 100 - (chartData.counts[labels[i]] / chartData.max * 80);
                            return <circle key={i} cx={x} cy={y} r="4" fill="white" stroke="#2563EB" strokeWidth="3" />
                        })}
                    </svg>
                    <div className="absolute inset-x-0 -bottom-8 flex justify-between px-[10%] text-[9px] font-black text-slate-400 uppercase">
                        <span>Verificación</span><span>Requerimiento</span><span>Seguimiento</span><span>Cierre</span>
                    </div>
                 </div>
              </div>

              {/* AVANCE USUARIOS */}
              <div className="grid grid-cols-3 gap-6">
                {USUARIOS.map(u => {
                  const asig = docs.filter(d => d.responsable_verificacion === u.user).length;
                  const recu = docs.filter(d => d.responsable_verificacion === u.user && getEtapaEstado(d).estado === 'RECUPERADO').length;
                  const pct = asig > 0 ? Math.round((recu / asig) * 100) : 0;
                  return (
                    <div key={u.user} className="bg-white border p-8 rounded-[24px] shadow-sm space-y-4">
                      <div className="flex justify-between font-black text-slate-700 uppercase text-xs"><span>{u.user}</span><span>{pct}%</span></div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${pct}%` }}></div></div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase"><span>ASIGNADOS: {asig}</span><span>RECUPERADOS: {recu}</span></div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* VISTA GESTIÓN ACTUALIZADA CON CAMPO ORIGEN */
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
               <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-5 pl-8 w-10 text-center"><Square size={18} className="text-slate-300 mx-auto"/></th>
                    <th className="p-5">CUT / Documento</th>
                    <th className="p-5 text-center">Sede</th>
                    <th className="p-5 text-center">Origen</th>
                    <th className="p-5 text-center">Etapa / Estado</th>
                    <th className="p-5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {docs.map(doc => {
                    const status = getEtapaEstado(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-all">
                        <td className="p-5 text-center"><Square size={18} className="text-slate-200 mx-auto"/></td>
                        <td className="p-5 pl-4">
                            <p className="font-black text-slate-700">{doc.cut}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[300px]">{doc.documento}</p>
                        </td>
                        <td className="p-5 text-center font-black text-[10px] text-slate-600">{doc.sede}</td>
                        <td className="p-5 text-center">
                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${doc.origen === 'Interno' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {doc.origen || 'EXTERNO'}
                            </span>
                        </td>
                        <td className="p-5">
                           <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase">{status.etapa}</span>
                              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span>
                           </div>
                        </td>
                        <td className="p-5 text-center">
                          <button onClick={() => setEditingDoc(doc)} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-4 py-2 rounded-xl shadow-sm hover:bg-blue-600 hover:text-white transition-all uppercase tracking-widest">Detalles</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      
      {/* MODAL DETALLES MANTENIDO SEGÚN LÓGICA ANTERIOR */}
      {/* ... (resto del código de modales) ... */}
    </div>
  );
}
