'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, FileText, Upload, Download, Search, 
  LogOut, ChevronLeft, ChevronRight, Save, Plus, Clock, 
  CheckCircle2, AlertCircle, Trash2, Filter, X, CheckSquare, Square, Calendar, Phone, BookOpen, MessageSquare, BarChart3
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
  const [filters, setFilters] = useState({ search: '', sede: '', origen: '', estado: '', etapa: '', responsable: '' });

  const ITEMS_PER_PAGE = 100;

  // --- LÓGICA DE ETAPA / ESTADO (ANÁLISIS DE NEGOCIO EXACTO) ---
  const getEtapaEstado = useCallback((doc) => {
    if (!doc) return { etapa: '-', estado: '-', color: 'bg-slate-100', border: 'border-slate-300' };
    
    // REGLA SISGED -> CIERRE / RECUPERADO
    if (doc.cargado_sisged) return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };

    // REGLA SI SE VISUALIZA -> CIERRE / RECUPERADO
    if (doc.estado_visualizacion === 'SI SE VISUALIZA') return { etapa: 'CIERRE', estado: 'RECUPERADO', color: 'bg-green-100 text-green-700', border: 'border-green-500' };

    // REGLA NO SE VISUALIZA
    if (doc.estado_visualizacion === 'NO SE VISUALIZA') {
      if (doc.origen === 'Interno') {
        return { etapa: 'CIERRE', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
      } else {
        // FLUJO EXTERNO
        if (!doc.numero_documento) return { etapa: 'REQUERIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
        if (doc.ultimo_seguimiento) return { etapa: 'SEGUIMIENTO', estado: 'EN PROCESO', color: 'bg-orange-100 text-orange-700', border: 'border-orange-500' };
        return { etapa: 'SEGUIMIENTO', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
      }
    }

    // ESTADO INICIAL
    return { etapa: 'VERIFICACION', estado: 'PENDIENTE', color: 'bg-red-100 text-red-700', border: 'border-red-500' };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    const valid = USUARIOS.find(u => u.user === loginData.user && u.pass === loginData.pass);
    if (valid) setSession(valid); else alert('Usuario o contraseña incorrectos');
  };

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    let from = (page - 1) * ITEMS_PER_PAGE;
    let to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from('documentos').select('*', { count: 'exact' });

    if (filters.search) query = query.or(`cut.ilike.%${filters.search}%,documento.ilike.%${filters.search}%`);
    if (filters.sede) query = query.eq('sede', filters.sede);
    if (filters.origen) query = query.eq('origen', filters.origen);
    if (filters.estado) query = query.eq('estado_final', filters.estado);
    if (filters.responsable) query = query.eq('responsable_verificacion', filters.responsable);

    const { data, count, error } = await query.order('creado_at', { ascending: false }).range(from, to);
    if (!error) { setDocs(data || []); setTotalDocs(count || 0); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { if (session) fetchDocs(); }, [session, fetchDocs]);

  useEffect(() => {
    if (editingDoc?.id) {
      supabase.from('seguimientos').select('*').eq('documento_id', editingDoc.id).order('fecha', { ascending: false })
        .then(({ data }) => setSeguimientos(data || []));
    }
  }, [editingDoc]);

  const chartData = useMemo(() => {
    const counts = {
      'VERIFICACION': docs.filter(d => getEtapaEstado(d).etapa === 'VERIFICACION').length,
      'REQUERIMIENTO': docs.filter(d => getEtapaEstado(d).etapa === 'REQUERIMIENTO').length,
      'SEGUIMIENTO': docs.filter(d => getEtapaEstado(d).etapa === 'SEGUIMIENTO').length,
      'CIERRE': docs.filter(d => getEtapaEstado(d).etapa === 'CIERRE').length,
    };
    const max = Math.max(...Object.values(counts), 1);
    return { counts, max };
  }, [docs, getEtapaEstado]);

  const toggleSelectAll = () => setSelectedIds(selectedIds.length === docs.length ? [] : docs.map(d => d.id));
  const toggleSelectDoc = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleDelete = async (id) => {
    if (confirm("¿Está seguro de eliminar este registro?")) {
        const { error } = await supabase.from('documentos').delete().eq('id', id);
        if (!error) fetchDocs();
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`¿Eliminar ${selectedIds.length} registros seleccionados?`)) {
        const { error } = await supabase.from('documentos').delete().in('id', selectedIds);
        if (!error) { setSelectedIds([]); fetchDocs(); }
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]], { header: 1 });
      const batch = data.slice(1).map(row => ({
        sede: row[0], cut: String(row[1] || ''), documento: String(row[2] || ''), remitente: row[3],
        fecha_registro: row[4], origen: row[5], responsable_verificacion: row[8],
        cargado_sisged: String(row[27]).toUpperCase() === 'SI', estado_final: row[28], creado_at: new Date().toISOString()
      })).filter(d => d.cut);
      await supabase.from('documentos').upsert(batch, { onConflict: 'cut,documento' });
      fetchDocs();
    };
    reader.readAsBinaryString(file);
  };

  const handleExport = (all = false) => {
    const ws = XLSX.utils.json_to_sheet(docs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SIGERED");
    XLSX.writeFile(wb, `Reporte_${all ? 'General' : 'Filtrado'}.xlsx`);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-white">
          <div className="bg-[#2563EB] p-12 text-center text-white">
             <h1 className="text-4xl font-black mb-2 tracking-tighter">SIGERED</h1>
             <p className="text-xs uppercase tracking-widest opacity-80">Gestión de Recuperación</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-5">
            <input type="text" placeholder="Usuario" className="w-full p-4 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, user: e.target.value})} required />
            <input type="password" placeholder="Contraseña" className="w-full p-4 border rounded-2xl outline-none" onChange={e => setLoginData({...loginData, pass: e.target.value})} required />
            <button type="submit" className="w-full bg-[#2563EB] text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">ENTRAR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-900 font-sans">
      <aside className="w-64 bg-[#1E293B] text-slate-400 flex flex-col fixed h-full z-20">
        <div className="p-8"><h1 className="text-white font-black text-2xl tracking-tighter">SIGERED</h1></div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all ${view === 'dashboard' ? 'bg-[#2563EB] text-white shadow-lg' : 'hover:bg-slate-800'}`}><LayoutDashboard size={18}/> Dashboard</button>
          <button onClick={() => setView('list')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all ${view === 'list' ? 'bg-[#2563EB] text-white shadow-lg' : 'hover:bg-slate-800'}`}><FileText size={18}/> Gestión</button>
          <button onClick={() => setView('reports')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all ${view === 'reports' ? 'bg-[#2563EB] text-white shadow-lg' : 'hover:bg-slate-800'}`}><Download size={18}/> Reportes</button>
        </nav>
        <div className="p-6 border-t border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs">{session?.user?.[0]}</div>
          <p className="text-xs font-bold text-white truncate flex-1">{session?.user}</p>
          <button onClick={() => setSession(null)}><LogOut size={16}/></button>
        </div>
      </aside>

      <main className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER */}
        <header className="bg-white border-b p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10 px-8 shadow-sm h-auto min-h-[80px]">
          <div className="flex gap-2 mr-auto">
            <button onClick={() => setIsNewModalOpen(true)} className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm"><Plus size={14}/> Nuevo</button>
            <label className="bg-white border border-slate-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50 shadow-sm"><Upload size={14}/> Importar Excel <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImport}/></label>
            {selectedIds.length > 0 && (
                <button onClick={handleBulkDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg"><Trash2 size={14}/> Eliminar Masivo ({selectedIds.length})</button>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><input type="text" placeholder="CUT / Doc..." className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2 text-xs w-32 outline-none focus:ring-2 focus:ring-blue-500" onChange={e => setFilters({...filters, search: e.target.value})}/></div>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none cursor-pointer" onChange={e => setFilters({...filters, etapa: e.target.value})}>
                <option value="">Etapas</option>
                <option value="VERIFICACION">Verificación</option>
                <option value="REQUERIMIENTO">Requerimiento</option>
                <option value="SEGUIMIENTO">Seguimiento</option>
                <option value="CIERRE">Cierre</option>
            </select>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none" onChange={e => setFilters({...filters, sede: e.target.value})}><option value="">Sedes</option><option value="SC">SC</option><option value="OD">OD</option></select>
            <select className="bg-slate-50 border-none rounded-xl p-2 text-[10px] font-black uppercase outline-none" onChange={e => setFilters({...filters, estado: e.target.value})}><option value="">Estado</option><option value="PENDIENTE">PENDIENTE</option><option value="RECUPERADO">RECUPERADO</option></select>
          </div>
        </header>

        <div className="p-12 overflow-y-auto flex-1">
          {view === 'dashboard' ? (
            <div className="space-y-12 animate-in fade-in">
              {/* KPI CARDS (DISEÑO SOLICITADO) */}
              <div className="grid grid-cols-4 gap-8">
                {[
                  { label: 'TOTAL REGISTROS', val: totalDocs, color: 'text-slate-800', border: 'border-b-blue-500' },
                  { label: 'PENDIENTES', val: docs.filter(d => getEtapaEstado(d).estado === 'PENDIENTE').length, color: 'text-red-600', border: 'border-b-red-500' },
                  { label: 'EN SEGUIMIENTO', val: docs.filter(d => getEtapaEstado(d).estado === 'EN PROCESO').length, color: 'text-orange-500', border: 'border-b-orange-500' },
                  { label: 'RECUPERADOS', val: docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length, color: 'text-green-600', border: 'border-b-green-500' }
                ].map((kpi, i) => (
                  <div key={i} className={`bg-white p-8 rounded-[20px] shadow-sm border ${kpi.border} border-b-[6px] flex flex-col gap-2`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                    <h3 className={`text-5xl font-black ${kpi.color}`}>{kpi.val}</h3>
                  </div>
                ))}
              </div>

              {/* GRÁFICO DE BARRAS (Mitad de vista) */}
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-6 bg-white p-10 rounded-[30px] border border-slate-100 shadow-sm flex flex-col">
                  <h4 className="text-sm font-black text-slate-700 uppercase mb-8 flex items-center gap-2"><BarChart3 size={18} className="text-blue-600"/> Avance por Etapas</h4>
                  <div className="flex-1 flex items-end justify-around gap-4 h-64 border-b border-l border-slate-100 px-6 pb-2">
                    {['VERIFICACION', 'REQUERIMIENTO', 'SEGUIMIENTO', 'CIERRE'].map((etapa) => {
                      const count = chartData.counts[etapa];
                      const height = (count / chartData.max) * 100;
                      return (
                        <div key={etapa} className="relative flex-1 flex flex-col items-center group">
                          <div className="w-full bg-blue-600 rounded-t-xl transition-all duration-700 hover:bg-blue-700 cursor-pointer shadow-lg shadow-blue-900/10" style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}></div>
                          <p className="absolute -bottom-8 text-[9px] font-black text-slate-400 uppercase text-center w-full">{etapa}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="col-span-6 space-y-6">
                    <div className="bg-blue-600 p-8 rounded-[30px] text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h4 className="text-xs font-black uppercase tracking-widest opacity-80 mb-2">Indicador de Éxito</h4>
                            <h3 className="text-4xl font-black">{totalDocs > 0 ? Math.round((docs.filter(d => getEtapaEstado(d).estado === 'RECUPERADO').length / totalDocs) * 100) : 0}%</h3>
                            <p className="text-xs mt-2 opacity-70">Documentos recuperados satisfactoriamente del total de registros.</p>
                        </div>
                        <CheckCircle2 size={120} className="absolute -right-4 -bottom-4 text-white/10" />
                    </div>
                </div>
              </div>

              {/* AVANCE USUARIOS (DISEÑO SOLICITADO) */}
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
          ) : view === 'list' ? (
            /* TABLA DE GESTIÓN CON CASILLAS FUNCIONALES */
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
               <table className="w-full text-left">
                <thead className="bg-slate-50 border-b text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-5 pl-8 w-16 text-center">
                        <button onClick={toggleSelectAll} className="hover:scale-110 transition-transform">
                            {selectedIds.length === docs.length && docs.length > 0 ? <CheckSquare size={20} className="text-blue-600 mx-auto"/> : <Square size={20} className="text-slate-300 mx-auto"/>}
                        </button>
                    </th>
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
                    const isSelected = selectedIds.includes(doc.id);
                    return (
                      <tr key={doc.id} className={`hover:bg-slate-50/80 transition-all ${isSelected ? 'bg-blue-50/50' : ''}`}>
                        <td className="p-5 text-center">
                            <button onClick={() => toggleSelectDoc(doc.id)} className="hover:scale-110 transition-transform">
                                {isSelected ? <CheckSquare size={20} className="text-blue-600 mx-auto"/> : <Square size={20} className="text-slate-200 mx-auto"/>}
                            </button>
                        </td>
                        <td className="p-5 pl-4"><p className="font-black text-slate-700">{doc.cut}</p><p className="text-[10px] font-bold text-slate-400 uppercase truncate max-w-[300px]">{doc.documento}</p></td>
                        <td className="p-5 text-center font-black text-[10px] text-slate-600">{doc.sede}</td>
                        <td className="p-5 text-center"><span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${doc.origen === 'Interno' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{doc.origen || 'EXTERNO'}</span></td>
                        <td className="p-5">
                           <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase">{status.etapa}</span>
                              <span className={`text-[10px] font-black px-4 py-1.5 rounded-xl border shadow-sm uppercase ${status.color}`}>{status.estado}</span>
                           </div>
                        </td>
                        <td className="p-5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { setEditingDoc(doc); setActiveTab(1); }} className="bg-white border-2 border-blue-50 text-blue-600 font-black text-[10px] px-3 py-2 rounded-xl hover:bg-blue-600 hover:text-white transition-all uppercase tracking-widest">Detalles</button>
                            <button onClick={() => handleDelete(doc.id)} className="bg-white border-2 border-red-50 text-red-500 p-2 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="p-8 bg-slate-50 flex justify-between items-center border-t border-slate-100">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Página {page} - {totalDocs} registros</p>
                <div className="flex gap-4">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30"><ChevronLeft size={18}/></button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= totalDocs} className="w-10 h-10 rounded-xl bg-white border flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30"><ChevronRight size={18}/></button>
                </div>
              </div>
            </div>
          ) : (
            /* MÓDULO DE REPORTES */
            <div className="max-w-3xl mx-auto py-10 animate-in zoom-in-95">
              <div className="bg-white p-16 rounded-[48px] border shadow-xl text-center space-y-8">
                <div className="bg-blue-50 w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto text-blue-600"><Download size={40}/></div>
                <h2 className="text-3xl font-black text-slate-800">Exportación de Datos</h2>
                <div className="grid grid-cols-2 gap-6 pt-6">
                  <button onClick={() => handleExport(false)} className="bg-white border-2 border-slate-100 p-8 rounded-[32px] font-black text-sm hover:border-blue-600 hover:text-blue-600 transition-all">Reporte Filtrado</button>
                  <button onClick={() => handleExport(true)} className="bg-blue-600 text-white p-8 rounded-[32px] font-black text-sm hover:bg-blue-700 shadow-2xl shadow-blue-200">Reporte General</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- MODAL DETALLES COMPLETO (INCLUIDO SIN RECORTES) --- */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-10">
          <div className="bg-white rounded-[40px] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-white">
            <div className="p-8 bg-[#1E293B] text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-black tracking-tight">{editingDoc.cut} • {editingDoc.documento}</h3>
                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">Origen: {editingDoc.origen}</p>
              </div>
              <button onClick={() => setEditingDoc(null)} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all font-bold">✕</button>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
              <div className="w-72 bg-slate-50 border-r p-8 space-y-4 shrink-0 font-sans">
                <button onClick={() => setActiveTab(1)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 1 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>VERIFICACIÓN</button>
                {editingDoc.origen === 'Externo' && (
                  <>
                    <button onClick={() => setActiveTab(2)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 2 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>REQUERIMIENTO</button>
                    <button onClick={() => setActiveTab(3)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 3 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>SEGUIMIENTO ({seguimientos.length})</button>
                  </>
                )}
                <button onClick={() => setActiveTab(4)} className={`w-full text-left p-6 rounded-[24px] font-black text-xs transition-all ${activeTab === 4 ? 'bg-white border-2 border-blue-600 text-blue-700 shadow-xl' : 'text-slate-400'}`}>CIERRE</button>
              </div>

              <div className="flex-1 p-12 overflow-y-auto bg-white">
                {activeTab === 1 && (
                  <div className="grid grid-cols-2 gap-10 animate-in fade-in">
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsable</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.responsable_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, responsable_verificacion: e.target.value})}>
                        <option value="">Seleccione...</option>{USUARIOS.map(u => <option key={u.user} value={u.user}>{u.user}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Verificación</label>
                      <input type="date" className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs" value={editingDoc.fecha_verificacion || ''} onChange={e => setEditingDoc({...editingDoc, fecha_verificacion: e.target.value})}/>
                    </div>
                    <div className="col-span-2 space-y-4 pt-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase text-center mb-4 tracking-[0.2em]">¿Se visualiza en el sistema?</p>
                      <div className="grid grid-cols-2 gap-6">
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'SI SE VISUALIZA'})} className={`p-8 rounded-[32px] border-2 font-black transition-all ${editingDoc.estado_visualizacion === 'SI SE VISUALIZA' ? 'border-green-600 bg-green-50 text-green-700 shadow-lg' : 'border-slate-50 bg-slate-50 text-slate-300'}`}>SÍ SE VISUALIZA</button>
                        <button onClick={() => setEditingDoc({...editingDoc, estado_visualizacion: 'NO SE VISUALIZA'})} className={`p-8 rounded-[32px] border-2 font-black transition-all ${editingDoc.estado_visualizacion === 'NO SE VISUALIZA' ? 'border-red-600 bg-red-50 text-red-700 shadow-lg' : 'border-slate-50 bg-slate-50 text-slate-300'}`}>NO SE VISUALIZA</button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 3 && (
                  <div className="space-y-10 animate-in fade-in">
                    <div className="bg-slate-50 p-10 rounded-[40px] space-y-6 border border-slate-200">
                      <h4 className="font-black text-xs uppercase text-slate-600 tracking-widest">Registrar Seguimiento</h4>
                      <textarea id="s_obs" className="w-full p-5 rounded-2xl border bg-white text-sm outline-none font-medium" rows="3" placeholder="Escriba aquí los detalles..."></textarea>
                      <button onClick={async () => {
                        const o = document.getElementById('s_obs').value;
                        if(!o) return alert("Escriba un detalle.");
                        const { error } = await supabase.from('seguimientos').insert([{ documento_id: editingDoc.id, responsable: session.user, observaciones: o, fecha: new Date().toISOString() }]);
                        if(!error) { 
                          await supabase.from('documentos').update({ ultimo_seguimiento: new Date().toISOString() }).eq('id', editingDoc.id);
                          document.getElementById('s_obs').value = ''; alert("Registro Exitoso"); fetchDocs();
                        }
                      }} className="bg-blue-600 text-white font-black py-4 px-10 rounded-2xl text-xs uppercase shadow-xl shadow-blue-900/20 tracking-widest">Grabar Registro</button>
                    </div>
                    <div className="space-y-6 font-sans">
                       {seguimientos.map(s => (
                         <div key={s.id} className="p-6 border rounded-[28px] flex items-start gap-5 bg-white shadow-sm">
                           <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shrink-0"><MessageSquare size={20}/></div>
                           <div><p className="text-xs font-black text-slate-800">{s.responsable} <span className="text-slate-400 font-normal ml-3">{new Date(s.fecha).toLocaleDateString()}</span></p><p className="text-sm text-slate-500 mt-2 leading-relaxed">{s.observaciones}</p></div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                {activeTab === 4 && (
                  <div className="grid grid-cols-2 gap-10 animate-in fade-in">
                    <div className="col-span-2 bg-emerald-50 p-10 rounded-[40px] border border-emerald-100 flex items-center gap-6">
                       <input type="checkbox" className="w-10 h-10 accent-emerald-600 rounded-2xl shadow-sm cursor-pointer" checked={editingDoc.cargado_sisged} onChange={e => setEditingDoc({...editingDoc, cargado_sisged: e.target.checked})}/>
                       <label className="font-black text-emerald-900 uppercase text-xs tracking-widest">¿Se cargó al portal SISGED? (MARCA SI)</label>
                    </div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Final</label>
                      <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-xs uppercase" value={editingDoc.estado_final || 'PENDIENTE'} onChange={e => setEditingDoc({...editingDoc, estado_final: e.target.value})}>
                        <option value="PENDIENTE">PENDIENTE</option><option value="RECUPERADO">RECUPERADO</option><option value="RECONSTRUCCION">RECONSTRUCCION</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-10 bg-slate-50 border-t flex justify-end gap-5 shrink-0">
              <button onClick={() => setEditingDoc(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-10">Descartar</button>
              <button onClick={async () => {
                const { error } = await supabase.from('documentos').update(editingDoc).eq('id', editingDoc.id);
                if (!error) { alert('Sincronización Exitosa'); setEditingDoc(null); fetchDocs(); }
              }} className="bg-blue-600 text-white px-16 py-5 rounded-[24px] font-black text-xs uppercase shadow-2xl shadow-blue-900/20 tracking-widest">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
